import React, { useEffect, useMemo, useState } from "react";
import {
  getSessionCreatedAt,
  getSessionParentId,
  normalizeSessionStatus,
  isActiveSessionStatus,
} from "./types";
import { formatDisplayDate, formatDisplayTimestamp } from "../date";
import type { Session, SessionStatusMap, SessionActivityMap } from "./types";
import { SessionCardHeader } from "./SessionCardHeader";
import { sessionDetailPath } from "./sessionPaths";

const shellBodyClassName =
  "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto text-[13px] leading-[1.55]";

const mutedTextClassName = "text-[13px] text-slate-500 dark:text-slate-400";

const errorClassName =
  "flex flex-col gap-1 rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 px-4 py-[14px] text-rose-700 dark:text-rose-300";

/** Outer shell: border and shadow live here so subtree progress can sit inside the same card. */
const sessionCardShellClassName =
  "flex w-full shrink-0 flex-col overflow-hidden rounded-[14px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition duration-150 hover:-translate-y-px hover:border-blue-200 dark:hover:border-blue-700 hover:shadow-[0_12px_24px_rgba(37,99,235,0.08)] dark:hover:shadow-[0_12px_24px_rgba(37,99,235,0.15)]";

const sessionCardHeaderButtonClassName =
  "flex w-full shrink-0 cursor-pointer items-center justify-between gap-3 px-[14px] py-3 text-left text-inherit max-md:flex-col max-md:items-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:focus-visible:outline-blue-400";

const columnClassName =
  "flex min-h-[240px] w-full min-w-0 shrink-0 self-stretch rounded-[18px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 lg:w-[364px] lg:min-w-[364px]";

const emptyPaneClassName =
  "flex min-h-[96px] flex-1 shrink-0 items-center justify-center rounded-[14px] border border-dashed border-slate-300 dark:border-slate-600 bg-white/65 dark:bg-slate-800/40 p-[14px] text-[13px] text-slate-400 dark:text-slate-500";

const columnBodyClassName = "mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1";

const groupClassName =
  "relative flex shrink-0 flex-col overflow-visible rounded-[18px] border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40";

const groupHeaderButtonClassName =
  "sticky top-0 z-10 flex w-full shrink-0 items-center justify-between gap-3 bg-white/95 dark:bg-slate-900/95 px-3 py-2.5 text-left backdrop-blur-sm transition hover:bg-slate-50 dark:hover:bg-slate-800";

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
  description: string;
  emptyMessage: string;
}> = [
  {
    key: "drafts",
    title: "Drafts",
    description: "Sessions that are still drafts or not yet running.",
    emptyMessage: "No draft sessions.",
  },
  {
    key: "active",
    title: "Active",
    description: "Sessions currently doing work (running tools or streaming).",
    emptyMessage: "No active sessions.",
  },
  {
    key: "ready",
    title: "Ready",
    description: "Idle sessions ready for input; not active right now.",
    emptyMessage: "No ready sessions.",
  },
  {
    key: "done",
    title: "Done",
    description: "Completed or closed sessions.",
    emptyMessage: "No completed sessions.",
  },
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
  todayKey: string,
): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const group of groups) {
    const defaultExpand = group.key === todayKey;
    next[group.key] = previous[group.key] ?? defaultExpand;
  }

  let changed = Object.keys(previous).length !== Object.keys(next).length;
  if (!changed) {
    for (const k of Object.keys(next)) {
      if (previous[k] !== next[k]) {
        changed = true;
        break;
      }
    }
  }

  return changed ? next : previous;
}

function formatRelativeUpdated(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 8) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

type SourceFilter = "all" | "opencode" | "claude-code";

function filterSessionsForBoard(
  allSessions: Session[],
  sourceFilter: SourceFilter,
  searchQuery: string,
): Session[] {
  let list = allSessions;
  if (sourceFilter !== "all") {
    list = list.filter((s) => (s.source ?? "opencode") === sourceFilter);
  }

  const q = searchQuery.trim().toLowerCase();
  if (!q) return list;

  const byId = new Map(allSessions.map((s) => [s.id, s]));

  const matches = (s: Session) => {
    const title = (s.title ?? "").toLowerCase();
    return title.includes(q) || s.id.toLowerCase().includes(q);
  };

  const childrenByParent = new Map<string, Session[]>();
  for (const s of list) {
    const parentId = getSessionParentId(s);
    if (!parentId) continue;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId)!.push(s);
  }

  const keep = new Set<string>();

  function addAncestors(id: string) {
    let cur: Session | undefined = byId.get(id);
    while (cur) {
      keep.add(cur.id);
      const p = getSessionParentId(cur);
      if (!p) break;
      cur = byId.get(p);
    }
  }

  function addDescendants(id: string) {
    const stack = [id];
    while (stack.length) {
      const id2 = stack.pop()!;
      keep.add(id2);
      for (const c of childrenByParent.get(id2) ?? []) stack.push(c.id);
    }
  }

  for (const s of list) {
    if (!matches(s)) continue;
    addAncestors(s.id);
    addDescendants(s.id);
  }

  return list.filter((s) => keep.has(s.id));
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
  const createdLabel = formatDisplayTimestamp(getSessionCreatedAt(session));

  const totalInTree = Math.max(subtreeSize, 1);
  const completedRatio =
    totalChildrenCount > 0 ? readyChildrenCount / totalChildrenCount : 0;
  const completedPercent = Math.round(completedRatio * 100);
  const hasSubtree = directAgentCount > 0;

  return (
    <div className="flex w-full flex-col gap-2">
      <div className={sessionCardShellClassName}>
        <SessionCardHeader
          session={session}
          statusLabel={statusLabel}
          createdLabel={createdLabel ?? null}
          onClick={() => navigate(sessionDetailPath(session))}
          className={sessionCardHeaderButtonClassName}
          extraBadges={
          <>
            {session.source === "claude-code" ? (
              <span className="rounded-full bg-violet-100 dark:bg-violet-900/45 px-2 py-0.5 text-[11px] font-semibold text-violet-800 dark:text-violet-200">
                Claude Code
              </span>
            ) : session.source === "opencode" ? (
              <span className="rounded-full bg-blue-100 dark:bg-blue-900/45 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:text-blue-200">
                OpenCode
              </span>
            ) : null}
            {hasSubtree ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-600"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleTree();
                }}
                aria-expanded={hasSubtree ? isTreeExpanded : undefined}
                aria-label={isTreeExpanded ? "Hide sub-agent sessions" : "Show sub-agent sessions"}
              >
                <span>{directAgentCount} sub-agents</span>
                <span className="text-[12px] text-slate-500 dark:text-slate-400">{isTreeExpanded ? "▾" : "▸"}</span>
              </button>
            ) : null}
          </>
        }
        />

        {hasSubtree && (
          <div
            className="flex items-center gap-2 border-t border-slate-100 dark:border-slate-700/80 px-[14px] pb-3 pt-2"
            role="group"
            aria-label={`Sub-agents: ${readyChildrenCount} of ${totalChildrenCount} ready${activeCount > 0 ? `, ${activeCount} active` : ""}`}
          >
            <div className="relative h-[6px] w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-blue-500 transition-[width] duration-150"
                style={{ width: `${completedPercent}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {readyChildrenCount}/{totalChildrenCount} ready
              {activeCount > 0 ? ` · ${activeCount} active` : ""}
            </span>
          </div>
        )}
      </div>

      {hasSubtree && isTreeExpanded && subSessions.length > 0 && (
        <div className="ml-2.5 flex flex-col gap-1 rounded-[14px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2">
          <div className="px-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Sub-agents (oldest first)
          </div>
          <div className="flex flex-col gap-1">
            {subSessions.map((sub) => {
              const createdAt = formatDisplayTimestamp(getSessionCreatedAt(sub));
              const subStatus = getSessionStatusLabel(sub);
              return (
                <button
                  key={sub.id}
                  type="button"
                  className="flex items-center justify-between gap-2 rounded-[12px] border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 px-2.5 py-1.5 text-left text-[12px] text-slate-700 dark:text-slate-300 transition hover:border-blue-200 dark:hover:border-blue-700 hover:bg-blue-50/60 dark:hover:bg-blue-950/40"
                  onClick={() => navigate(sessionDetailPath(sub))}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {sub.title || sub.id.slice(0, 8)}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-2 py-[2px] text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                        {subStatus}
                      </span>
                      {createdAt && <span>{createdAt}</span>}
                    </div>
                  </div>
                  <span className="shrink-0 text-slate-400 dark:text-slate-500">›</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const filterChipClass = (active: boolean) =>
  [
    "rounded-full border px-3 py-[5px] text-[12px] font-semibold transition",
    active
      ? "border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200"
      : "border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500",
  ].join(" ");

export const SessionsPage: React.FC<{ navigate: (path: string) => void }> = ({
  navigate,
}) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadWarnings, setLoadWarnings] = useState<string[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatusMap>({});
  const [activity, setActivity] = useState<SessionActivityMap>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedTrees, setExpandedTrees] = useState<Record<string, boolean>>({});
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [relativeTick, setRelativeTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setRelativeTick((x) => x + 1), 8000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setLoadWarnings([]);

        const [sessionsRes, claudeSessionsRes, statusRes, activityRes, claudeActivityRes] = await Promise.all([
          fetch("/api/sessions"),
          fetch("/api/claude/sessions"),
          fetch("/api/sessions/status"),
          fetch("/api/sessions/activity"),
          fetch("/api/claude/sessions/activity"),
        ]);

        if (!sessionsRes.ok) {
          throw new Error(
            `OpenCode sessions request failed (${sessionsRes.status}). Ensure opencode is running and reachable.`,
          );
        }
        const body = (await sessionsRes.json()) as { sessions?: Session[] };
        const opencodeSessions = (body.sessions ?? []).map((s) => ({ ...s, source: "opencode" as const }));

        const warnings: string[] = [];
        let claudeSessions: Session[] = [];
        if (claudeSessionsRes.ok) {
          const claudeBody = (await claudeSessionsRes.json()) as { sessions?: Session[] };
          claudeSessions = claudeBody.sessions ?? [];
        } else {
          warnings.push(
            `Claude Code sessions: request failed (${claudeSessionsRes.status}). Claude sessions will be missing.`,
          );
        }

        let statusBody: { status?: SessionStatusMap } | null = null;
        if (statusRes.ok) {
          statusBody = (await statusRes.json()) as { status?: SessionStatusMap };
        } else {
          warnings.push(
            `OpenCode session status: HTTP ${statusRes.status}. Column placement may be wrong until this works.`,
          );
        }

        let activityBody: { activity?: SessionActivityMap } | null = null;
        if (activityRes.ok) {
          activityBody = (await activityRes.json()) as { activity?: SessionActivityMap };
        } else {
          warnings.push(`OpenCode activity: HTTP ${activityRes.status}.`);
        }

        let claudeActivityBody: { activity?: SessionActivityMap } | null = null;
        if (claudeActivityRes.ok) {
          claudeActivityBody = (await claudeActivityRes.json()) as { activity?: SessionActivityMap };
        } else {
          warnings.push(`Claude Code activity: HTTP ${claudeActivityRes.status}.`);
        }

        if (!cancelled) {
          setSessions([...opencodeSessions, ...claudeSessions]);
          setLoadWarnings(warnings);
          setLastUpdatedAt(Date.now());
          if (statusBody?.status) {
            setSessionStatus(statusBody.status);
          } else {
            setSessionStatus({});
          }
          const mergedActivity = {
            ...(activityBody?.activity ?? {}),
            ...(claudeActivityBody?.activity ?? {}),
          };
          setActivity(mergedActivity);
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
    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const [sessionsRes, claudeSessionsRes, statusRes, activityRes, claudeActivityRes] = await Promise.all([
            fetch("/api/sessions"),
            fetch("/api/claude/sessions"),
            fetch("/api/sessions/status"),
            fetch("/api/sessions/activity"),
            fetch("/api/claude/sessions/activity"),
          ]);

          let refreshed = false;

          if (sessionsRes.ok) {
            const body = (await sessionsRes.json()) as { sessions?: Session[] };
            const opencodeSessions = (body.sessions ?? []).map((s) => ({ ...s, source: "opencode" as const }));
            let claudeSessions: Session[] = [];
            if (claudeSessionsRes.ok) {
              const claudeBody = (await claudeSessionsRes.json()) as { sessions?: Session[] };
              claudeSessions = claudeBody.sessions ?? [];
            }
            setSessions([...opencodeSessions, ...claudeSessions]);
            refreshed = true;
          }

          if (statusRes.ok) {
            const body = (await statusRes.json()) as { status?: SessionStatusMap };
            setSessionStatus(body.status ?? {});
            refreshed = true;
          }

          {
            const merged: SessionActivityMap = {};
            if (activityRes.ok) {
              const body = (await activityRes.json()) as { activity?: SessionActivityMap };
              Object.assign(merged, body.activity ?? {});
            }
            if (claudeActivityRes.ok) {
              const body = (await claudeActivityRes.json()) as { activity?: SessionActivityMap };
              Object.assign(merged, body.activity ?? {});
            }
            setActivity(merged);
            if (activityRes.ok || claudeActivityRes.ok) refreshed = true;
          }

          if (refreshed) {
            setLastUpdatedAt(Date.now());
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

  const filteredSessions = useMemo(
    () => filterSessionsForBoard(sessions, sourceFilter, searchQuery),
    [sessions, sourceFilter, searchQuery],
  );

  const sessionGroups = useMemo(() => {
    const groupsByKey = new Map<string, SessionGroup>();
    const sessionsById = new Map<string, Session>();
    const childrenById = new Map<string, Session[]>();

    for (const session of filteredSessions) {
      sessionsById.set(session.id, session);
    }

    for (const session of filteredSessions) {
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

    const topLevelSessions = filteredSessions.filter(isTopLevelSession);

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
        subSessions: directChildren.sort(
          (left, right) => getChronologicalTimestamp(left) - getChronologicalTimestamp(right),
        ),
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
  }, [activity, sessionStatus, filteredSessions]);

  useEffect(() => {
    const todayKey = toLocalDateKey(new Date());
    setExpandedGroups((previous) => mergeExpandedGroups(previous, sessionGroups, todayKey));
  }, [sessionGroups]);

  const lastUpdatedLabel = useMemo(
    () => (lastUpdatedAt != null ? formatRelativeUpdated(lastUpdatedAt) : "—"),
    [lastUpdatedAt, relativeTick],
  );

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col">
      <div className={shellBodyClassName}>
        {loading && <div className={mutedTextClassName}>Loading sessions…</div>}
        {error && !loading && (
          <div className={errorClassName}>
            <div>Couldn&apos;t load OpenCode sessions.</div>
            <div className="text-amber-700 dark:text-amber-400">
              Make sure <code>opencode web</code> is running and reachable, then refresh this page. Claude Code
              sessions load separately and also need a working TaskFurnace server.
            </div>
            <div className="text-xs text-amber-700 dark:text-amber-400">{error}</div>
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/50 px-4 py-3 text-slate-700 dark:text-slate-200">
            <div className="text-sm font-semibold">No sessions yet</div>
            <p className="text-[13px] text-slate-600 dark:text-slate-300">
              Run <code className="rounded bg-slate-100 dark:bg-slate-700 px-1">opencode web</code> for OpenCode
              sessions, or use Claude Code with this project—new work will show up here automatically.
            </p>
          </div>
        )}

        {!loading && !error && sessions.length > 0 && filteredSessions.length === 0 && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3 text-[13px] text-amber-900 dark:text-amber-200">
            No sessions match your search or source filter. Clear the search or set source to &quot;All&quot; to see
            everything.
          </div>
        )}

        {!loading && !error && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {sessions.length > 0 && filteredSessions.length > 0 && (
              <>
                <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/40 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-[12px] text-slate-600 dark:text-slate-300">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">Tip:</span> Click a card to
                      open the session (URLs are shareable). Use{" "}
                      <span className="whitespace-nowrap rounded bg-slate-100 dark:bg-slate-700 px-1 py-0.5">
                        N sub-agents
                      </span>{" "}
                      to expand the tree without leaving the board.
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400" title="Last successful refresh">
                      Updated {lastUpdatedLabel}
                    </span>
                  </div>
                </div>

                {loadWarnings.length > 0 && (
                  <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-[13px] text-amber-950 dark:text-amber-100">
                    <div className="font-semibold">Some data could not be loaded</div>
                    <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-900 dark:text-amber-200/95">
                      {loadWarnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Search</span>
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Title or session id…"
                      className="w-full min-w-0 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Source</span>
                    <button
                      type="button"
                      className={filterChipClass(sourceFilter === "all")}
                      onClick={() => setSourceFilter("all")}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={filterChipClass(sourceFilter === "opencode")}
                      onClick={() => setSourceFilter("opencode")}
                    >
                      OpenCode
                    </button>
                    <button
                      type="button"
                      className={filterChipClass(sourceFilter === "claude-code")}
                      onClick={() => setSourceFilter("claude-code")}
                    >
                      Claude Code
                    </button>
                  </div>
                </div>
              </>
            )}

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
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{group.label}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="min-w-7 rounded-full border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-[9px] py-[3px] text-center text-xs text-slate-500 dark:text-slate-400">
                        {group.totalCount}
                      </span>
                      <span className="text-lg text-slate-400 dark:text-slate-500">{isExpanded ? "▾" : "▸"}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="flex min-h-0 flex-1 flex-col gap-3 border-t border-slate-200 dark:border-slate-700 p-3 lg:flex-row lg:items-stretch lg:gap-3 lg:overflow-x-auto lg:overflow-y-hidden">
                      {columnDefinitions.map((column) => {
                        const columnSessions = group.columns[column.key];

                        return (
                          <div key={column.key} className={columnClassName}>
                            <div className="flex min-h-0 flex-1 flex-col">
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className="cursor-help text-sm font-bold text-slate-900 dark:text-slate-100"
                                  title={column.description}
                                >
                                  {column.title}
                                </span>
                                <span className="min-w-7 rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-[9px] py-[3px] text-center text-xs text-slate-500 dark:text-slate-400">
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

