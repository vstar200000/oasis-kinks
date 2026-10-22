import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import DragRating from "./components/DragRating.tsx";
import Item from "./components/item.tsx";
import LandingPage from "./components/LandingPage.tsx";
import NavMenu from "./components/navMenu.tsx";
import RatingIcon from "./components/RatingIcon.tsx";
import itemsV3Data from "./data/items-v3.json";
import itemsV4Data from "./data/items-v4.json";
import itemsData from "./data/items.json";
import { downloadCanvasPng, renderResultsCanvas } from "./exportImage.ts";
import {
  getRoles,
  parseResults,
  type ImportedResults,
  type ListVersion,
} from "./importResults.ts";
import { migrateToNewList } from "./migrate.ts";
import { ratingOptions } from "./ratings.ts";
import {
  clearProgress,
  loadProgress,
  loadProgressDisplay,
  saveProgress,
  saveProgressDisplay,
} from "./storage.ts";

export interface Category {
  category: string;
  description?: string;
  "self-partner"?: boolean;
  "giving-receiving"?: boolean;
  "actor-subject"?: boolean;
  "center-circle"?: boolean;
  extended?: boolean;
  items: ItemData[];
}

export interface ItemData {
  name: string;
  description?: string;
  image?: string;
  extended?: boolean;
  "self-partner"?: boolean;
  "giving-receiving"?: boolean;
  "actor-subject"?: boolean;
  "center-circle"?: boolean;
}

const categoriesByVersion: Record<ListVersion, Category[]> = {
  v2: itemsData,
  v3: itemsV3Data,
  v4: itemsV4Data,
};

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

type ItemAnswers = Record<Role, AnswerLevel | null>;

interface CustomItem {
  id: number;
  category: string;
  name: string;
}

interface AppItem extends ItemData {
  key: string;
  category: string;
  categoryDescription?: string;
  roles: Role[];
  custom?: boolean;
  rawName?: string;
}

const UNTITLED_NAME = "Untitled item";

// Base items keep stable keys; custom items go after their category's own items
function buildItems(
  customItems: CustomItem[],
  includeExtended: boolean,
  categories: Category[],
): AppItem[] {
  let baseIndex = 0;
  return categories.flatMap((categoryData) => {
    const {
      category,
      extended: categoryExtended = false,
      description: categoryDescription,
      items: categoryItems,
    } = categoryData;
    {
      const roles = getRoles(categoryData);
      // Keys count every item so they stay stable whether or not extended items are shown
      const base: AppItem[] = categoryItems
        .map((item) => ({
          ...item,
          category,
          categoryDescription,
          roles: getRoles(categoryData, item),
          key: `base:${baseIndex++}`,
        }))
        .filter(
          (item) => includeExtended || !(categoryExtended || item.extended),
        );
      // A flagged category, or one made up only of extended items, is extended
      if (
        (categoryExtended && !includeExtended) ||
        (base.length === 0 && categoryItems.length > 0)
      ) {
        return [];
      }
      const custom: AppItem[] = customItems
        .filter((customItem) => customItem.category === category)
        .map((customItem) => ({
          name: customItem.name.trim() || UNTITLED_NAME,
          rawName: customItem.name,
          category,
          categoryDescription,
          roles,
          key: `custom:${customItem.id}`,
          custom: true,
        }));
      return [...base, ...custom];
    }
  });
}

const emptyAnswers: ItemAnswers = {
  self: null,
  partner: null,
  giving: null,
  receiving: null,
  actor: null,
  subject: null,
  center: null,
  circle: null,
};
const SKIP_ANSWER: AnswerLevel = 1;

function getEffectiveAnswer(answer: AnswerLevel | null) {
  return answer ?? SKIP_ANSWER;
}

function getLabel(answer: AnswerLevel | null) {
  const effective = getEffectiveAnswer(answer);
  return (
    ratingOptions.find((option) => option.value === effective)?.label ?? null
  );
}

function Checklist({
  listName,
  listVersion,
  categories,
  includeExtended,
  initial,
  onNewList,
  onUpgrade,
  onListNameChange,
}: {
  listName: string;
  listVersion: ListVersion;
  categories: Category[];
  includeExtended: boolean;
  initial: ImportedResults | null;
  onNewList: () => void;
  onUpgrade: (results: ImportedResults) => void;
  onListNameChange: (name: string) => void;
}) {
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [showComplete, setShowComplete] = useState(false);
  const [isEditingListName, setIsEditingListName] = useState(!listName);
  const [editedListName, setEditedListName] = useState(listName);
  const [answers, setAnswers] = useState<Record<string, ItemAnswers>>(
    initial?.answers ?? {},
  );
  const [customItems, setCustomItems] = useState<CustomItem[]>(
    initial?.customItems ?? [],
  );
  const [nextCustomId, setNextCustomId] = useState(initial?.nextCustomId ?? 1);
  const [justAddedKey, setJustAddedKey] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState(
    initial?.skipped
      ? `Imported. ${initial.skipped} item(s) in the file did not match this list and were skipped.`
      : "",
  );
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuButtonRef = useRef<HTMLButtonElement>(null);
  const [progressDisplay, setProgressDisplay] = useState(loadProgressDisplay);

  const items = useMemo(
    () => buildItems(customItems, includeExtended, categories),
    [categories, customItems, includeExtended],
  );

  useEffect(() => {
    saveProgress({
      listName,
      includeExtended,
      listVersion,
      answers,
      customItems,
      nextCustomId,
    });
  }, [
    listName,
    listVersion,
    includeExtended,
    answers,
    customItems,
    nextCustomId,
  ]);

  useEffect(() => {
    if (!isExportMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!exportMenuRef.current?.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsExportMenuOpen(false);
        exportMenuButtonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isExportMenuOpen]);

  const getAnswers = (key: string) => answers[key] ?? emptyAnswers;

  const activeItem = items[activeItemIndex];
  const activeRoles = activeItem?.roles ?? [];
  const activeAnswers = activeItem ? getAnswers(activeItem.key) : emptyAnswers;
  const ratedCount = items.filter((item) =>
    item.roles.every((role) => getAnswers(item.key)[role] !== null),
  ).length;
  const unansweredItems = items.filter((item) =>
    item.roles.some((role) => getAnswers(item.key)[role] === null),
  );
  const unansweredOptionCount = unansweredItems.reduce(
    (count, item) =>
      count +
      item.roles.filter((role) => getAnswers(item.key)[role] === null).length,
    0,
  );
  const isActiveItemRated = activeRoles.every(
    (role) => activeAnswers[role] !== null,
  );

  function advanceOrComplete() {
    if (activeItemIndex === items.length - 1) {
      setShowComplete(true);
    } else {
      setActiveItemIndex((currentIndex) => currentIndex + 1);
    }
  }

  function toggleProgressDisplay() {
    const nextDisplay = progressDisplay === "fraction" ? "percent" : "fraction";
    setProgressDisplay(nextDisplay);
    saveProgressDisplay(nextDisplay);
  }

  function saveListName() {
    const name = editedListName.trim();
    onListNameChange(name);
    setIsEditingListName(name.length === 0);
  }

  function handleAnswerClick(role: Role, answer: AnswerLevel) {
    const updatedAnswers = { ...activeAnswers, [role]: answer };

    setAnswers((currentAnswers) => ({
      ...currentAnswers,
      [activeItem.key]: updatedAnswers,
    }));
    setExportMessage("");
    if (
      activeRoles.every((activeRole) => updatedAnswers[activeRole] !== null)
    ) {
      advanceOrComplete();
    }
  }

  function handleSkipForNow() {
    if (!activeItem) return;
    setAnswers((currentAnswers) => {
      const skippedAnswers = {
        ...(currentAnswers[activeItem.key] ?? emptyAnswers),
      };
      activeRoles.forEach((role) => {
        if (skippedAnswers[role] === null) {
          skippedAnswers[role] = SKIP_ANSWER;
        }
      });
      return { ...currentAnswers, [activeItem.key]: skippedAnswers };
    });
    setExportMessage("");
    advanceOrComplete();
  }

  function handleAddItem(category: string) {
    const id = nextCustomId;
    const updatedCustomItems = [
      ...customItems,
      { id, category, name: "New item" },
    ];
    const key = `custom:${id}`;

    setCustomItems(updatedCustomItems);
    setNextCustomId(id + 1);
    setShowComplete(false);
    setJustAddedKey(key);
    setActiveItemIndex(
      buildItems(updatedCustomItems, includeExtended, categories).findIndex(
        (item) => item.key === key,
      ),
    );
    setExportMessage("");
    setIsNavOpen(false);
  }

  function handleRenameItem(name: string) {
    const id = Number(activeItem.key.slice("custom:".length));
    setCustomItems((current) =>
      current.map((item) => (item.id === id ? { ...item, name } : item)),
    );
    setExportMessage("");
  }

  function handleRemoveItem() {
    const id = Number(activeItem.key.slice("custom:".length));
    setCustomItems((current) => current.filter((item) => item.id !== id));
    setAnswers((current) => {
      const rest = { ...current };
      delete rest[activeItem.key];
      return rest;
    });
    setActiveItemIndex((index) => Math.max(index - 1, 0));
    setExportMessage("");
  }

  function handleNavSelect(index: number) {
    setActiveItemIndex(index);
    setShowComplete(false);
    setExportMessage("");
    setIsNavOpen(false);
  }

  async function exportPng() {
    const date = new Date().toISOString().slice(0, 10);
    try {
      const canvas = renderResultsCanvas(
        items.map((item) => ({
          name: item.name,
          category: item.category,
          roles: item.roles,
          ratings: item.roles.map((role) =>
            getEffectiveAnswer(getAnswers(item.key)[role]),
          ),
        })),
        ratingOptions,
        listName,
      );
      await downloadCanvasPng(canvas, `oasis-kinks-results-${date}.png`);
      setExportMessage("Your PNG results have been downloaded.");
    } catch {
      setExportMessage("Sorry, the PNG could not be created.");
    }
  }

  function createJSONExportData() {
    return {
      formatVersion: 3,
      ...(listName && { listName }),
      ...(includeExtended && { includeExtended }),
      exportedAt: new Date().toISOString(),
      categories: categories
        .filter((category) =>
          items.some((item) => item.category === category.category),
        )
        .map((category) => {
          const categoryDetails = {
            category: category.category,
            "self-partner": category["self-partner"],
            "giving-receiving": category["giving-receiving"],
            "actor-subject": category["actor-subject"],
            "center-circle": category["center-circle"],
          };
          return {
            ...categoryDetails,
            items: items
              .filter((item) => item.category === categoryDetails.category)
              .map((item) => {
                const itemAnswers = getAnswers(item.key);

                return {
                  name: item.name,
                  ...(item.description && { description: item.description }),
                  ...(item.image && { image: item.image }),
                  ...(item.custom && { custom: true }),
                  ...(item["self-partner"] && { "self-partner": true }),
                  ...(item["giving-receiving"] && { "giving-receiving": true }),
                  ...(item["actor-subject"] && { "actor-subject": true }),
                  ...(item["center-circle"] && { "center-circle": true }),
                  rating:
                    item.roles.length > 1
                      ? Object.fromEntries(
                          item.roles.map((role) => [
                            role,
                            getLabel(itemAnswers[role]),
                          ]),
                        )
                      : getLabel(itemAnswers.self),
                };
              }),
          };
        }),
    };
  }

  function exportResults() {
    const exportData = createJSONExportData();
    const file = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const downloadUrl = URL.createObjectURL(file);
    const downloadLink = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);

    downloadLink.href = downloadUrl;
    downloadLink.download = `oasis-kinks-results-${date}.json`;
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    URL.revokeObjectURL(downloadUrl);
    setExportMessage("Your JSON results have been downloaded.");
  }

  function exportToClipboard() {
    const exportData = createJSONExportData();
    navigator.clipboard
      .writeText(JSON.stringify(exportData, null, 2))
      .then(() =>
        setExportMessage(
          "Your JSON results have been copied to the clipboard.",
        ),
      )
      .catch(() =>
        setExportMessage(
          "Sorry, the JSON could not be copied to the clipboard.",
        ),
      );
  }

  function upgradeToV4() {
    const { results, carried, added, dropped } = migrateToNewList(
      {
        listName,
        listVersion: "v4",
        includeExtended,
        answers,
        customItems,
        nextCustomId,
      },
      categories,
      itemsV4Data,
      "v4",
    );
    const droppedText = dropped.length
      ? `\n\nThese ${dropped.length} item(s) have no match in V4 and will be removed:\n` +
        dropped.map((item) => `• ${item.category}: ${item.name}`).join("\n")
      : "";
    if (
      window.confirm(
        `Upgrade to V4? ${carried} rated item(s) will carry over and ${added} new item(s) will be added.${droppedText}\n\nYour V3 progress will be replaced. Export it first if you want a backup.`,
      )
    ) {
      onUpgrade(results);
    }
  }

  return (
    <main className="app-shell">
      <header className="container py-4 py-md-5">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
          <button
            aria-controls="nav-menu"
            aria-expanded={isNavOpen}
            className="brand brand-button"
            id="top"
            onClick={() => setIsNavOpen((open) => !open)}
            type="button"
            aria-label="Oasis Kinks menu"
          >
            <img
              alt=""
              className="brand-logo"
              src={`${import.meta.env.BASE_URL}logos/oasis_kinks_logo.png`}
            />
          </button>
          <h1 className="list-name h5 mb-0">
            {isEditingListName ? (
              <input
                aria-label="List name"
                autoFocus
                className="form-control form-control-sm"
                maxLength={60}
                onBlur={saveListName}
                onChange={(event) => setEditedListName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    saveListName();
                  } else if (event.key === "Escape") {
                    setEditedListName(listName);
                    setIsEditingListName(!listName);
                  }
                }}
                type="text"
                value={editedListName}
              />
            ) : (
              <button
                aria-label={`Edit list name: ${listName}`}
                className="list-name-button"
                onClick={() => {
                  setEditedListName(listName);
                  setIsEditingListName(true);
                }}
                type="button"
              >
                {listName}
              </button>
            )}
          </h1>
          <button
            className="btn btn-outline-dark"
            onClick={() => {
              if (
                window.confirm(
                  "Start a new list? Your current ratings will be lost unless you export them.",
                )
              ) {
                onNewList();
              }
            }}
            type="button"
          >
            New list
          </button>
          {listVersion === "v3" && (
            <button
              className="btn btn-dark"
              onClick={upgradeToV4}
              type="button"
            >
              Upgrade to V4
            </button>
          )}
          <div className="btn-group" role="group" aria-label="Export options">
            <button
              className="btn btn-outline-dark export-button"
              onClick={exportPng}
              type="button"
            >
              Export PNG
            </button>
            <div className="dropdown" ref={exportMenuRef}>
              <button
                aria-label="More export options"
                aria-controls="export-menu"
                aria-expanded={isExportMenuOpen}
                className="btn btn-outline-dark dropdown-toggle export-button export-dropdown-toggle"
                onClick={() => setIsExportMenuOpen((open) => !open)}
                ref={exportMenuButtonRef}
                type="button"
              />
              <div
                className={`dropdown-menu border border-dark dropdown-menu-end${isExportMenuOpen ? " show" : ""}`}
                id="export-menu"
              >
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setIsExportMenuOpen(false);
                    exportResults();
                  }}
                  type="button"
                >
                  Export JSON
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setIsExportMenuOpen(false);
                    exportToClipboard();
                  }}
                  type="button"
                >
                  Export to Clipboard
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="app-body">
        <NavMenu
          activeIndex={showComplete ? -1 : activeItemIndex}
          isOpen={isNavOpen}
          items={items.map((item) => ({
            name: item.name,
            category: item.category,
            dots: item.roles.map(
              (role) =>
                ratingOptions.find(
                  (option) => option.value === getAnswers(item.key)[role],
                ) ?? null,
            ),
          }))}
          onClose={() => setIsNavOpen(false)}
          onAddItem={handleAddItem}
          onSelect={handleNavSelect}
        />
        <section
          aria-label="Item ratings"
          className="rating-workspace pb-5"
          style={
            activeItem?.image
              ? {
                  backgroundImage: `linear-gradient(rgb(251 250 252 / 78%), rgb(251 250 252 / 88%)), url(${JSON.stringify(activeItem.image)})`,
                }
              : undefined
          }
        >
          <div className="container">
            <div className="row justify-content-center">
              <div className="col-12 col-lg-9 col-xl-8">
                {showComplete ? (
                  <div className="complete-screen empty-state text-center p-5">
                    <h2 className="h3">You're all done!</h2>
                    <p className="text-secondary">
                      Export your results as a PNG to save and share them.
                    </p>
                    <button
                      className="btn btn-dark"
                      onClick={exportPng}
                      type="button"
                    >
                      Export PNG to share
                    </button>
                    {unansweredOptionCount > 0 && (
                      <>
                        <p
                          className="unanswered-notice mt-4 mb-2"
                          role="status"
                        >
                          {unansweredOptionCount} rating
                          {unansweredOptionCount === 1 ? "" : "s"} unanswered.
                          Unanswered items will show up as "Ask Me" in the image
                          export!
                        </p>
                        <button
                          className="btn btn-link navigation-button"
                          onClick={() =>
                            handleNavSelect(items.indexOf(unansweredItems[0]))
                          }
                          type="button"
                        >
                          Review unanswered items
                        </button>
                      </>
                    )}
                    {exportMessage && (
                      <p
                        aria-live="polite"
                        className="export-message mt-3 mb-0"
                      >
                        {exportMessage}
                      </p>
                    )}
                  </div>
                ) : activeItem ? (
                  <>
                    <div className="d-flex justify-content-between align-items-end mb-3">
                      <div>
                        <p className="eyebrow mb-1">{activeItem.category}</p>
                        {activeItem.categoryDescription && (
                          <p className="text-secondary small mb-0">
                            {activeItem.categoryDescription}
                          </p>
                        )}
                      </div>
                      {ratedCount === items.length && (
                        <span className="complete-badge">All rated</span>
                      )}
                      {ratedCount < items.length && (
                        <button
                          aria-label={`Progress: ${ratedCount} of ${items.length} items rated, shown as ${progressDisplay}. Activate to show as ${progressDisplay === "fraction" ? "percent" : "fraction"}.`}
                          className="progress-tracker"
                          onClick={toggleProgressDisplay}
                          title={`Click to show progress as ${progressDisplay === "fraction" ? "percent" : "fraction"}`}
                          type="button"
                        >
                          {progressDisplay === "fraction"
                            ? `${ratedCount} / ${items.length}`
                            : `${Math.round((ratedCount / items.length) * 100)}%`}
                        </button>
                      )}
                    </div>

                    <DragRating
                      key={activeItem.key}
                      onRate={(role, value) =>
                        handleAnswerClick(role as Role, value as AnswerLevel)
                      }
                      renderCard={(editable) => (
                        <Item
                          autoFocus={
                            editable && justAddedKey === activeItem.key
                          }
                          description={activeItem.description}
                          name={activeItem.name}
                          onNameChange={
                            editable && activeItem.custom
                              ? handleRenameItem
                              : undefined
                          }
                          onRemove={
                            editable && activeItem.custom
                              ? handleRemoveItem
                              : undefined
                          }
                          rawName={activeItem.rawName}
                        />
                      )}
                      roles={activeRoles}
                    />

                    <div className="rating-controls mt-auto">
                      <div className="rating-area mt-4">
                        {activeRoles.map((role) => (
                          <div
                            aria-label={
                              activeRoles.length > 1 ? role : undefined
                            }
                            className="rating-group"
                            key={role}
                            role={activeRoles.length > 1 ? "group" : undefined}
                          >
                            {activeRoles.length > 1 && (
                              <p className="rating-group-label">{role}</p>
                            )}
                            <div className="rating-options">
                              {ratingOptions.map((option) => (
                                <button
                                  aria-pressed={
                                    activeAnswers[role] === option.value
                                  }
                                  className={`btn rating-choice ${option.className}${activeAnswers[role] === option.value ? " is-selected" : ""}`}
                                  key={option.value}
                                  onClick={() =>
                                    handleAnswerClick(role, option.value)
                                  }
                                  type="button"
                                  title={option.description}
                                >
                                  <RatingIcon option={option} size="1.1em" />
                                  <span className="rating-label">
                                    {option.label}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      <nav
                        aria-label="Item navigation"
                        className="d-flex justify-content-between mt-4"
                      >
                        <button
                          className="btn btn-link navigation-button"
                          disabled={activeItemIndex === 0}
                          onClick={() =>
                            setActiveItemIndex((index) =>
                              Math.max(index - 1, 0),
                            )
                          }
                          type="button"
                        >
                          Previous
                        </button>
                        <button
                          className="btn btn-link navigation-button"
                          onClick={
                            isActiveItemRated
                              ? advanceOrComplete
                              : handleSkipForNow
                          }
                          type="button"
                        >
                          {isActiveItemRated
                            ? activeItemIndex === items.length - 1
                              ? "Finish"
                              : "Next item"
                            : "Skip for now"}
                        </button>
                      </nav>

                      <p
                        aria-live="polite"
                        className="export-message text-center mt-3 mb-0"
                      >
                        {exportMessage}
                      </p>
                      <p className="privacy-note text-center mt-3 mb-0">
                        Your ratings are saved in this browser only. Export a
                        copy to back up or share.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="empty-state text-center p-5">
                    <h2 className="h4">There are no items yet.</h2>
                    <p className="text-secondary mb-0">
                      Add items to <code>src/data/items.json</code> to get
                      started.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function App() {
  const [listName, setListName] = useState<string | null>(null);
  const [initial, setInitial] = useState<ImportedResults | null>(null);
  const [listVersion, setListVersion] = useState<ListVersion>(
    () => loadProgress()?.listVersion ?? "v2",
  );
  const [includeExtended, setIncludeExtended] = useState(false);
  const [saved, setSaved] = useState(loadProgress);
  const [checklistKey, setChecklistKey] = useState(0);

  if (listName === null) {
    return (
      <LandingPage
        onDiscard={() => {
          clearProgress();
          setSaved(null);
        }}
        onResume={() => {
          if (saved) {
            setInitial(saved);
            setListVersion(saved.listVersion);
            setIncludeExtended(saved.includeExtended);
            setListName(saved.listName);
          }
        }}
        saved={
          saved && {
            listName: saved.listName,
            ratedCount: Object.values(saved.answers).filter((roles) =>
              Object.values(roles).some((level) => level !== null),
            ).length,
          }
        }
        onImport={(text, version) => {
          const results = parseResults(
            text,
            categoriesByVersion[version],
            version,
          );
          setInitial(results);
          setListVersion(version);
          setIncludeExtended(version === "v2" && results.includeExtended);
          setListName(results.listName);
        }}
        onStart={(name, version, extended) => {
          setInitial(null);
          setListVersion(version);
          setIncludeExtended(extended);
          setListName(name);
        }}
      />
    );
  }

  return (
    <Checklist
      key={checklistKey}
      categories={categoriesByVersion[listVersion]}
      includeExtended={includeExtended}
      initial={initial}
      listName={listName}
      listVersion={listVersion}
      onListNameChange={setListName}
      onUpgrade={(results) => {
        saveProgress(results);
        setInitial(results);
        setListVersion(results.listVersion);
        setIncludeExtended(false);
        setChecklistKey((k) => k + 1);
      }}
      onNewList={() => {
        clearProgress();
        setSaved(null);
        setInitial(null);
        setListName(null);
      }}
    />
  );
}

export default App;
