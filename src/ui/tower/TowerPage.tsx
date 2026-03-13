import React, { useEffect, useState } from "react";

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
    <section className="tf-shell-window">
      <div className="tf-shell-body tf-sessions-body">
        <div className="tf-page-title">Tower</div>
        {loading && <div className="tf-sessions-muted">Loading recent commits…</div>}
        {error && !loading && (
          <div className="tf-sessions-error">
            <div>Couldn&apos;t load commits.</div>
            <div className="tf-sessions-error-raw">{error}</div>
          </div>
        )}

        {!loading && !error && aheadCount !== null && (
          <div className="tf-sessions-muted">
            {aheadCount === 0
              ? "No commits ahead of main. Current branch is up to date with main."
              : `${aheadCount} commit${aheadCount === 1 ? "" : "s"} ahead of main.`}
          </div>
        )}

        {!loading && !error && commits.length === 0 && aheadCount === null && (
          <div className="tf-sessions-muted">No commits found (or repository is empty).</div>
        )}

        {!loading && !error && commits.length > 0 && (
          <div className="tf-tower-layout">
            <div className="tf-tower-left">
              <div className="tf-sessions-list-inner tf-tower-list">
                {commits.map((commit) => {
                  const isSelected = selectedCommit && selectedCommit.hash === commit.hash;
                  return (
                    <button
                      key={commit.hash}
                      type="button"
                      className={`tf-tower-row ${isSelected ? "tf-tower-row-selected" : ""}`}
                      onClick={() => handleSelectCommit(commit)}
                    >
                      <div className="tf-tower-row-main">
                        <div className="tf-tower-message">{commit.message}</div>
                        <div className="tf-tower-meta">
                          <span className="tf-tower-author">{commit.author}</span>
                          <span className="tf-tower-date">
                            {new Date(commit.date).toLocaleString()}
                          </span>
                          <span className="tf-tower-hash">{commit.hash.slice(0, 10)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {aheadCount !== null && (
                  <div className="tf-sessions-muted tf-tower-ahead-indicator">
                    Showing {commits.length} commit
                    {commits.length === 1 ? "" : "s"} ahead of main (total {aheadCount}).
                  </div>
                )}
              </div>
            </div>

            <div className="tf-tower-right">
              {!selectedCommit && (
                <div className="tf-sessions-muted">Select a commit to see details.</div>
              )}

              {selectedCommit && (
                <div className="tf-tower-detail">
                  <div className="tf-tower-detail-header">
                    <div className="tf-tower-detail-title">{selectedCommit.message}</div>
                    <div className="tf-tower-detail-meta">
                      <span>{selectedCommit.author}</span>
                      <span>{new Date(selectedCommit.date).toLocaleString()}</span>
                      <span className="tf-tower-hash">{selectedCommit.hash.slice(0, 10)}</span>
                    </div>
                  </div>

                  <div className="tf-tower-detail-body">
                    {filesLoading && (
                      <div className="tf-sessions-muted">Loading changed files…</div>
                    )}
                    {filesError && !filesLoading && (
                      <div className="tf-sessions-error">
                        <div>Couldn&apos;t load changed files.</div>
                        <div className="tf-sessions-error-raw">{filesError}</div>
                      </div>
                    )}

                    {!filesLoading && !filesError && files.length === 0 && (
                      <div className="tf-sessions-muted">
                        No file changes found for this commit.
                      </div>
                    )}

                    {!filesLoading && !filesError && files.length > 0 && (
                      <div className="tf-tower-files-list">
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
                            <div key={file.path} className="tf-tower-file-row">
                              <div className="tf-tower-file-main">
                                <span className="tf-tower-file-path">{file.path}</span>
                                <span
                                  className={`tf-tower-file-status tf-tower-file-status-${statusCode.toLowerCase()}`}
                                >
                                  {statusLabel}
                                </span>
                              </div>
                              <div className="tf-tower-file-meta">
                                <span className="tf-tower-file-lines">
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

