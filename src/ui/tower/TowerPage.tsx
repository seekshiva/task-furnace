import React, { useEffect, useState } from "react";
import { formatDisplayDate } from "../date";

type TowerCommit = {
  hash: string;
  author: string;
  date: string;
  message: string;
};

type TowerCommitFile = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
};

const shellBodyClassName =
  "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-[18px] text-[13px] leading-[1.55] shadow-[0_16px_40px_rgba(15,23,42,0.08)] max-md:px-[14px] max-md:py-[14px]";

const mutedTextClassName = "text-[13px] text-slate-500";

const errorClassName =
  "flex flex-col gap-1 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-[14px] text-rose-700";

const towerRowClassName =
  "w-full cursor-pointer rounded-[14px] border border-slate-200 bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-150 hover:-translate-y-px hover:border-blue-200 hover:shadow-[0_12px_24px_rgba(37,99,235,0.08)]";

function getFileStatusBadgeClassName(statusCode: string) {
  switch (statusCode) {
    case "A":
      return "bg-emerald-100 text-emerald-800";
    case "D":
      return "bg-rose-100 text-rose-700";
    case "R":
    case "C":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-blue-100 text-blue-700";
  }
}

export const TowerPage: React.FC = () => {
  const [commits, setCommits] = useState<TowerCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aheadCount, setAheadCount] = useState<number | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<TowerCommit | null>(null);
  const [files, setFiles] = useState<TowerCommitFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/tower/commits");
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || `Request failed with status ${res.status}`);
        }
        const body = (await res.json()) as {
          commits?: TowerCommit[];
          aheadCount?: number;
        };
        if (!cancelled) {
          const list = (body.commits ?? []).filter(
            (commit): commit is TowerCommit => !!commit && typeof commit.hash === "string",
          );
          setCommits(list);
          setAheadCount(
            typeof body.aheadCount === "number" && Number.isFinite(body.aheadCount)
              ? body.aheadCount
              : null,
          );
          if (list.length > 0) {
            setSelectedCommit(list[0] ?? null);
          } else {
            setSelectedCommit(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message ?? "Failed to load commits");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const commit = selectedCommit;
    if (!commit || !commit.hash) {
      setFiles([]);
      setFilesError(null);
      setFilesLoading(false);
      return;
    }

    let cancelled = false;

    async function loadFiles(currentCommit: TowerCommit) {
      try {
        setFilesLoading(true);
        setFilesError(null);

        const hash = currentCommit.hash ?? "";
        const res = await fetch(`/api/tower/commits/${encodeURIComponent(hash)}/files`);
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || `Request failed with status ${res.status}`);
        }

        const body = (await res.json()) as { files?: TowerCommitFile[] };
        if (!cancelled) {
          const rawFiles = body.files ?? [];
          const safeFiles: TowerCommitFile[] = [];

          for (const maybeFile of rawFiles) {
            if (
              maybeFile &&
              typeof maybeFile.path === "string" &&
              typeof maybeFile.status === "string" &&
              typeof maybeFile.additions === "number" &&
              typeof maybeFile.deletions === "number"
            ) {
              safeFiles.push(maybeFile);
            }
          }

          setFiles(safeFiles);
        }
      } catch (err) {
        if (!cancelled) {
          setFilesError((err as Error).message ?? "Failed to load commit files");
        }
      } finally {
        if (!cancelled) {
          setFilesLoading(false);
        }
      }
    }

    void loadFiles(commit);

    return () => {
      cancelled = true;
    };
  }, [selectedCommit]);

  const handleSelectCommit = (commit: TowerCommit) => {
    setSelectedCommit(commit);
  };

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col">
      <div className={shellBodyClassName}>
        <div className="text-sm font-semibold text-slate-900">Tower</div>
        {loading && <div className={mutedTextClassName}>Loading recent commits…</div>}
        {error && !loading && (
          <div className={errorClassName}>
            <div>Couldn&apos;t load commits.</div>
            <div className="text-xs text-amber-700">{error}</div>
          </div>
        )}

        {!loading && !error && aheadCount !== null && (
          <div className={mutedTextClassName}>
            {aheadCount === 0
              ? "No commits ahead of main. Current branch is up to date with main."
              : `${aheadCount} commit${aheadCount === 1 ? "" : "s"} ahead of main.`}
          </div>
        )}

        {!loading && !error && commits.length === 0 && aheadCount === null && (
          <div className={mutedTextClassName}>No commits found (or repository is empty).</div>
        )}

        {!loading && !error && commits.length > 0 && (
          <div className="flex min-h-0 flex-1 gap-3 max-[900px]:flex-col">
            <div className="flex min-w-0 max-w-[50%] basis-[40%] flex-col gap-2 overflow-y-auto max-[900px]:max-w-none max-[900px]:basis-auto">
              <div className="mt-0.5 flex flex-col gap-2">
                {commits.map((commit) => {
                  const isSelected = selectedCommit && selectedCommit.hash === commit.hash;
                  return (
                    <button
                      key={commit.hash}
                      type="button"
                      className={[
                        towerRowClassName,
                        isSelected
                          ? "border-blue-300 bg-sky-50 shadow-[0_0_0_3px_rgba(147,197,253,0.22)]"
                          : "",
                      ].join(" ")}
                      onClick={() => handleSelectCommit(commit)}
                    >
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="text-sm font-semibold text-slate-900">{commit.message}</div>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                          <span>{commit.author}</span>
                          <span>
                            {formatDisplayDate(commit.date)}
                          </span>
                          <span className="font-mono">{commit.hash.slice(0, 10)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {aheadCount !== null && (
                  <div className={mutedTextClassName}>
                    Showing {commits.length} commit
                    {commits.length === 1 ? "" : "s"} ahead of main (total {aheadCount}).
                  </div>
                )}
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
              {!selectedCommit && (
                <div className={mutedTextClassName}>Select a commit to see details.</div>
              )}

              {selectedCommit && (
                <div className="flex min-h-0 flex-1 flex-col gap-2.5 rounded-[18px] border border-slate-200 bg-slate-50 p-[14px]">
                  <div className="flex min-h-0 flex-col gap-2">
                    <div className="text-sm font-semibold text-slate-900">
                      {selectedCommit.message}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>{selectedCommit.author}</span>
                      <span>{formatDisplayDate(selectedCommit.date)}</span>
                      <span className="font-mono">{selectedCommit.hash.slice(0, 10)}</span>
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-col gap-2">
                    {filesLoading && (
                      <div className={mutedTextClassName}>Loading changed files…</div>
                    )}
                    {filesError && !filesLoading && (
                      <div className={errorClassName}>
                        <div>Couldn&apos;t load changed files.</div>
                        <div className="text-xs text-amber-700">{filesError}</div>
                      </div>
                    )}

                    {!filesLoading && !filesError && files.length === 0 && (
                      <div className={mutedTextClassName}>
                        No file changes found for this commit.
                      </div>
                    )}

                    {!filesLoading && !filesError && files.length > 0 && (
                      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
                        {files.map((file) => {
                          const statusCode = file.status;
                          const statusLabel =
                            statusCode === "A"
                              ? "Added"
                              : statusCode === "D"
                                ? "Deleted"
                                : statusCode === "R"
                                  ? "Renamed"
                                  : statusCode === "C"
                                    ? "Copied"
                                    : "Modified";

                          return (
                            <div
                              key={file.path}
                              className="rounded-[14px] border border-slate-200 bg-white px-[11px] py-[9px] shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                            >
                              <div className="flex items-center justify-between gap-2.5 max-md:flex-col max-md:items-start">
                                <span className="break-all text-xs">{file.path}</span>
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.04em] ${getFileStatusBadgeClassName(statusCode)}`}
                                >
                                  {statusLabel}
                                </span>
                              </div>
                              <div className="mt-1 text-[11px] text-slate-500">
                                <span className="font-mono">
                                  +{file.additions} / -{file.deletions}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

