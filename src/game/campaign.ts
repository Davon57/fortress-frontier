import type { BattleRating } from "./scoring";

interface CampaignStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = "fortress-unlocked";
const RECORDS_KEY = "fortress-records-v1";

export interface LevelRecord {
  stars: number;
  bestTime: number | null;
  bestCasualties: number | null;
  victories: number;
}

export type CampaignRecords = Record<number, LevelRecord>;

const finiteNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export const readUnlocked = (storage: CampaignStorage, totalLevels: number) => {
  try {
    const value = Number(storage.getItem(STORAGE_KEY) || 1);
    return Number.isFinite(value) ? Math.max(1, Math.min(totalLevels, Math.trunc(value))) : 1;
  } catch {
    return 1;
  }
};

export const unlockAfterVictory = (
  storage: CampaignStorage,
  currentLevel: number,
  totalLevels: number,
) => {
  const unlocked = Math.max(
    readUnlocked(storage, totalLevels),
    Math.min(totalLevels, currentLevel + 1),
  );
  try {
    storage.setItem(STORAGE_KEY, String(unlocked));
  } catch {
    // 存储不可用时仍允许本局正常结束。
  }
  return unlocked;
};

export const readCampaignRecords = (
  storage: CampaignStorage,
  totalLevels: number,
): CampaignRecords => {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(RECORDS_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const source = parsed as Record<string, unknown>;
    const records: CampaignRecords = {};

    for (let level = 1; level <= totalLevels; level++) {
      const candidate = source[String(level)];
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const value = candidate as Record<string, unknown>;
      const stars = finiteNumber(value.stars);
      const bestTime = finiteNumber(value.bestTime);
      const bestCasualties = finiteNumber(value.bestCasualties);
      const victories = finiteNumber(value.victories);
      records[level] = {
        stars: Math.max(0, Math.min(3, Math.trunc(stars ?? 0))),
        bestTime,
        bestCasualties,
        victories: Math.trunc(victories ?? 0),
      };
    }
    return records;
  } catch {
    return {};
  }
};

export const recordVictory = (
  storage: CampaignStorage,
  levelId: number,
  rating: BattleRating,
  totalLevels: number,
) => {
  const safeLevel = Number.isFinite(levelId)
    ? Math.max(1, Math.min(totalLevels, Math.trunc(levelId)))
    : 1;
  const records = readCampaignRecords(storage, totalLevels);
  const previous = records[safeLevel];
  const next: LevelRecord = {
    stars: Math.max(previous?.stars ?? 0, rating.stars),
    bestTime:
      previous?.bestTime == null
        ? rating.stats.elapsed
        : Math.min(previous.bestTime, rating.stats.elapsed),
    bestCasualties:
      previous?.bestCasualties == null
        ? rating.stats.casualties
        : Math.min(previous.bestCasualties, rating.stats.casualties),
    victories: (previous?.victories ?? 0) + 1,
  };
  records[safeLevel] = next;
  try {
    storage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    // 存储不可用时仍返回本局成绩，界面可以正常结算。
  }
  return next;
};
