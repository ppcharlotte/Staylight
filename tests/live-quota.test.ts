import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeLiveAllowance,
  createLiveSessionToken,
  getOrCreateLiveSession,
  LiveQuotaError,
  verifyLiveSessionToken
} from "../lib/live-quota";

const secret = "test-secret-that-is-not-used-outside-tests";
const payload = {
  sessionId: "session-123",
  ipHash: "hashed-ip",
  expiresAt: Date.parse("2026-10-01T12:00:00.000Z")
};

test("live session tokens round-trip with a valid signature", () => {
  const token = createLiveSessionToken(payload, secret);
  assert.deepEqual(verifyLiveSessionToken(token, secret, Date.parse("2026-10-01T11:00:00.000Z")), payload);
});

test("live session tokens reject tampering and expiry", () => {
  const token = createLiveSessionToken(payload, secret);
  assert.equal(verifyLiveSessionToken(`${token}x`, secret, Date.parse("2026-10-01T11:00:00.000Z")), null);
  assert.equal(verifyLiveSessionToken(token, secret, payload.expiresAt), null);
});

test("a hashed IP can start only three Live sessions per day", async () => {
  const request = new Request("http://localhost/api/profile", {
    headers: { "x-forwarded-for": "203.0.113.40" }
  });
  await getOrCreateLiveSession(request);
  await getOrCreateLiveSession(request);
  await getOrCreateLiveSession(request);
  await assert.rejects(
    () => getOrCreateLiveSession(request),
    (error: unknown) => error instanceof LiveQuotaError && error.code === "daily_live_limit"
  );
});

test("a Live session enforces its operation allowance", async () => {
  const request = new Request("http://localhost/api/profile", {
    headers: { "x-forwarded-for": "203.0.113.41" }
  });
  const session = await getOrCreateLiveSession(request);
  await consumeLiveAllowance(session, "searches", 1, 1, "Search already used.");
  await assert.rejects(
    () => consumeLiveAllowance(session, "searches", 1, 1, "Search already used."),
    (error: unknown) => error instanceof LiveQuotaError && error.code === "live_searches_limit"
  );
});
