import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const DAILY_SESSION_LIMIT = 3;
const SESSION_TTL_SECONDS = 24 * 60 * 60;

type SessionRecord = {
  ipHash: string;
  expiresAt: number;
  interviewTurns: number;
  searches: number;
  researchedHotels: number;
  analyses: number;
};

type TokenPayload = {
  sessionId: string;
  ipHash: string;
  expiresAt: number;
};

type SessionField = "interviewTurns" | "searches" | "researchedHotels" | "analyses";

export class LiveQuotaError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
  }
}

const localCounters = new Map<string, { value: number; expiresAt: number }>();
const localSessions = new Map<string, SessionRecord>();

function quotaSecret(): string {
  const configured = process.env.STAYLIGHT_RATE_LIMIT_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "staylight-local-development-only";
  throw new LiveQuotaError(
    "Live mode is temporarily unavailable because the production quota secret is not configured.",
    503,
    "quota_not_configured"
  );
}

function redisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function requirePersistentStoreInProduction() {
  if (process.env.NODE_ENV === "production" && !redisConfigured()) {
    throw new LiveQuotaError(
      "Live mode is temporarily unavailable because persistent usage limits are not configured.",
      503,
      "quota_store_not_configured"
    );
  }
}

async function redisCommand(command: Array<string | number>): Promise<unknown> {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!baseUrl || !token) throw new Error("Redis is not configured.");

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(command),
    cache: "no-store"
  });
  if (!response.ok) throw new LiveQuotaError("Live usage tracking is temporarily unavailable.", 503, "quota_store_error");
  const payload = await response.json() as { result?: unknown; error?: string };
  if (payload.error) throw new LiveQuotaError("Live usage tracking is temporarily unavailable.", 503, "quota_store_error");
  return payload.result;
}

function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function requestIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "local";
}

function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex");
}

function encodePayload(payload: TokenPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function signPayload(encoded: string, secret: string): string {
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

export function createLiveSessionToken(payload: TokenPayload, secret: string): string {
  const encoded = encodePayload(payload);
  return `${encoded}.${signPayload(encoded, secret)}`;
}

export function verifyLiveSessionToken(token: string, secret: string, now = Date.now()): TokenPayload | null {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = signPayload(encoded, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TokenPayload;
    if (!payload.sessionId || !payload.ipHash || !Number.isFinite(payload.expiresAt) || payload.expiresAt <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

async function incrementDailyCounter(key: string, now: number): Promise<number> {
  if (redisConfigured()) {
    const value = Number(await redisCommand(["INCR", key]));
    if (value === 1) await redisCommand(["EXPIRE", key, SESSION_TTL_SECONDS * 2]);
    return value;
  }

  const current = localCounters.get(key);
  const nextValue = !current || current.expiresAt <= now ? 1 : current.value + 1;
  localCounters.set(key, { value: nextValue, expiresAt: now + SESSION_TTL_SECONDS * 1000 });
  return nextValue;
}

async function saveSession(sessionId: string, session: SessionRecord): Promise<void> {
  if (redisConfigured()) {
    await redisCommand(["SET", `staylight:live:session:${sessionId}`, JSON.stringify(session), "EX", SESSION_TTL_SECONDS]);
    return;
  }
  localSessions.set(sessionId, session);
}

async function readSession(sessionId: string): Promise<SessionRecord | null> {
  if (redisConfigured()) {
    const value = await redisCommand(["GET", `staylight:live:session:${sessionId}`]);
    if (typeof value !== "string") return null;
    try {
      return JSON.parse(value) as SessionRecord;
    } catch {
      return null;
    }
  }
  return localSessions.get(sessionId) ?? null;
}

export type LiveSession = {
  token: string;
  sessionId: string;
  expiresAt: number;
};

export async function getOrCreateLiveSession(request: Request, token?: string): Promise<LiveSession> {
  requirePersistentStoreInProduction();
  const secret = quotaSecret();
  const now = Date.now();
  const ipHash = hashIp(requestIp(request), secret);

  if (token) {
    const payload = verifyLiveSessionToken(token, secret, now);
    if (!payload || payload.ipHash !== ipHash) {
      throw new LiveQuotaError("This Live session is invalid or has expired. Start a new search.", 401, "invalid_live_session");
    }
    const stored = await readSession(payload.sessionId);
    if (!stored || stored.ipHash !== ipHash || stored.expiresAt <= now) {
      throw new LiveQuotaError("This Live session has expired. Start a new search.", 401, "expired_live_session");
    }
    return { token, sessionId: payload.sessionId, expiresAt: payload.expiresAt };
  }

  const count = await incrementDailyCounter(`staylight:live:daily:${utcDay(now)}:${ipHash}`, now);
  if (count > DAILY_SESSION_LIMIT) {
    throw new LiveQuotaError(
      "You have reached today's limit of 3 Live searches. Use Sample mode, return tomorrow, or run Staylight locally with your own API key.",
      429,
      "daily_live_limit"
    );
  }

  const sessionId = randomUUID();
  const expiresAt = now + SESSION_TTL_SECONDS * 1000;
  await saveSession(sessionId, {
    ipHash,
    expiresAt,
    interviewTurns: 0,
    searches: 0,
    researchedHotels: 0,
    analyses: 0
  });
  return {
    sessionId,
    expiresAt,
    token: createLiveSessionToken({ sessionId, ipHash, expiresAt }, secret)
  };
}

export async function consumeLiveAllowance(
  session: LiveSession,
  field: SessionField,
  amount: number,
  maximum: number,
  message: string
): Promise<void> {
  if (redisConfigured()) {
    const script = [
      "local raw = redis.call('GET', KEYS[1])",
      "if not raw then return -2 end",
      "local record = cjson.decode(raw)",
      "local nextValue = (record[ARGV[1]] or 0) + tonumber(ARGV[2])",
      "if nextValue > tonumber(ARGV[3]) then return -1 end",
      "record[ARGV[1]] = nextValue",
      "redis.call('SET', KEYS[1], cjson.encode(record), 'KEEPTTL')",
      "return nextValue"
    ].join("\n");
    const result = Number(await redisCommand([
      "EVAL",
      script,
      1,
      `staylight:live:session:${session.sessionId}`,
      field,
      amount,
      maximum
    ]));
    if (result === -2) {
      throw new LiveQuotaError("This Live session has expired. Start a new search.", 401, "expired_live_session");
    }
    if (result === -1) throw new LiveQuotaError(message, 429, `live_${field}_limit`);
    return;
  }

  const record = await readSession(session.sessionId);
  if (!record || record.expiresAt <= Date.now()) {
    throw new LiveQuotaError("This Live session has expired. Start a new search.", 401, "expired_live_session");
  }
  const nextValue = record[field] + amount;
  if (nextValue > maximum) throw new LiveQuotaError(message, 429, `live_${field}_limit`);
  record[field] = nextValue;
  await saveSession(session.sessionId, record);
}

export function liveQuotaResponse(error: unknown): Response {
  const quotaError = error instanceof LiveQuotaError
    ? error
    : new LiveQuotaError("Live usage tracking is temporarily unavailable.", 503, "quota_error");
  return Response.json({ error: quotaError.message, code: quotaError.code }, { status: quotaError.status });
}
