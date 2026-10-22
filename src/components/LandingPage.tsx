import { useState, type ChangeEvent, type FormEvent } from "react";
import type { ListVersion } from "../importResults.ts";

interface LandingPageProps {
  onStart: (
    listName: string,
    listVersion: ListVersion,
    includeExtended: boolean,
  ) => void;
  onImport: (text: string, listVersion: ListVersion) => void;
  saved: { listName: string; ratedCount: number } | null;
  onResume: () => void;
  onDiscard: () => void;
}

function LandingPage({
  onStart,
  onImport,
  saved,
  onResume,
  onDiscard,
}: LandingPageProps) {
  const [listName, setListName] = useState("");
  const [listVersion, setListVersion] = useState<ListVersion>("v4");
  const [includeExtended, setIncludeExtended] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onStart(
      listName.trim(),
      listVersion,
      listVersion === "v4" && includeExtended,
    );
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setImportFile(event.target.files?.[0] ?? null);
    setImportError("");
  }

  async function handleImport() {
    if (!importFile) return;
    try {
      onImport(await importFile.text(), listVersion);
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "The file could not be imported.",
      );
    }
  }

  return (
    <main className="app-shell landing d-flex align-items-center">
      <div className="container py-5" style={{ maxWidth: "32rem" }}>
        <div className="text-center mb-2">
          <img
            alt="Oasis Kinks"
            className="brand-logo brand-logo-large"
            src={`${import.meta.env.BASE_URL}logos/oasis_kinks_logo.png`}
          />
        </div>
        <p className="text-center text-secondary mb-4">
          Work through a checklist and rate each item.
        </p>
        {saved && (
          <div className="card card-body mb-4">
            <p className="mb-1 fw-semibold">
              Resume {saved.listName ? `"${saved.listName}"` : "your last list"}
            </p>
            <p className="text-secondary small">
              {saved.ratedCount} item(s) rated, saved in this browser.
            </p>
            <div className="d-flex gap-2">
              <button
                className="btn btn-dark flex-grow-1"
                onClick={onResume}
                type="button"
              >
                Resume
              </button>
              <button
                className="btn btn-outline-secondary"
                onClick={onDiscard}
                type="button"
              >
                Discard
              </button>
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <label className="form-label" htmlFor="list-version">
            Item list
          </label>
          <select
            className="form-select form-select-lg mb-3"
            id="list-version"
            onChange={(event) =>
              setListVersion(
                event.target.value === "v4"
                  ? "v4"
                  : event.target.value === "v3"
                    ? "v3"
                    : "v2",
              )
            }
            value={listVersion}
          >
            <option value="v2">V2</option>
            <option value="v3">V3</option>
            <option value="v4">V4</option>
          </select>
          <label className="form-label" htmlFor="list-name">
            List name <span className="text-secondary">(optional)</span>
          </label>
          <input
            autoFocus
            className="form-control form-control-lg mb-3"
            id="list-name"
            maxLength={60}
            onChange={(event) => setListName(event.target.value)}
            type="text"
            value={listName}
          />
          {(listVersion === "v2" || listVersion === "v3") && (
            <div className="form-check mb-3">
              <input
                checked={includeExtended}
                className="form-check-input"
                id="include-extended"
                onChange={(event) => setIncludeExtended(event.target.checked)}
                type="checkbox"
              />
              <label className="form-check-label" htmlFor="include-extended">
                Include extended items
              </label>
            </div>
          )}
          <button className="btn btn-dark btn-lg w-100" type="submit">
            Start
          </button>
        </form>
        <hr className="my-4" />
        <label className="form-label" htmlFor="import-file">
          Or import a previous export
        </label>
        <div className="input-group">
          <input
            accept=".json,application/json"
            className="form-control"
            id="import-file"
            onChange={handleFileChange}
            type="file"
          />
          <button
            className="btn btn-outline-dark"
            disabled={!importFile}
            onClick={handleImport}
            type="button"
          >
            Import
          </button>
        </div>
        {importError && (
          <p className="text-danger mt-2 mb-0" role="alert">
            {importError}
          </p>
        )}
      </div>
    </main>
  );
}

export default LandingPage;
