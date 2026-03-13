import React, { useEffect, useState } from "react";
import {
  getSessionCreatedAt,
  normalizeSessionStatus,
  isActiveSessionStatus,
} from "./types";
import { formatDisplayDate } from "../date";
import type { Session, SessionStatusMap, SessionActivityMap } from "./types";

const shellBodyClassName =
  "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-[18px] text-[13px] leading-[1.55] shadow-[0_16px_40px_rgba(15,23,42,0.08)] max-md:px-[14px] max-md:py-[14px]";

const mutedTextClassName = "text-[13px] text-slate-500";

const errorClassName =
  "flex flex-col gap-1 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-[14px] text-rose-700";

const sessionRowClassName =
  "flex w-full cursor-pointer items-center justify-between gap-3 rounded-[14px] border border-slate-200 bg-white px-[14px] py-3 text-left text-inherit shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-150 hover:-translate-y-px hover:border-blue-200 hover:shadow-[0_12px_24px_rgba(37,99,235,0.08)] max-md:flex-col max-md:items-start";

const columnClassName =
  "flex h-full min-h-0 min-w-[280px] shrink-0 self-stretch rounded-[18px] border border-slate-200 bg-slate-50 p-3 md:w-[280px] lg:w-[364px] lg:min-w-[364px]";

const emptyPaneClassName =
  "flex flex-1 items-center justify-center rounded-[14px] border border-dashed border-slate-300 bg-white/65 p-[14px] text-[13px] text-slate-400";

const columnBodyClassName = "mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1";

export const SessionsPage: React.FC<{ navigate: (path: string) => void }> = ({
  navigate,
}) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatusMap>({});
  const [activity, setActivity] = useState<SessionActivityMap>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [sessionsRes, statusRes, activityRes] = await Promise.all([
          fetch("/api/sessions"),
          fetch("/api/sessions/status"),
          fetch("/api/sessions/activity"),
        ]);

        if (!sessionsRes.ok) {
          throw new Error(`Sessions request failed with status ${sessionsRes.status}`);
        }
        const body = (await sessionsRes.json()) as { sessions?: Session[] };

        let statusBody: { status?: SessionStatusMap } | null = null;
        if (statusRes.ok) {
          statusBody = (await statusRes.json()) as { status?: SessionStatusMap };
        }

        let activityBody: { activity?: SessionActivityMap } | null = null;
        if (activityRes.ok) {
          activityBody = (await activityRes.json()) as { activity?: SessionActivityMap };
        }

        if (!cancelled) {
          setSessions(body.sessions ?? []);
          if (statusBody?.status) {
            setSessionStatus(statusBody.status);
          } else {
            setSessionStatus({});
          }
          if (activityBody?.activity) {
            setActivity(activityBody.activity);
          } else {
            setActivity({});
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message ?? "Failed to load sessions");
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
    // Lightweight polling so the board reflects status changes over time.
    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const [sessionsRes, statusRes, activityRes] = await Promise.all([
            fetch("/api/sessions"),
            fetch("/api/sessions/status"),
            fetch("/api/sessions/activity"),
          ]);

          if (sessionsRes.ok) {
            const body = (await sessionsRes.json()) as { sessions?: Session[] };
            setSessions(body.sessions ?? []);
          }

          if (statusRes.ok) {
            const body = (await statusRes.json()) as { status?: SessionStatusMap };
            setSessionStatus(body.status ?? {});
          }

          if (activityRes.ok) {
            const body = (await activityRes.json()) as { activity?: SessionActivityMap };
            setActivity(body.activity ?? {});
          }
        } catch {
          // Best-effort refresh; keep existing state on failure.
        }
      })();
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const activeSessions: Session[] = [];
  const readySessions: Session[] = [];

  for (const session of sessions) {
    const activityEntry = activity[session.id];
    const isActiveFromActivity = activityEntry?.state === "active";

    const normalized = normalizeSessionStatus(session, sessionStatus[session.id]);
    const isActive = isActiveFromActivity || isActiveSessionStatus(normalized);

    if (isActive) {
      activeSessions.push(session);
    } else {
      readySessions.push(session);
    }
  }

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col">
      <div className={shellBodyClassName}>
        {loading && <div className={mutedTextClassName}>Loading sessions from opencode…</div>}
        {error && !loading && (
          <div className={errorClassName}>
            <div>Couldn&apos;t load sessions.</div>
            <div className="text-amber-700">
              Make sure <code>opencode web</code> is running, then refresh this page.
            </div>
            <div className="text-xs text-amber-700">{error}</div>
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className={mutedTextClassName}>No sessions found yet.</div>
        )}

        {!loading && !error && (
          <div className="flex min-h-0 flex-1 flex-col gap-2.5">
            <div className="flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto overflow-y-hidden pb-2">
              <div className={columnClassName}>
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">Drafts</span>
                    <span className="min-w-7 rounded-full border border-slate-200 bg-white px-[9px] py-[3px] text-center text-xs text-slate-500">
                      0
                    </span>
                  </div>
                  <div className={columnBodyClassName}>
                    <div className={emptyPaneClassName}>No items yet.</div>
                  </div>
                </div>
              </div>

              <div className={columnClassName}>
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">Active</span>
                    <span className="min-w-7 rounded-full border border-slate-200 bg-white px-[9px] py-[3px] text-center text-xs text-slate-500">
                      {activeSessions.length}
                    </span>
                  </div>
                  <div className={columnBodyClassName}>
                    {activeSessions.length === 0 && (
                      <div className="rounded-[14px] border border-dashed border-slate-300 bg-white/65 p-[14px] text-[13px] text-slate-500">
                        No active sessions.
                      </div>
                    )}
                    {activeSessions.map((session) => {
                      const normalized = normalizeSessionStatus(
                        session,
                        sessionStatus[session.id],
                      );
                      const statusLabel = normalized.label ?? normalized.type;
                      const createdLabel = formatDisplayDate(getSessionCreatedAt(session));
                      return (
                        <button
                          key={session.id}
                          type="button"
                          className={sessionRowClassName}
                          onClick={() => navigate(`/sessions/${session.id}`)}
                        >
                          <div className="flex min-w-0 flex-col gap-1">
                            <div className="text-sm font-semibold text-slate-900">
                              {session.title || session.id.slice(0, 8)}
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                {statusLabel}
                              </span>
                            </div>
                            {createdLabel && (
                              <div className="text-xs text-slate-500">Created {createdLabel}</div>
                            )}
                          </div>
                          <div className="shrink-0 text-lg text-slate-400">›</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className={columnClassName}>
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">Ready</span>
                    <span className="min-w-7 rounded-full border border-slate-200 bg-white px-[9px] py-[3px] text-center text-xs text-slate-500">
                      {readySessions.length}
                    </span>
                  </div>
                  <div className={columnBodyClassName}>
                    {readySessions.length === 0 && (
                      <div className="rounded-[14px] border border-dashed border-slate-300 bg-white/65 p-[14px] text-[13px] text-slate-500">
                        No ready sessions.
                      </div>
                    )}
                    {readySessions.map((session) => {
                      const normalized = normalizeSessionStatus(
                        session,
                        sessionStatus[session.id],
                      );
                      const statusLabel = normalized.label ?? normalized.type;
                      const createdLabel = formatDisplayDate(getSessionCreatedAt(session));
                      return (
                        <button
                          key={session.id}
                          type="button"
                          className={sessionRowClassName}
                          onClick={() => navigate(`/sessions/${session.id}`)}
                        >
                          <div className="flex min-w-0 flex-col gap-1">
                            <div className="text-sm font-semibold text-slate-900">
                              {session.title || session.id.slice(0, 8)}
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                {statusLabel}
                              </span>
                            </div>
                            {createdLabel && (
                              <div className="text-xs text-slate-500">Created {createdLabel}</div>
                            )}
                          </div>
                          <div className="shrink-0 text-lg text-slate-400">›</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className={columnClassName}>
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">Done</span>
                    <span className="min-w-7 rounded-full border border-slate-200 bg-white px-[9px] py-[3px] text-center text-xs text-slate-500">
                      0
                    </span>
                  </div>
                  <div className={columnBodyClassName}>
                    <div className={emptyPaneClassName}>No items yet.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

