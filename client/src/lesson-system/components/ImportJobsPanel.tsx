import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { apiGet, apiPost } from "../api/httpClient";
import type {
  ImportItem,
  ImportItemStatus,
  ImportJob,
  ListResponse,
  ItemResponse,
} from "../types/importTypes";
import type { LanguageCode } from "../types/i18nTypes";

type Props = {
  language: LanguageCode;
};

type RunResult = {
  action: string;
  jobId: string;
  itemId?: string;
  importedStepId?: string;
  message?: string;
  counters?: {
    totalItems: number;
    processedItems: number;
    successfulItems: number;
    failedItems: number;
    currentIndex: number;
    status: string;
  };
};

export default function ImportJobsPanel({ language }: Props) {
  const t = (en: string, nl: string) => (language === "nl" ? nl : en);
  const runLockRef = useRef(false);
  const pollInFlightRef = useRef(false);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<ImportJob | null>(null);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [itemFilter, setItemFilter] = useState<"all" | ImportItemStatus>("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const [sourceType, setSourceType] = useState("slagzet");
  const [sourceUrl, setSourceUrl] = useState("");
  const [collectionSlug, setCollectionSlug] = useState("");
  const [scanEnabled, setScanEnabled] = useState(true);
  const [scanDepth, setScanDepth] = useState("10");
  const [scanMultiPv, setScanMultiPv] = useState("1");
  const [baseDifficultyBand, setBaseDifficultyBand] = useState<
    "" | "beginner" | "intermediate" | "advanced"
  >("");
  const [basePuzzleRating, setBasePuzzleRating] = useState("");
  const [batchSize, setBatchSize] = useState("10");

  const selectedJobItems = useMemo(() => {
    if (itemFilter === "all") return items;
    return items.filter((item) => item.status === itemFilter);
  }, [items, itemFilter]);
  const selectedJobSkipped = useMemo(() => {
    if (!selectedJob) return 0;
    return Math.max(
      0,
      Number(selectedJob.processedItems ?? 0) -
        Number(selectedJob.successfulItems ?? 0) -
        Number(selectedJob.failedItems ?? 0)
    );
  }, [selectedJob]);

  const listImportJobs = async () => {
    const response = await apiGet<ListResponse<ImportJob>>("/api/import-jobs");
    const nextJobs = Array.isArray(response?.items) ? response.items : [];
    setJobs(nextJobs);
    if (nextJobs.length === 0) {
      setSelectedJobId(null);
      setSelectedJob(null);
      setItems([]);
      return;
    }
    if (!selectedJobId || !nextJobs.some((job) => (job.jobId ?? job.id) === selectedJobId)) {
      const firstJobId = nextJobs[0]?.jobId ?? nextJobs[0]?.id ?? null;
      setSelectedJobId(firstJobId);
    }
  };

  const getImportJob = async (jobId: string) => {
    const response = await apiGet<ItemResponse<ImportJob>>(`/api/import-jobs/${jobId}`);
    setSelectedJob(response.item ?? null);
  };

  const listImportItems = async (jobId: string, status?: ImportItemStatus) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const response = await apiGet<ListResponse<ImportItem>>(
      `/api/import-jobs/${jobId}/items${query}`
    );
    setItems(Array.isArray(response?.items) ? response.items : []);
  };

  const refreshSelectedJob = async () => {
    if (!selectedJobId) return;
    await Promise.all([
      getImportJob(selectedJobId),
      listImportItems(selectedJobId, itemFilter === "all" ? undefined : itemFilter),
      listImportJobs(),
    ]);
  };

  useEffect(() => {
    void listImportJobs();
  }, []);

  useEffect(() => {
    if (!selectedJobId) return;
    void getImportJob(selectedJobId);
    void listImportItems(selectedJobId, itemFilter === "all" ? undefined : itemFilter);
  }, [selectedJobId, itemFilter]);

  useEffect(() => {
    if (!selectedJobId) return;
    const st = selectedJob?.status;
    const shouldPoll =
      runLockRef.current || st === "running" || st === "processing";
    if (!shouldPoll) return;

    const timer = window.setInterval(() => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      void refreshSelectedJob()
        .catch(() => undefined)
        .finally(() => {
          pollInFlightRef.current = false;
        });
    }, 1500);

    return () => window.clearInterval(timer);
  }, [selectedJobId, selectedJob?.status, itemFilter]);

  const createImportJob = async () => {
    if (!sourceType.trim() || !sourceUrl.trim() || !collectionSlug.trim()) {
      setError(t("Source type, source URL, and collection slug are required.", "Source type, source URL en collection slug zijn verplicht."));
      setMessage("");
      return;
    }
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      const depth = Number(scanDepth);
      const multiPv = Number(scanMultiPv);
      const baseRatingNumber = Number(basePuzzleRating);
      const response = await apiPost<ItemResponse<ImportJob>>("/api/import-jobs", {
        document: {
          sourceType: sourceType.trim(),
          sourceUrl: sourceUrl.trim(),
          collectionSlug: collectionSlug.trim(),
          ...(baseDifficultyBand ? { baseDifficultyBand } : {}),
          ...(basePuzzleRating.trim() && Number.isFinite(baseRatingNumber)
            ? { basePuzzleRating: Math.round(baseRatingNumber) }
            : {}),
          targetBookId: null,
          targetLessonId: null,
          scanConfig: {
            enabled: scanEnabled,
            depth: Number.isFinite(depth) ? depth : undefined,
            multiPv: Number.isFinite(multiPv) ? multiPv : undefined,
          },
        },
      });
      const newJobId = response.item?.jobId ?? response.item?.id ?? null;
      await listImportJobs();
      if (newJobId) setSelectedJobId(newJobId);
      setMessage(t("Import job created.", "Importjob aangemaakt."));
      if (!collectionSlug.trim()) {
        setCollectionSlug("");
      }
    } catch (e: any) {
      setError(e?.message ?? t("Failed to create import job.", "Aanmaken importjob mislukt."));
    } finally {
      setIsBusy(false);
    }
  };

  const seedImportJob = async (job: ImportJob) => {
    const jobId = job.jobId ?? job.id;
    if (!jobId) return;
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      await apiPost(`/api/import-jobs/${jobId}/seed`, {
        page: 1,
        expectedRevision: job.revision,
      });
      setMessage(t("Items seeded from collection page 1.", "Items gezaaid vanaf collectiepagina 1."));
      await refreshSelectedJob();
    } catch (e: any) {
      setError(e?.message ?? t("Failed to seed import job.", "Seeden van importjob mislukt."));
    } finally {
      setIsBusy(false);
    }
  };

  const seedImportJobAllPages = async (job: ImportJob) => {
    const jobId = job.jobId ?? job.id;
    if (!jobId) return;
    if (!window.confirm(t("Fetch all pages of this collection and create items? (can take a while)", "Alle pagina's van deze collectie ophalen en items aanmaken? (kan even duren)"))) {
      return;
    }
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await apiPost<{
        seededCount?: number;
        pagesFetched?: number;
        totalPages?: number | null;
      }>(`/api/import-jobs/${jobId}/seed`, {
        allPages: true,
        expectedRevision: job.revision,
      });
      const n = res?.seededCount ?? "?";
      const pf = res?.pagesFetched;
      const tp = res?.totalPages;
      setMessage(
        pf !== undefined
          ? `Gezaaid: ${n} puzzels (${pf} pagina's opgehaald${tp != null ? `; site meldt ${tp} pag.` : ""}).`
          : `Gezaaid: ${n} puzzels.`
      );
      await refreshSelectedJob();
    } catch (e: any) {
      setError(e?.message ?? t("Failed to seed import job.", "Seeden van importjob mislukt."));
    } finally {
      setIsBusy(false);
    }
  };

  const runImportJob = async (jobId: string, maxItems: number) => {
    if (runLockRef.current) {
      setError(t("A run request is already in progress.", "Er loopt al een run-verzoek."));
      return;
    }
    runLockRef.current = true;
    setIsBusy(true);
    setError("");
    setMessage(t("Running import batch...", "Import batch wordt uitgevoerd..."));
    try {
      const response = await apiPost<ItemResponse<RunResult>>(
        `/api/import-jobs/${jobId}/run`,
        { maxItems }
      );
      const result = response.item;
      setMessage(
        result?.message ??
          t(`Run completed (${result?.action ?? "unknown"}).`, `Run voltooid (${result?.action ?? "onbekend"}).`)
      );
      if (result?.counters) {
        setSelectedJob((prev) =>
          prev
            ? {
                ...prev,
                status: (result.counters?.status as ImportJob["status"]) ?? prev.status,
                processedItems: result.counters?.processedItems ?? prev.processedItems,
                successfulItems: result.counters?.successfulItems ?? prev.successfulItems,
                failedItems: result.counters?.failedItems ?? prev.failedItems,
                totalItems: result.counters?.totalItems ?? prev.totalItems,
                currentIndex: result.counters?.currentIndex ?? prev.currentIndex,
              }
            : prev
        );
      }
      await refreshSelectedJob();
    } catch (e: any) {
      setError(e?.message ?? t("Failed to run import job.", "Run van importjob mislukt."));
    } finally {
      runLockRef.current = false;
      setIsBusy(false);
    }
  };

  const pauseJob = async (job: ImportJob) => {
    const jobId = job.jobId ?? job.id;
    if (!jobId) return;
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      await apiPost<ItemResponse<ImportJob>>(`/api/import-jobs/${jobId}/pause`, {
        expectedRevision: job.revision,
      });
      setMessage(t("Job paused.", "Job gepauzeerd."));
      await refreshSelectedJob();
    } catch (e: any) {
      setError(e?.message ?? t("Failed to pause job.", "Pauzeren van job mislukt."));
    } finally {
      setIsBusy(false);
    }
  };

  const resumeJob = async (job: ImportJob) => {
    const jobId = job.jobId ?? job.id;
    if (!jobId) return;
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      await apiPost<ItemResponse<ImportJob>>(`/api/import-jobs/${jobId}/resume`, {
        expectedRevision: job.revision,
      });
      setMessage(t("Job resumed.", "Job hervat."));
      await refreshSelectedJob();
    } catch (e: any) {
      setError(e?.message ?? t("Failed to resume job.", "Hervatten van job mislukt."));
    } finally {
      setIsBusy(false);
    }
  };

  const retryFailed = async (job: ImportJob) => {
    const jobId = job.jobId ?? job.id;
    if (!jobId) return;
    if (!window.confirm(t("Reset failed items to pending for this job?", "Mislukte items resetten naar pending voor deze job?"))) return;
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await apiPost<ItemResponse<{ resetCount?: number }>>(
        `/api/import-jobs/${jobId}/retry-failed`,
        {}
      );
      setMessage(t(`Reset failed items: ${response.item?.resetCount ?? 0}.`, `Mislukte items gereset: ${response.item?.resetCount ?? 0}.`));
      await refreshSelectedJob();
    } catch (e: any) {
      setError(e?.message ?? t("Failed to retry failed items.", "Retry van mislukte items mislukt."));
    } finally {
      setIsBusy(false);
    }
  };

  const retrySkipped = async (job: ImportJob) => {
    const jobId = job.jobId ?? job.id;
    if (!jobId) return;
    if (
      !window.confirm(
        t(
          "Reset skipped items to pending for this job?",
          "Overgeslagen items resetten naar pending voor deze job?"
        )
      )
    )
      return;
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await apiPost<ItemResponse<{ jobId: string; resetCount: number }>>(
        `/api/import-jobs/${jobId}/retry-skipped`,
        {}
      );
      setMessage(
        t(
          `Reset skipped items: ${response.item?.resetCount ?? 0}.`,
          `Overgeslagen items gereset: ${response.item?.resetCount ?? 0}.`
        )
      );
      await refreshSelectedJob();
    } catch (e: any) {
      setError(
        e?.message ??
          t("Failed to retry skipped items.", "Retry van overgeslagen items mislukt.")
      );
    } finally {
      setIsBusy(false);
    }
  };

  const runBatchCount = Math.max(1, Math.min(100, Math.floor(Number(batchSize) || 10)));

  return (
    <div style={rootStyle}>
      <div style={leftColumnStyle}>
        <section style={cardStyle}>
          <h3 style={cardTitleStyle}>{t("Create import job", "Importjob aanmaken")}</h3>
          <div style={formGridStyle}>
            <label style={labelStyle}>
              {t("Source type", "Source type")}
              <input value={sourceType} onChange={(e) => setSourceType(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              {t("Source URL", "Source URL")}
              <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              {t("Collection slug", "Collectie slug")}
              <input value={collectionSlug} onChange={(e) => setCollectionSlug(e.target.value)} style={inputStyle} />
            </label>
            <div style={mutedTextStyle}>
              {language === "nl" ? (
                <>
                  Imports worden in het boek <strong>Puzzels</strong> gezet. Elke Slagzet-collectie wordt een
                  les (naam = collectie); elke puzzel een stap met Scan-PV als zettenreeks (sequence). Zie je
                  niets? Ga naar tab <strong>Curriculum</strong> en klik bovenaan <strong>↻ Laden</strong> om
                  boeken van de server te laden — open dan het boek <strong>Puzzels</strong> en de juiste les.
                </>
              ) : (
                <>
                  Imports are written to the <strong>Puzzles</strong> book. Each Slagzet collection becomes a
                  lesson (name = collection), and each puzzle becomes a step with Scan PV as sequence.
                  If you do not see anything, go to the <strong>Curriculum</strong> tab and click
                  <strong> ↻ Load</strong> to fetch books from the server, then open the
                  <strong> Puzzles</strong> book and the correct lesson.
                </>
              )}
            </div>
            <label style={checkboxRowStyle}>
              <input
                type="checkbox"
                checked={scanEnabled}
                onChange={(e) => setScanEnabled(e.target.checked)}
              />
              {t("Scan enabled", "Scan aan")}
            </label>
            <div style={inlineFieldsStyle}>
              <label style={labelStyle}>
                {t("Scan depth", "Scan diepte")}
                <input value={scanDepth} onChange={(e) => setScanDepth(e.target.value)} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                {t("Scan multiPv", "Scan multiPv")}
                <input value={scanMultiPv} onChange={(e) => setScanMultiPv(e.target.value)} style={inputStyle} />
              </label>
            </div>
            <div style={inlineFieldsStyle}>
              <label style={labelStyle}>
                {t("Base band", "Start band")}
                <select
                  value={baseDifficultyBand}
                  onChange={(e) =>
                    setBaseDifficultyBand(
                      e.target.value as "" | "beginner" | "intermediate" | "advanced"
                    )
                  }
                  style={inputStyle}
                >
                  <option value="">{t("Auto", "Auto")}</option>
                  <option value="beginner">beginner</option>
                  <option value="intermediate">intermediate</option>
                  <option value="advanced">advanced</option>
                </select>
              </label>
              <label style={labelStyle}>
                {t("Base rating", "Start rating")}
                <input
                  value={basePuzzleRating}
                  onChange={(e) => setBasePuzzleRating(e.target.value)}
                  placeholder={t("e.g. 1200", "bijv. 1200")}
                  style={inputStyle}
                />
              </label>
            </div>
            <button type="button" onClick={createImportJob} style={primaryButtonStyle} disabled={isBusy}>
              {t("Create job", "Job aanmaken")}
            </button>
          </div>
        </section>

        <section style={cardStyle}>
          <div style={cardHeaderRowStyle}>
            <h3 style={cardTitleStyle}>{t("Jobs", "Jobs")}</h3>
            <button type="button" onClick={() => void listImportJobs()} style={secondaryButtonStyle}>
              {t("Refresh", "Vernieuwen")}
            </button>
          </div>
          <div style={jobsListStyle}>
            {jobs.map((job) => {
              const id = job.jobId ?? job.id ?? "";
              const selected = id === selectedJobId;
              return (
                <div key={id} style={{ ...jobRowStyle, ...(selected ? selectedJobRowStyle : {}) }}>
                  <button type="button" style={jobSelectButtonStyle} onClick={() => setSelectedJobId(id)}>
                    <div><strong>{id}</strong></div>
                    <div>{job.sourceType} · {job.collectionSlug}</div>
                    <div>{t("Status", "Status")}: {job.status}</div>
                    <div>{job.processedItems}/{job.totalItems} · ok {job.successfulItems} · {t("fail", "fout")} {job.failedItems} · {t("skip", "skip")} {Math.max(0, (job.processedItems ?? 0) - (job.successfulItems ?? 0) - (job.failedItems ?? 0))}</div>
                  </button>
                  <div style={jobActionsStyle}>
                    <button type="button" style={tinyButtonStyle} onClick={() => void getImportJob(id)}>{t("Load details", "Details laden")}</button>
                    <button type="button" style={tinyButtonStyle} onClick={() => void seedImportJob(job)} disabled={isBusy}>{t("Seed p.1", "Seed p.1")}</button>
                    <button type="button" style={tinyButtonStyle} onClick={() => void seedImportJobAllPages(job)} disabled={isBusy}>{t("Seed all pages", "Seed alle pagina's")}</button>
                    <button type="button" style={tinyButtonStyle} onClick={() => void runImportJob(id, 1)} disabled={isBusy}>{t("Run 1", "Run 1")}</button>
                    <button type="button" style={tinyButtonStyle} onClick={() => void runImportJob(id, runBatchCount)} disabled={isBusy}>{t("Run batch", "Run batch")}</button>
                    <button type="button" style={tinyButtonStyle} onClick={() => void pauseJob(job)} disabled={isBusy}>{t("Pause", "Pauze")}</button>
                    <button type="button" style={tinyButtonStyle} onClick={() => void resumeJob(job)} disabled={isBusy}>{t("Resume", "Hervat")}</button>
                    <button type="button" style={tinyButtonStyle} onClick={() => void retryFailed(job)} disabled={isBusy}>{t("Retry failed", "Retry mislukt")}</button>
                    <button type="button" style={tinyButtonStyle} onClick={() => void retrySkipped(job)} disabled={isBusy}>{t("Retry skipped", "Retry overgeslagen")}</button>
                  </div>
                </div>
              );
            })}
            {jobs.length === 0 ? <div style={mutedTextStyle}>{t("No jobs yet.", "Nog geen jobs.")}</div> : null}
          </div>
        </section>
      </div>

      <div style={rightColumnStyle}>
        <section style={cardStyle}>
          <div style={cardHeaderRowStyle}>
            <h3 style={cardTitleStyle}>{t("Selected job", "Geselecteerde job")}</h3>
            <div style={inlineFieldsStyle}>
              <label style={labelStyle}>
                {t("Batch size", "Batchgrootte")}
                <input value={batchSize} onChange={(e) => setBatchSize(e.target.value)} style={inputStyle} />
              </label>
              <button type="button" onClick={() => void refreshSelectedJob()} style={secondaryButtonStyle}>
                {t("Refresh", "Vernieuwen")}
              </button>
            </div>
          </div>
          {selectedJob ? (
            <div style={detailsGridStyle}>
              <div><strong>Job ID:</strong> {selectedJob.jobId ?? selectedJob.id}</div>
              <div><strong>{t("Status", "Status")}:</strong> {selectedJob.status}</div>
              <div><strong>{t("Source", "Bron")}:</strong> {selectedJob.sourceType}</div>
              <div><strong>Slug:</strong> {selectedJob.collectionSlug}</div>
              <div><strong>{t("Base band", "Start band")}:</strong> {selectedJob.baseDifficultyBand ?? "auto"}</div>
              <div><strong>{t("Base rating", "Start rating")}:</strong> {selectedJob.basePuzzleRating ?? "auto"}</div>
              <div><strong>Collectie (les):</strong> {selectedJob.collectionTitle ?? "—"}</div>
              <div><strong>URL:</strong> {selectedJob.sourceUrl}</div>
              <div><strong>{t("Progress", "Voortgang")}:</strong> {selectedJob.processedItems}/{selectedJob.totalItems}</div>
              <div><strong>Success/Failed/Skipped:</strong> {selectedJob.successfulItems}/{selectedJob.failedItems}/{selectedJobSkipped}</div>
              <div><strong>{t("Current index", "Huidige index")}:</strong> {selectedJob.currentIndex}</div>
              <div><strong>Doel:</strong> boek “Puzzels”, les = collectienaam (na seed)</div>
              <div><strong>Scan:</strong> {selectedJob.scanConfig?.enabled ? `on (d=${selectedJob.scanConfig?.depth ?? "?"}, pv=${selectedJob.scanConfig?.multiPv ?? "?"})` : "off"}</div>
              <div><strong>{t("Last error", "Laatste fout")}:</strong> {selectedJob.lastError ?? "—"}</div>
            </div>
          ) : (
            <div style={mutedTextStyle}>{t("No job selected.", "Geen job geselecteerd.")}</div>
          )}
        </section>

        <section style={{ ...cardStyle, minHeight: 0, display: "grid", gridTemplateRows: "auto auto minmax(0,1fr)" }}>
          <div style={cardHeaderRowStyle}>
            <h3 style={cardTitleStyle}>{t("Items", "Items")}</h3>
            <div style={filterRowStyle}>
              {(["all", "pending", "processing", "done", "failed", "skipped"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  style={status === itemFilter ? tinyButtonActiveStyle : tinyButtonStyle}
                  onClick={() => setItemFilter(status)}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
          <div style={mutedTextStyle}>
            {t("Showing", "Toont")} {selectedJobItems.length} {t("item(s)", "item(s)")}
          </div>
          <div style={itemsListStyle}>
            {selectedJobItems.map((item) => (
              <div key={item.itemId ?? item.id ?? `${item.jobId}-${item.index}`} style={itemRowStyle}>
                <div><strong>#{item.index}</strong> · {item.status} · {t("retries", "pogingen")} {item.retries}</div>
                <div style={truncateStyle}>{item.fragmentUrl}</div>
                <div>{t("step", "stap")}: {item.importedStepId ?? "—"}</div>
                <div style={truncateStyle}>{t("result", "resultaat")}: {item.resultText ?? "—"}</div>
                {item.errorMessage ? <div style={errorTextStyle}>{t("error", "fout")}: {item.errorMessage}</div> : null}
              </div>
            ))}
            {selectedJobItems.length === 0 ? (
              <div style={mutedTextStyle}>{t("No items for current filter.", "Geen items voor huidige filter.")}</div>
            ) : null}
          </div>
        </section>

        {message ? <div style={messageStyle}>{message}</div> : null}
        {error ? <div style={errorBoxStyle}>{error}</div> : null}
      </div>
    </div>
  );
}

const rootStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "420px minmax(0, 1fr)",
  gap: 14,
  height: "100%",
  minHeight: 0,
  padding: 14,
  boxSizing: "border-box",
};

const leftColumnStyle: CSSProperties = {
  minHeight: 0,
  display: "grid",
  gap: 12,
  alignContent: "start",
};

const rightColumnStyle: CSSProperties = {
  minHeight: 0,
  display: "grid",
  gap: 12,
  gridTemplateRows: "auto minmax(0, 1fr) auto auto",
};

const cardStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  borderRadius: 12,
  background: "#fff",
  padding: 12,
  display: "grid",
  gap: 8,
};

const cardTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 800,
  color: "#111827",
};

const cardHeaderRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
};

const inputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  border: "1px solid #cfd8e3",
  borderRadius: 8,
  padding: "7px 9px",
  fontSize: 12,
  color: "#111827",
  background: "#fff",
  boxSizing: "border-box",
};

const checkboxRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  color: "#334155",
  fontWeight: 700,
};

const inlineFieldsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "end",
  flexWrap: "wrap",
};

const primaryButtonStyle: CSSProperties = {
  border: "1px solid #2563eb",
  borderRadius: 8,
  background: "#eff6ff",
  color: "#1d4ed8",
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid #cfd8e3",
  borderRadius: 8,
  background: "#fff",
  color: "#1f2937",
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const jobsListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  maxHeight: 360,
  overflowY: "auto",
};

const jobRowStyle: CSSProperties = {
  border: "1px solid #dbe3ec",
  borderRadius: 10,
  background: "#f8fafc",
  padding: 8,
  display: "grid",
  gap: 6,
};

const selectedJobRowStyle: CSSProperties = {
  border: "1px solid #2563eb",
  background: "#eff6ff",
};

const jobSelectButtonStyle: CSSProperties = {
  all: "unset",
  cursor: "pointer",
  display: "grid",
  gap: 2,
  fontSize: 12,
  color: "#111827",
};

const jobActionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const tinyButtonStyle: CSSProperties = {
  border: "1px solid #cfd8e3",
  borderRadius: 8,
  background: "#fff",
  color: "#1f2937",
  padding: "5px 7px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
};

const tinyButtonActiveStyle: CSSProperties = {
  ...tinyButtonStyle,
  border: "1px solid #2563eb",
  background: "#eff6ff",
  color: "#1d4ed8",
};

const detailsGridStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  fontSize: 12,
  color: "#1f2937",
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const itemsListStyle: CSSProperties = {
  minHeight: 0,
  overflowY: "auto",
  display: "grid",
  gap: 8,
};

const itemRowStyle: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#fff",
  padding: "8px 10px",
  display: "grid",
  gap: 3,
  fontSize: 12,
  color: "#1f2937",
};

const truncateStyle: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const mutedTextStyle: CSSProperties = {
  fontSize: 12,
  color: "#64748b",
};

const messageStyle: CSSProperties = {
  fontSize: 12,
  color: "#14532d",
  background: "#f0fdf4",
  border: "1px solid #86efac",
  borderRadius: 8,
  padding: "6px 8px",
};

const errorBoxStyle: CSSProperties = {
  fontSize: 12,
  color: "#7f1d1d",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "6px 8px",
};

const errorTextStyle: CSSProperties = {
  color: "#b91c1c",
};
