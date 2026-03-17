import React, { useEffect, useMemo, useState } from "react";
import {
  getSessionCreatedAt,
  getSessionParentId,
  normalizeSessionStatus,
  isActiveSessionStatus,
} from "./types";
import { formatDisplayDate } from "../date";
import type { Session, SessionStatusMap, SessionActivityMap } from "./types";

const shellBodyClassName =
  "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto text-[13px] leading-[1.55]";

const mutedTextClassName = "text-[13px] text-slate-500";

const errorClassName =
  "flex flex-col gap-1 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-[14px] text-rose-700";

const sessionRowClassName =
  "flex w-full shrink-0 cursor-pointer items-center justify-between gap-3 rounded-[14px] border border-slate-200 bg-white px-[14px] py-3 text-left text-inherit shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-150 hover:-translate-y-px hover:border-blue-200 hover:shadow-[0_12px_24px_rgba(37,99,235,0.08)] max-md:flex-col max-md:items-start";

const columnClassName =
  "flex min-h-[240px] min-w-[280px] shrink-0 self-stretch rounded-[18px] border border-slate-200 bg-slate-50 p-3 md:w-[280px] lg:w-[364px] lg:min-w-[364px]";

const emptyPaneClassName =
  "flex min-h-[96px] flex-1 shrink-0 items-center justify-center rounded-[14px] border border-dashed border-slate-300 bg-white/65 p-[14px] text-[13px] text-slate-400";

const columnBodyClassName = "mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1";

const groupClassName =
  "relative flex shrink-0 flex-col overflow-visible rounded-[18px] border border-slate-200 bg-slate-50/70";

const groupHeaderButtonClassName =
  "sticky top-0 z-10 flex w-full shrink-0 items-center justify-between gap-3 bg-white/95 px-3 py-2.5 text-left backdrop-blur-sm transition hover:bg-slate-50";

type SessionColumnKey = "drafts" | "active" | "ready" | "done";

type SessionGroupColumns = Record<SessionColumnKey, Session[]>;

type SessionGroup = {
  key: string;
  label: string;
  sortValue: number;
  totalCount: number;
  columns: SessionGroupColumns;
};

const columnDefinitions: Array<{
  key: SessionColumnKey;
  title: string;
  emptyMessage: string;
}> = [
  { key: "drafts", title: "Drafts", emptyMessage: "No draft sessions." },
  { key: "active", title: "Active", emptyMessage: "No active sessions." },
  { key: "ready", title: "Ready", emptyMessage: "No ready sessions." },
  { key: "done", title: "Done", emptyMessage: "No completed sessions." },
];

function getSessionTimestamp(createdAt?: string | null): number {
  if (!createdAt) {
    return Number.NEGATIVE_INFINITY;
  }

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return Number.NEGATIVE_INFINITY;
  }

  return date.getTime();
}

function isTopLevelSession(session: Session): boolean {
  const parentId = getSessionParentId(session);
  return !parentId;
}

function getChronologicalTimestamp(session: Session): number {
  const createdAt = getSessionCreatedAt(session);
  if (!createdAt) return Number.POSITIVE_INFINITY;
  const date = new Date(createdAt);
  const ms = date.getTime();
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function getSessionDateKey(session: Session): string {
  const createdAt = getSessionCreatedAt(session);
  if (!createdAt) {
    return "unknown";
  }

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  return toLocalDateKey(date);
}

function formatSessionGroupLabel(dateKey: string): string {
  if (dateKey === "unknown") {
    return "Unknown date";
  }

  const date = parseDateKey(dateKey);
  return formatDisplayDate(date) ?? "Unknown date";
}

function getSessionGroupSortValue(dateKey: string): number {
  if (dateKey === "unknown") {
    return Number.NEGATIVE_INFINITY;
  }

  const date = parseDateKey(dateKey);
  if (!date || Number.isNaN(date.getTime())) {
    return Number.NEGATIVE_INFINITY;
  }

  return date.getTime();
}

function createEmptyColumns(): SessionGroupColumns {
  return {
    drafts: [],
    active: [],
    ready: [],
    done: [],
  };
}

function getRawSessionStatusValue(
  session: Session,
  statusEntry: SessionStatusMap[string] | undefined,
): string | null {
  return statusEntry?.type ?? statusEntry?.state ?? statusEntry?.status ?? session.status ?? null;
}

function getSessionColumnKey(
  session: Session,
  statusEntry: SessionStatusMap[string] | undefined,
  activityEntry: SessionActivityMap[string] | undefined,
): SessionColumnKey {
  const rawStatus = getRawSessionStatusValue(session, statusEntry)?.trim().toLowerCase() ?? null;

  if (rawStatus === "draft" || rawStatus === "drafts") {
    return "drafts";
  }

  if (
    rawStatus === "done" ||
    rawStatus === "complete" ||
    rawStatus === "completed" ||
    rawStatus === "closed"
  ) {
    return "done";
  }

  const isActiveFromActivity = activityEntry?.state === "active";
  const normalized = normalizeSessionStatus(session, statusEntry);
  return isActiveFromActivity || isActiveSessionStatus(normalized) ? "active" : "ready";
}

function mergeExpandedGroups(
  previous: Record<string, boolean>,
  groups: SessionGroup[],
): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  let changed = Object.keys(previous).length !== groups.length;

  for (const [index, group] of groups.entries()) {
    const nextValue = previous[group.key] ?? index < 3;
    next[group.key] = nextValue;

    if (previous[group.key] !== nextValue) {
      changed = true;
    }
  }

  return changed ? next : previous;
}

const SessionCard: React.FC<{
  session: Session;
  statusEntry: SessionStatusMap[string] | undefined;
  navigate: (path: string) => void;
  directAgentCount: number;
  subtreeSize: number;
  doneCount: number;
  activeCount: number;
  readyChildrenCount: number;
  totalChildrenCount: number;
  subSessions: Session[];
  isTreeExpanded: boolean;
  onToggleTree: () => void;
  getSessionStatusLabel: (session: Session) => string;
}> = ({
  session,
  statusEntry,
  navigate,
  directAgentCount,
  subtreeSize,
  doneCount,
  activeCount,
  readyChildrenCount,
  totalChildrenCount,
  subSessions,
  isTreeExpanded,
  onToggleTree,
  getSessionStatusLabel,
}) => {
  const normalized = normalizeSessionStatus(session, statusEntry);
  const statusLabel = normalized.label ?? normalized.type;
  const createdLabel = formatDisplayDate(getSessionCreatedAt(session));

  const totalInTree = Math.max(subtreeSize, 1);
  const completedRatio =
    totalChildrenCount > 0 ? readyChildrenCount / totalChildrenCount : 0;
  const completedPercent = Math.round(completedRatio * 100);
  const hasSubtree = directAgentCount > 0;

  return (
    <div className="flex w-full flex-col gap-2">
      <button
        type="button"
        className={sessionRowClassName}
        onClick={() => navigate(`/sessions/${session.id}`)}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="text-sm font-semibold text-slate-900">
            {session.title || session.id.slice(0, 8)}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500 items-center">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
              {statusLabel}
            </span>
            {hasSubtree && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-200"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleTree();
                }}
                aria-expanded={hasSubtree ? isTreeExpanded : undefined}
                aria-label={
                  isTreeExpanded ? "Hide sub-agent sessions" : "Show sub-agent sessions"
                }
              >
                <span>{directAgentCount} sub-agents</span>
                <span className="text-[12px] text-slate-500">{isTreeExpanded ? "▾" : "▸"}</span>
              </button>
            )}
          </div>
          {hasSubtree && (
            <div className="mt-1 flex items-center gap-2">
              <div className="relative h-[6px] w-24 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-blue-500 transition-[width] duration-150"
                  style={{ width: `${completedPercent}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-500">
                {readyChildrenCount}/{totalChildrenCount} ready
                {activeCount > 0 ? ` · ${activeCount} active` : ""}
              </span>
            </div>
          )}
          {createdLabel && <div className="text-xs text-slate-500">Created {createdLabel}</div>}
        </div>
        <div className="shrink-0 text-lg text-slate-400">›</div>
      </button>

      {hasSubtree && isTreeExpanded && subSessions.length > 0 && (
        <div className="ml-2.5 flex flex-col gap-1 rounded-[14px] border border-slate-200 bg-white px-2.5 py-2">
          <div className="px-1 text-[11px] font-semibold text-slate-500">
            Sub-agents (oldest first)
          </div>
          <div className="flex flex-col gap-1">
            {subSessions.map((sub) => {
              const createdAt = formatDisplayDate(getSessionCreatedAt(sub));
              const subStatus = getSessionStatusLabel(sub);
              return (
                <button
                  key={sub.id}
                  type="button"
                  className="flex items-center justify-between gap-2 rounded-[12px] border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-[12px] text-slate-700 transition hover:border-blue-200 hover:bg-blue-50/60"
                  onClick={() => navigate(`/sessions/${sub.id}`)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {sub.title || sub.id.slice(0, 8)}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span className="rounded-full bg-emerald-100 px-2 py-[2px] text-[10px] font-semibold text-emerald-800">
                        {subStatus}
                      </span>
                      {createdAt && <span>{createdAt}</span>}
                    </div>
                  </div>
                  <span className="shrink-0 text-slate-400">›</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export const SessionsPage: React.FC<{ navigate: (path: string) => void }> = ({
  navigate,
}) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatusMap>({});
  const [activity, setActivity] = useState<SessionActivityMap>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedTrees, setExpandedTrees] = useState<Record<string, boolean>>({});

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

  const sessionGroups = useMemo(() => {
    const groupsByKey = new Map<string, SessionGroup>();
    const sessionsById = new Map<string, Session>();
    const childrenById = new Map<string, Session[]>();

    for (const session of sessions) {
      sessionsById.set(session.id, session);
    }

    for (const session of sessions) {
      const parentId = getSessionParentId(session);
      if (!parentId) continue;
      const list = childrenById.get(parentId) ?? [];
      list.push(session);
      childrenById.set(parentId, list);
    }

    function getSubtree(root: Session): Session[] {
      const out: Session[] = [];
      const stack: Session[] = [root];
      const seen = new Set<string>();

      while (stack.length > 0) {
        const current = stack.pop();
        if (!current) continue;
        if (seen.has(current.id)) continue;
        seen.add(current.id);
        out.push(current);
        const children = childrenById.get(current.id) ?? [];
        for (const child of children) {
          stack.push(child);
        }
      }

      return out;
    }

    function getDirectChildren(parentId: string): Session[] {
      return (childrenById.get(parentId) ?? []).slice();
    }

    const topLevelSessions = sessions.filter(isTopLevelSession);

    for (const session of topLevelSessions) {
      const dateKey = getSessionDateKey(session);
      const statusEntry = sessionStatus[session.id];
      const activityEntry = activity[session.id];

      let group = groupsByKey.get(dateKey);
      if (!group) {
        group = {
          key: dateKey,
          label: formatSessionGroupLabel(dateKey),
          sortValue: getSessionGroupSortValue(dateKey),
          totalCount: 0,
          columns: createEmptyColumns(),
        };
        groupsByKey.set(dateKey, group);
      }

      const columnKey = getSessionColumnKey(session, statusEntry, activityEntry);
      const subtree = getSubtree(session);
      let doneCount = 0;
      let activeCount = 0;
      let readyChildrenCount = 0;
      const directChildren = getDirectChildren(session.id);
      const directAgentCount = directChildren.length;

      for (const item of subtree) {
        const itemStatus = sessionStatus[item.id];
        const itemActivity = activity[item.id];
        const itemColumn = getSessionColumnKey(item, itemStatus, itemActivity);
        if (itemColumn === "done") doneCount += 1;
        if (itemColumn === "active") activeCount += 1;
      }

      for (const child of directChildren) {
        const childStatus = sessionStatus[child.id];
        const childActivity = activity[child.id];
        const childColumn = getSessionColumnKey(child, childStatus, childActivity);
        if (childColumn === "ready") readyChildrenCount += 1;
      }

      (group as SessionGroup & {
        treeMeta?: Record<
          string,
          {
            directAgentCount: number;
            subtreeSize: number;
            doneCount: number;
            activeCount: number;
            readyChildrenCount: number;
            totalChildrenCount: number;
            subSessions: Session[];
          }
        >;
      }).treeMeta ??= {};
      (group as SessionGroup & {
        treeMeta?: Record<
          string,
          {
            directAgentCount: number;
            subtreeSize: number;
            doneCount: number;
            activeCount: number;
            readyChildrenCount: number;
            totalChildrenCount: number;
            subSessions: Session[];
          }
        >;
      }).treeMeta![session.id] = {
        directAgentCount,
        subtreeSize: subtree.length,
        doneCount,
        activeCount,
        readyChildrenCount,
        totalChildrenCount: directChildren.length,
        subSessions: subtree
          .filter((s) => s.id !== session.id)
          .sort((left, right) => getChronologicalTimestamp(left) - getChronologicalTimestamp(right)),
      };

      group.columns[columnKey].push(session);
      group.totalCount += 1;
    }

    const groups = Array.from(groupsByKey.values()).sort(
      (left, right) => right.sortValue - left.sortValue,
    );

    for (const group of groups) {
      for (const column of columnDefinitions) {
        group.columns[column.key].sort((left, right) => {
          return (
            getSessionTimestamp(getSessionCreatedAt(right)) -
            getSessionTimestamp(getSessionCreatedAt(left))
          );
        });
      }
    }

    return groups.map((group) => {
      return {
        ...group,
        treeMeta:
          (group as SessionGroup & {
            treeMeta?: Record<
              string,
              {
                directAgentCount: number;
                subtreeSize: number;
                doneCount: number;
                activeCount: number;
                readyChildrenCount: number;
                totalChildrenCount: number;
                subSessions: Session[];
              }
            >;
          }).treeMeta ?? {},
      } as SessionGroup & {
        treeMeta: Record<
          string,
          {
            directAgentCount: number;
            subtreeSize: number;
            doneCount: number;
            activeCount: number;
            readyChildrenCount: number;
            totalChildrenCount: number;
            subSessions: Session[];
          }
        >;
      };
    });
  }, [activity, sessionStatus, sessions]);

  useEffect(() => {
    setExpandedGroups((previous) => mergeExpandedGroups(previous, sessionGroups));
  }, [sessionGroups]);

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
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {sessionGroups.map((group) => {
              const isExpanded = expandedGroups[group.key] ?? false;

              return (
                <div key={group.key} className={groupClassName}>
                  <button
                    type="button"
                    className={`${groupHeaderButtonClassName} ${
                      isExpanded ? "rounded-t-[18px]" : "rounded-[18px]"
                    }`}
                    onClick={() =>
                      setExpandedGroups((previous) => ({
                        ...previous,
                        [group.key]: !isExpanded,
                      }))
                    }
                    aria-expanded={isExpanded}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900">{group.label}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="min-w-7 rounded-full border border-slate-200 bg-slate-50 px-[9px] py-[3px] text-center text-xs text-slate-500">
                        {group.totalCount}
                      </span>
                      <span className="text-lg text-slate-400">{isExpanded ? "▾" : "▸"}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto overflow-y-hidden border-t border-slate-200 p-3">
                      {columnDefinitions.map((column) => {
                        const columnSessions = group.columns[column.key];

                        return (
                          <div key={column.key} className={columnClassName}>
                            <div className="flex min-h-0 flex-1 flex-col">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-bold text-slate-900">
                                  {column.title}
                                </span>
                                <span className="min-w-7 rounded-full border border-slate-200 bg-white px-[9px] py-[3px] text-center text-xs text-slate-500">
                                  {columnSessions.length}
                                </span>
                              </div>
                              <div className={columnBodyClassName}>
                                {columnSessions.length === 0 && (
                                  <div className={emptyPaneClassName}>{column.emptyMessage}</div>
                                )}
                                {columnSessions.map((session) => {
                                  const treeMeta =
                                    (group as SessionGroup & {
                                      treeMeta?: Record<
                                        string,
                                        {
                                          directAgentCount: number;
                                          subtreeSize: number;
                                          doneCount: number;
                                          activeCount: number;
                                          readyChildrenCount: number;
                                          totalChildrenCount: number;
                                          subSessions: Session[];
                                        }
                                      >;
                                    }).treeMeta ?? {};
                                  const meta = treeMeta[session.id] ?? {
                                    directAgentCount: 0,
                                    subtreeSize: 1,
                                    doneCount: 0,
                                    activeCount: 0,
                                    readyChildrenCount: 0,
                                    totalChildrenCount: 0,
                                    subSessions: [],
                                  };

                                  return (
                                    <SessionCard
                                      key={session.id}
                                      session={session}
                                      statusEntry={sessionStatus[session.id]}
                                      navigate={navigate}
                                      directAgentCount={meta.directAgentCount}
                                      subtreeSize={meta.subtreeSize}
                                      doneCount={meta.doneCount}
                                      activeCount={meta.activeCount}
                                      readyChildrenCount={meta.readyChildrenCount}
                                      totalChildrenCount={meta.totalChildrenCount}
                                      subSessions={meta.subSessions}
                                      isTreeExpanded={expandedTrees[session.id] ?? false}
                                      onToggleTree={() =>
                                        setExpandedTrees((prev) => ({
                                          ...prev,
                                          [session.id]: !(prev[session.id] ?? false),
                                        }))
                                      }
                                      getSessionStatusLabel={(s) => {
                                        const normalized = normalizeSessionStatus(
                                          s,
                                          sessionStatus[s.id],
                                        );
                                        return normalized.label ?? normalized.type;
                                      }}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

