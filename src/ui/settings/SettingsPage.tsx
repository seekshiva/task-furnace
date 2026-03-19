import React, { useEffect, useState } from "react";

type VersionInfo = {
  hash: string;
  date: string;
};

type UpdateResult = {
  success: boolean;
  alreadyUpToDate?: boolean;
  output?: string;
  error?: string;
};

const shellBodyClassName =
  "flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto rounded-[20px] border border-slate-200 dark:border-slate-700 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] dark:bg-[linear-gradient(180deg,#0f172a_0%,#1e293b_100%)] p-[18px] text-[13px] leading-[1.55] shadow-[0_16px_40px_rgba(15,23,42,0.08)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.3)] max-md:px-[14px] max-md:py-[14px]";

const mutedTextClassName = "text-[13px] text-slate-500 dark:text-slate-400";

const errorClassName =
  "flex flex-col gap-1 rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 px-4 py-[14px] text-rose-700 dark:text-rose-300";

const successClassName =
  "flex flex-col gap-1 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 px-4 py-[14px] text-emerald-700 dark:text-emerald-300";

function formatCommitDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const month = months[date.getMonth()];
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;

  return `${month} ${day}, ${year} - ${hours}:${minutes}${ampm}`;
}

export const SettingsPage: React.FC = () => {
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [versionLoading, setVersionLoading] = useState(true);
  const [versionError, setVersionError] = useState<string | null>(null);

  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null);

  async function loadVersion() {
    try {
      setVersionLoading(true);
      setVersionError(null);
      const res = await fetch("/api/settings/version");
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Request failed with status ${res.status}`);
      }
      const body = (await res.json()) as VersionInfo;
      setVersion(body);
    } catch (err) {
      setVersionError((err as Error).message ?? "Failed to load version info");
    } finally {
      setVersionLoading(false);
    }
  }

  useEffect(() => {
    void loadVersion();
  }, []);

  async function handleCheckForUpdates() {
    try {
      setUpdating(true);
      setUpdateResult(null);
      const res = await fetch("/api/settings/update", { method: "POST" });
      const body = (await res.json()) as UpdateResult;
      setUpdateResult(body);

      if (body.success) {
        void loadVersion();
      }
    } catch (err) {
      setUpdateResult({
        success: false,
        error: (err as Error).message ?? "Update request failed",
      });
    } finally {
      setUpdating(false);
    }
  }

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col">
      <div className={shellBodyClassName}>
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Settings</div>

        {/* Version info section */}
        <div className="flex flex-col gap-3 rounded-[18px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-[14px]">
          <div className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">
            Current Version
          </div>

          {versionLoading && (
            <div className={mutedTextClassName}>Loading version info…</div>
          )}

          {versionError && !versionLoading && (
            <div className={errorClassName}>
              <div>Couldn&apos;t load version info.</div>
              <div className="text-xs text-amber-700 dark:text-amber-400">{versionError}</div>
            </div>
          )}

          {!versionLoading && !versionError && version && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span className={mutedTextClassName}>Commit</span>
                <span className="rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1 font-mono text-[12px] text-slate-800 dark:text-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  {version.hash.slice(0, 10)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={mutedTextClassName}>Date</span>
                <span className="text-[13px] text-slate-700 dark:text-slate-300">
                  {formatCommitDate(version.date)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Update section */}
        <div className="flex flex-col gap-3 rounded-[18px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-[14px]">
          <div className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">
            Updates
          </div>
          <div className={mutedTextClassName}>
            Pull the latest changes from <span className="font-mono">origin/main</span> to update this app.
          </div>
          <div>
            <button
              type="button"
              disabled={updating}
              onClick={handleCheckForUpdates}
              className="rounded-full border border-blue-300 dark:border-blue-600 bg-blue-600 dark:bg-blue-700 px-5 py-[8px] text-[13px] font-semibold text-white shadow-[0_1px_3px_rgba(37,99,235,0.18)] transition hover:bg-blue-700 dark:hover:bg-blue-600 active:bg-blue-800 dark:active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {updating ? "Checking for updates…" : "Check for Updates"}
            </button>
          </div>

          {updateResult && updateResult.success && (
            <div className={successClassName}>
              <div className="text-[13px] font-semibold">
                {updateResult.alreadyUpToDate
                  ? "Already up to date"
                  : "Updated successfully"}
              </div>
              {updateResult.output && !updateResult.alreadyUpToDate && (
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-emerald-100 dark:bg-emerald-900/40 p-2 font-mono text-[11px] text-emerald-800 dark:text-emerald-200">
                  {updateResult.output}
                </pre>
              )}
            </div>
          )}

          {updateResult && !updateResult.success && (
            <div className={errorClassName}>
              <div className="text-[13px] font-semibold">Update failed</div>
              {updateResult.error && (
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-rose-100 dark:bg-rose-900/40 p-2 font-mono text-[11px] text-rose-800 dark:text-rose-200">
                  {updateResult.error}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
