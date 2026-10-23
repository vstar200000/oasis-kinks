import { ratingOptions } from "./ratings.ts";

type AnswerLevel = (typeof ratingOptions)[number]["value"];
type Role =
  | "self"
  | "partner"
  | "giving"
  | "receiving"
  | "actor"
  | "subject"
  | "center"
  | "circle";

interface CategoryShape {
  category: string;
  "self-partner"?: boolean;
  "giving-receiving"?: boolean;
  "actor-subject"?: boolean;
  "center-circle"?: boolean;
  extended?: boolean;
  items: ({
    name: string;
    extended?: boolean;
    "omit-extended"?: boolean;
  } & AnswerTypeFlags)[];
}

export interface ImportedResults {
  listVersion: ListVersion;
  listName: string;
  includeExtended: boolean;
  // When set, omit-extended items are shown even in extended lists
  superlist: boolean;
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
  "center",
  "circle",
];

interface AnswerTypeFlags {
  "self-partner"?: boolean;
  "giving-receiving"?: boolean;
  "actor-subject"?: boolean;
  "center-circle"?: boolean;
}

const ANSWER_TYPE_FLAGS = [
  "center-circle",
  "actor-subject",
  "giving-receiving",
  "self-partner",
] as const;

// Any explicitly set answer type flag on the item overrides the category's answer type
export function getRoles(
  category: AnswerTypeFlags,
  item?: AnswerTypeFlags,
): Role[] {
  const source =
    item && ANSWER_TYPE_FLAGS.some((flag) => item[flag] !== undefined)
      ? item
      : category;
  if (source["center-circle"]) return ["center", "circle"];
  if (source["actor-subject"]) return ["actor", "subject"];
  if (source["giving-receiving"]) return ["giving", "receiving"];
  return source["self-partner"] ? ["self", "partner"] : ["self"];
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
  const superlist = includeExtended && data.superlist === true;
  const baseKeys = new Map<string, string>();
  const rolesByName = new Map<string, Role[]>();
  const categoryByName = new Map<string, CategoryShape>();
  let baseIndex = 0;
  for (const category of categories) {
    const visibleKeys: [string, string][] = [];
    for (const item of category.items) {
      const key = `base:${baseIndex++}`;
      if (
        (includeExtended || !(category.extended || item.extended)) &&
        !(includeExtended && !superlist && item["omit-extended"])
      ) {
        visibleKeys.push([`${category.category}\n${item.name}`, key]);
        rolesByName.set(
          `${category.category}\n${item.name}`,
          getRoles(category, item),
        );
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
    superlist,
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
    const categoryRoles = getRoles(category);

    for (const rawItem of rawCategory.items) {
      if (!isRecord(rawItem) || typeof rawItem.name !== "string") {
        result.skipped += 1;
        continue;
      }
      const itemName = `${category.category}\n${rawItem.name}`;
      let key = baseKeys.get(itemName);
      const roles = rolesByName.get(itemName) ?? categoryRoles;
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
