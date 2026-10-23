import type { ImportedResults } from "./importResults.ts";
import { getRoles } from "./importResults.ts";

interface CategoryShape {
  category: string;
  "self-partner"?: boolean;
  "giving-receiving"?: boolean;
  "actor-subject"?: boolean;
  "center-circle"?: boolean;
  items: {
    name: string;
    "self-partner"?: boolean;
    "giving-receiving"?: boolean;
    "actor-subject"?: boolean;
    "center-circle"?: boolean;
  }[];
}

type Answers = ImportedResults["answers"][string];

export interface MigrationResult {
  results: ImportedResults;
  carried: number;
  added: number;
  dropped: { category: string; name: string }[];
}

const nameKey = (category: string, name: string) => `${category}\n${name}`;

// Items match only on exact category + name, so renamed items start fresh
export function migrateToNewList(
  current: Omit<ImportedResults, "skipped">,
  oldCategories: CategoryShape[],
  newCategories: CategoryShape[],
  newVersion: ImportedResults["listVersion"],
): MigrationResult {
  const newItems = new Map<string, { key: string; roles: string[] }>();
  let newIndex = 0;
  for (const category of newCategories) {
    for (const item of category.items) {
      newItems.set(nameKey(category.category, item.name), {
        key: `base:${newIndex++}`,
        roles: getRoles(category, item),
      });
    }
  }

  const answers: ImportedResults["answers"] = {};
  const dropped: MigrationResult["dropped"] = [];
  const matched = new Set<string>();
  let oldIndex = 0;
  for (const category of oldCategories) {
    for (const item of category.items) {
      const oldKey = `base:${oldIndex++}`;
      const oldAnswers = current.answers[oldKey];
      const hasAnswer =
        !!oldAnswers && Object.values(oldAnswers).some((v) => v !== null);
      if (!hasAnswer) continue;
      const target = newItems.get(nameKey(category.category, item.name));
      if (!target) {
        dropped.push({ category: category.category, name: item.name });
        continue;
      }
      const next = Object.fromEntries(
        Object.keys(oldAnswers).map((role) => [role, null]),
      ) as Answers;
      for (const role of target.roles) {
        next[role as keyof Answers] = oldAnswers[role as keyof Answers] ?? null;
      }
      answers[target.key] = next;
      matched.add(target.key);
    }
  }

  const categoryNames = new Set(newCategories.map((c) => c.category));
  const customItems = current.customItems.filter((item) =>
    categoryNames.has(item.category),
  );
  for (const item of current.customItems) {
    if (!categoryNames.has(item.category)) {
      dropped.push({ category: item.category, name: item.name });
    } else if (current.answers[`custom:${item.id}`]) {
      answers[`custom:${item.id}`] = current.answers[`custom:${item.id}`];
    }
  }

  return {
    results: {
      ...current,
      listVersion: newVersion,
      includeExtended: false,
      superlist: false,
      answers,
      customItems,
      skipped: 0,
    },
    carried: matched.size,
    added: newItems.size - matched.size,
    dropped,
  };
}
