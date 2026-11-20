import { initialCareer } from "./achievements";
import type { AchievementUnlock, CareerState, GameRun } from "./types";

const CAREER_KEY = "eye-opener:career:v1";
const ACTIVE_RUN_KEY = "eye-opener:active-run:v1";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const mergeHistoricalAchievements = (career: CareerState): CareerState => {
  const baseline = initialCareer();
  const known = new Set(career.achievements.map((achievement) => achievement.id));
  const missing: AchievementUnlock[] = baseline.achievements.filter(
    (achievement) => !known.has(achievement.id),
  );
  return {
    ...career,
    achievements: [...missing, ...career.achievements].map((achievement, index) => ({
      ...achievement,
      sequence: index + 1,
    })),
  };
};

export const loadCareer = (storage: KeyValueStorage): CareerState => {
  const raw = storage.getItem(CAREER_KEY);
  if (!raw) return initialCareer();
  try {
    const parsed = JSON.parse(raw) as CareerState;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.runs) || !Array.isArray(parsed.achievements)) {
      return initialCareer();
    }
    return mergeHistoricalAchievements(parsed);
  } catch {
    return initialCareer();
  }
};

export const saveCareer = (storage: KeyValueStorage, career: CareerState): void => {
  storage.setItem(CAREER_KEY, JSON.stringify(career));
};

export const loadActiveRun = (storage: KeyValueStorage): GameRun | undefined => {
  const raw = storage.getItem(ACTIVE_RUN_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as GameRun;
    return parsed.schemaVersion === 1 ? parsed : undefined;
  } catch {
    return undefined;
  }
};

export const saveActiveRun = (storage: KeyValueStorage, run: GameRun): void => {
  storage.setItem(ACTIVE_RUN_KEY, JSON.stringify(run));
};

export const clearActiveRun = (storage: KeyValueStorage): void => {
  storage.removeItem(ACTIVE_RUN_KEY);
};
