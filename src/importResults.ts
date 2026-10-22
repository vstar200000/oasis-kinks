import { ratingOptions } from "./ratings.ts";

type AnswerLevel = (typeof ratingOptions)[number]["value"];
type Role = "self" | "partner" | "giving" | "receiving" | "actor" | "subject";

interface CategoryShape {
  category: string;
  "self-partner"?: boolean;
  "giving-receiving"?: boolean;
  "actor-subject"?: boolean;
  extended?: boolean;
  items: { name: string; extended?: boolean }[];
}

export interface ImportedResults {
  listVersion: ListVersion;
  listName: string;
  includeExtended: boolean;
  answers: Record<string, Record<Role, AnswerLevel | null>>;
  customItems: { id: number; category: string; name: string }[];
  nextCustomId: number;
  skipped: number;
}

export type ListVersion = "v2" | "v3" | "v4";

const ALL_ROLES: Role[] = [
  "self",
  "partner",
  "giving",
  "receiving",
  "actor",
  "subject",
];

function getRoles(category: CategoryShape): Role[] {
  if (category["actor-subject"]) return ["actor", "subject"];
  if (category["giving-receiving"]) return ["giving", "receiving"];
  return category["self-partner"] ? ["self", "partner"] : ["self"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function levelOf(label: unknown): AnswerLevel | null {
  return ratingOptions.find((option) => option.label === label)?.value ?? null;
}

export function parseResults(
  text: string,
  categories: CategoryShape[],
  listVersion: ListVersion,
): ImportedResults {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (
    !isRecord(data) ||
    data.formatVersion !== 3 ||
    !Array.isArray(data.categories)
  ) {
    throw new Error("That file is not a Oasis Kinks results export.");
  }

  const includeExtended = data.includeExtended === true;
  const baseKeys = new Map<string, string>();
  const categoryByName = new Map<string, CategoryShape>();
  let baseIndex = 0;
  for (const category of categories) {
    const visibleKeys: [string, string][] = [];
    for (const item of category.items) {
      const key = `base:${baseIndex++}`;
      if (includeExtended || !(category.extended || item.extended)) {
        visibleKeys.push([`${category.category}\n${item.name}`, key]);
      }
    }
    // A category made up only of extended items is itself extended
    if (visibleKeys.length > 0 || category.items.length === 0) {
      categoryByName.set(category.category, category);
      visibleKeys.forEach(([name, key]) => baseKeys.set(name, key));
    }
  }

  const result: ImportedResults = {
    listVersion,
    listName: typeof data.listName === "string" ? data.listName : "",
    includeExtended,
    answers: {},
    customItems: [],
    nextCustomId: 1,
    skipped: 0,
  };
  let imported = 0;

  for (const rawCategory of data.categories) {
    if (!isRecord(rawCategory) || !Array.isArray(rawCategory.items)) continue;
    const category = categoryByName.get(String(rawCategory.category));
    if (!category) {
      result.skipped += rawCategory.items.length;
      continue;
    }
    const roles = getRoles(category);

    for (const rawItem of rawCategory.items) {
      if (!isRecord(rawItem) || typeof rawItem.name !== "string") {
        result.skipped += 1;
        continue;
      }
      let key = baseKeys.get(`${category.category}\n${rawItem.name}`);
      if (rawItem.custom === true) {
        const id = result.nextCustomId++;
        result.customItems.push({
          id,
          category: category.category,
          name: rawItem.name,
        });
        key = `custom:${id}`;
      }
      if (!key) {
        result.skipped += 1;
        continue;
      }

      const rating = rawItem.rating;
      const answers = Object.fromEntries(
        ALL_ROLES.map((role) => [role, null]),
      ) as Record<Role, AnswerLevel | null>;
      for (const role of roles) {
        answers[role] = levelOf(
          roles.length > 1 && isRecord(rating) ? rating[role] : rating,
        );
      }
      result.answers[key] = answers;
      imported += 1;
    }
  }

  if (imported === 0) {
    throw new Error("No items in that file match this list.");
  }
  return result;
}
