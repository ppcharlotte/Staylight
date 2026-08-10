import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HotelResearchProfile } from "@/lib/types";

type ProfileStore = {
  version: 1;
  profiles: Record<string, HotelResearchProfile>;
};

const dataDirectory = process.env.STAYLIGHT_DATA_DIR
  ? path.resolve(process.env.STAYLIGHT_DATA_DIR)
  : path.join(process.cwd(), ".staylight-data");
const storePath = path.join(dataDirectory, "hotel-profiles.json");
let writeQueue: Promise<void> = Promise.resolve();

async function readStore(): Promise<ProfileStore> {
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8"));
    if (parsed?.version === 1 && parsed.profiles && typeof parsed.profiles === "object") {
      return parsed as ProfileStore;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return { version: 1, profiles: {} };
}

export async function getStoredHotelProfiles(keys: string[]): Promise<Map<string, HotelResearchProfile>> {
  const store = await readStore();
  return new Map(keys.flatMap((key) => store.profiles[key] ? [[key, store.profiles[key]]] : []));
}

export async function upsertStoredHotelProfiles(profiles: HotelResearchProfile[]): Promise<void> {
  if (profiles.length === 0) return;

  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const store = await readStore();
    for (const profile of profiles) store.profiles[profile.key] = profile;
    await mkdir(dataDirectory, { recursive: true });
    const temporaryPath = `${storePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(store, null, 2), "utf8");
    await rename(temporaryPath, storePath);
  });

  return writeQueue;
}
