import { ratingOptions } from "./ratings.ts";
import type { ImportedResults } from "./importResults.ts";

const STORAGE_KEY = "kinkr:v1";
const PROGRESS_DISPLAY_KEY = "kinkr:progress-display:v1";
const KEY_PATTERN = /^(base|custom):\d+$/;
const LEVELS: unknown[] = ratingOptions.map((option) => option.value);

export type Progress = Omit<ImportedResults, "skipped">;
export type ProgressDisplay = "fraction" | "percent";

export function loadProgressDisplay(): ProgressDisplay {
  try {
    const display = localStorage.getItem(PROGRESS_DISPLAY_KEY);
    return display === "percent" ? "percent" : "fraction";
  } catch {
    return "fraction";
  }
}

export function saveProgressDisplay(display: ProgressDisplay) {
  try {
    localStorage.setItem(PROGRESS_DISPLAY_KEY, display);
  } catch {
    // Storage can be unavailable or full; the app still works without it.
  }
}

export function saveProgress(progress: Progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage can be unavailable or full; the app still works without it.
  }
}

export function clearProgress() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function loadProgress(): ImportedResults | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return null;
    const {
      listName,
      listVersion,
      includeExtended,
      answers,
      customItems,
      nextCustomId,
    } = data as Record<string, unknown>;
    if (
      typeof listName !== "string" ||
      (listVersion !== undefined &&
        listVersion !== "v2" &&
        listVersion !== "v3" &&
        listVersion !== "v4") ||
      (includeExtended !== undefined && typeof includeExtended !== "boolean") ||
      typeof nextCustomId !== "number" ||
      !Array.isArray(customItems) ||
      typeof answers !== "object" ||
      answers === null
    ) {
      return null;
    }
    for (const [key, roles] of Object.entries(answers)) {
      if (!KEY_PATTERN.test(key) || typeof roles !== "object" || !roles) {
        return null;
      }
      if (
        !Object.values(roles).every((v) => v === null || LEVELS.includes(v))
      ) {
        return null;
      }
    }
    for (const item of customItems) {
      if (
        typeof item?.id !== "number" ||
        typeof item?.category !== "string" ||
        typeof item?.name !== "string"
      ) {
        return null;
      }
    }
    return {
      listVersion:
        listVersion === "v3" || listVersion === "v4" ? listVersion : "v2",
      listName,
      includeExtended: includeExtended === true,
      answers: answers as ImportedResults["answers"],
      customItems: customItems as ImportedResults["customItems"],
      nextCustomId,
      skipped: 0,
    };
  } catch {
    return null;
  }
}
