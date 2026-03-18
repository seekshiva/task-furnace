import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getSessionCreatedAt,
  getSessionParentId,
  getSessionUpdatedAt,
  normalizeSessionStatus,
  isActiveSessionStatus,
  isReasoningPart,
  isStepFinishPart,
  isStepStartPart,
  isTextPart,
  isToolPart,
} from "./types";
import { formatDisplayDate, formatDisplayTimestamp } from "../date";
import { Markdown } from "../Markdown";
import { SessionCardHeader } from "./SessionCardHeader";
import type {
  Session,
  SessionMessage,
  SessionStatusMap,
  SessionActivityMap,
  SessionMessagePart,
  SessionToolState,
} from "./types";

const shellBodyClassName =
  "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-[18px] text-[13px] leading-[1.55] shadow-[0_16px_40px_rgba(15,23,42,0.08)] max-md:px-[14px] max-md:py-[14px]";

const mutedTextClassName = "text-[13px] text-slate-500";

const errorClassName =
  "flex flex-col gap-1 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-[14px] text-rose-700";

const detailPanelClassName =
  "flex flex-col gap-2.5 rounded-[18px] border border-slate-200 bg-slate-50 p-[14px]";

const baseButtonClassName =
  "rounded-full border px-[14px] py-2 text-xs font-semibold transition disabled:cursor-default disabled:opacity-55 disabled:shadow-none";

function safeStringify(value: unknown, maxLen = 1200): string {
  try {
    const text = JSON.stringify(value, null, 2);
    if (typeof text !== "string") return String(value);
    return text.length > maxLen ? `${text.slice(0, maxLen)}\n…` : text;
  } catch {
    const text = String(value);
    return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
  }
}

function getToolInput(state: SessionToolState | undefined): Record<string, unknown> {
  const input = (state as any)?.input;
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function getBashCommand(input: Record<string, unknown>): string | null {
  const candidates = [
    input.command,
    (input as any).cmd,
    (input as any).script,
    (input as any).arguments,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}

function ToolStatusBadge({ status }: { status: string }) {
  const tone =
    status === "completed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "running"
        ? "border-blue-200 bg-blue-50 text-blue-800"
        : status === "error"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em]",
        tone,
      ].join(" ")}
    >
      {status}
    </span>
  );
}

function extractTaskSessionId(text: string): string | null {
  // Example: "task_id: ses_309f19fb1ffewxUf60FWMRpYg5"
  const match = text.match(/task_id\s*:\s*(ses_[A-Za-z0-9_-]+)/);
  return match?.[1] ?? null;
}

function ToolPartCard({
  part,
  sessionsById,
  sessionStatus,
  activity,
  navigate,
}: {
  part: Extract<SessionMessagePart, { type: "tool" }>;
  sessionsById: Map<string, Session>;
  sessionStatus: SessionStatusMap;
  activity: SessionActivityMap;
  navigate: (path: string) => void;
}) {
  const toolName = typeof part.tool === "string" && part.tool.trim() ? part.tool : "tool";
  const state = part.state as SessionToolState | undefined;
  const status = (state as any)?.status ?? "pending";
  const input = getToolInput(state);
  const [isShellOutputOpen, setIsShellOutputOpen] = useState<boolean>(() => {
    // For shell-like tools, errors should be immediately visible.
    return status === "error";
  });
  const title =
    (state as any)?.title ??
    (input.filePath as string | undefined) ??
    (input.path as string | undefined) ??
    (toolName === "bash" ? getBashCommand(input) : undefined) ??
    null;

  const isBash = toolName === "bash" || toolName === "shell";
  const normalizedToolName = toolName.toLowerCase();
  const isReadWrite =
    normalizedToolName === "read" ||
    normalizedToolName === "write" ||
    normalizedToolName === "file_read" ||
    normalizedToolName === "file_write" ||
    normalizedToolName === "read_file" ||
    normalizedToolName === "write_file";
  const headerToolLabel = isBash ? "shell" : toolName;
  const bashCommand = isBash ? getBashCommand(input) : null;
  const output =
    status === "completed" && typeof (state as any)?.output === "string" ? ((state as any).output as string) : null;
  const error =
    status === "error" && typeof (state as any)?.error === "string" ? ((state as any).error as string) : null;
  const [isReadWriteOpen, setIsReadWriteOpen] = useState<boolean>(() => status === "error");

  useEffect(() => {
    if (isBash && error) {
      setIsShellOutputOpen(true);
    }
  }, [isBash, error]);

  useEffect(() => {
    if (isReadWrite && error) {
      setIsReadWriteOpen(true);
    }
  }, [isReadWrite, error]);

  const taskSessionId = output ? extractTaskSessionId(output) : null;
  const taskSession = taskSessionId ? sessionsById.get(taskSessionId) ?? null : null;
  const isReadWriteCollapsed = isReadWrite && !isReadWriteOpen;

  const toolCard = (
    <div className="rounded-[14px] border border-slate-200 bg-white px-[14px] py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {!isReadWriteCollapsed && (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 text-[11px] font-semibold tracking-[0.04em] text-slate-600">
                <span className="whitespace-nowrap">{headerToolLabel}</span>
                {title && (
                  <span className="ml-2 min-w-0 break-words font-normal text-slate-500">{String(title)}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <ToolStatusBadge status={String(status)} />
                {isReadWrite && (
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50"
                    onClick={() => setIsReadWriteOpen(false)}
                  >
                    Collapse
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isReadWriteCollapsed && (
        <div
          className={[
            "flex w-full items-center justify-between gap-3 text-left text-[12px] leading-[1.55]",
            "overflow-hidden whitespace-nowrap",
            "text-slate-800 hover:text-slate-950",
          ].join(" ")}
          role="button"
          tabIndex={0}
          aria-expanded={false}
          onClick={() => setIsReadWriteOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setIsReadWriteOpen(true);
            }
          }}
        >
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold text-slate-600">{headerToolLabel}</span>
            {title && <span className="ml-2 text-slate-500">{String(title)}</span>}
          </span>
          <span className="shrink-0">
            <span className="flex items-center gap-2">
              <ToolStatusBadge status={String(status)} />
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50"
                onClick={() => setIsReadWriteOpen(true)}
              >
                Expand
              </button>
            </span>
          </span>
        </div>
      )}

      {isBash && bashCommand && (
        <div className="mt-2 overflow-hidden rounded-[12px] border border-slate-200 bg-slate-950 text-slate-100">
          <div className="flex items-center justify-between gap-3 px-3">
            <pre className="min-w-0 flex-1 overflow-x-auto text-[12px] leading-[1.55] py-2">
              <code className="before:select-none before:text-emerald-400 before:content-['$_']">{bashCommand}</code>
            </pre>
            {(output || error) && (
              <button
                type="button"
                className="shrink-0 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-800"
                aria-expanded={isShellOutputOpen}
                onClick={() => setIsShellOutputOpen((v) => !v)}
              >
                {isShellOutputOpen ? (error ? "Hide error" : "Hide output") : error ? "View error" : "View output"}
              </button>
            )}
          </div>
          {(output || error) && isShellOutputOpen && (
            <pre
              className={[
                "border-t px-3 py-2 text-[12px] leading-[1.55]",
                "max-h-[280px] overflow-auto whitespace-pre-wrap break-words font-mono",
                error ? "border-rose-500/30 bg-rose-950/30 text-rose-100" : "border-slate-800 text-slate-100",
              ].join(" ")}
            >
              <code>{error ?? output}</code>
            </pre>
          )}
        </div>
      )}

      {!isBash && !isReadWrite && Object.keys(input).length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer select-none text-[11px] font-semibold tracking-[0.04em] text-slate-500">
            input
          </summary>
          <pre className="mt-2 max-h-[220px] overflow-auto rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] leading-[1.55] text-slate-800">
            <code>{safeStringify(input)}</code>
          </pre>
        </details>
      )}

      {!isBash && isReadWrite && isReadWriteOpen && Object.keys(input).length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer select-none text-[11px] font-semibold tracking-[0.04em] text-slate-500">
            input
          </summary>
          <pre className="mt-2 max-h-[220px] overflow-auto rounded-[12px] border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] leading-[1.55] text-slate-800">
            <code>{safeStringify(input)}</code>
          </pre>
        </details>
      )}

      {(output || error) && !isBash && (!isReadWrite || isReadWriteOpen) && (
        <details className="mt-2" open={Boolean(error)}>
          <summary
            className={[
              "cursor-pointer select-none text-[11px] font-semibold tracking-[0.04em]",
              error ? "text-rose-700" : "text-slate-500",
            ].join(" ")}
          >
            {error ? "error" : "output"}
          </summary>
          <pre
            className={[
              "mt-2 max-h-[280px] overflow-auto rounded-[12px] border px-3 py-2 text-[12px] leading-[1.55]",
              error
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : "border-slate-200 bg-slate-50 text-slate-800",
            ].join(" ")}
          >
            <code>{error ?? output}</code>
          </pre>
        </details>
      )}
    </div>
  );

  if (!taskSession) {
    return toolCard;
  }

  const normalized = normalizeSessionStatus(taskSession, sessionStatus[taskSession.id]);
  const statusLabel = normalized.label ?? normalized.type;
  const createdLabel = formatDisplayTimestamp(getSessionCreatedAt(taskSession));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex w-full shrink-0 flex-col gap-2 rounded-[14px] border border-slate-200 bg-white px-[14px] py-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <SessionCardHeader
          session={taskSession}
          statusLabel={statusLabel}
          createdLabel={createdLabel ?? null}
          onClick={() => navigate(`/sessions/${taskSession.id}`)}
          buttonClassName="flex w-full items-start justify-between gap-3 text-left text-inherit"
        />
      </div>

      <details className="rounded-[14px] border border-slate-200 bg-white px-[14px] py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <summary className="cursor-pointer select-none text-[11px] font-semibold tracking-[0.04em] text-slate-500">
          task details
        </summary>
        <div className="mt-2">{toolCard}</div>
      </details>
    </div>
  );
}

type ChildColumnKey = "active" | "ready" | "done";

const childColumnDefinitions: Array<{
  key: ChildColumnKey;
  title: string;
  emptyMessage: string;
}> = [
  { key: "active", title: "Active", emptyMessage: "No active sub-tasks." },
  { key: "ready", title: "Ready", emptyMessage: "No ready sub-tasks." },
  { key: "done", title: "Done", emptyMessage: "No completed sub-tasks." },
];

function getRawSessionStatusValue(
  session: Session,
  statusEntry: SessionStatusMap[string] | undefined,
): string | null {
  return statusEntry?.type ?? statusEntry?.state ?? statusEntry?.status ?? session.status ?? null;
}

function getChildColumnKey(
  session: Session,
  statusEntry: SessionStatusMap[string] | undefined,
  activityEntry: SessionActivityMap[string] | undefined,
): ChildColumnKey {
  const rawStatus = getRawSessionStatusValue(session, statusEntry)?.trim().toLowerCase() ?? null;

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

function getChronologicalTimestamp(session: Session): number {
  const createdAt = getSessionCreatedAt(session);
  if (!createdAt) return Number.POSITIVE_INFINITY;
  const date = new Date(createdAt);
  const ms = date.getTime();
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

export const SessionDetailPage: React.FC<{
  sessionId: string;
  navigate: (path: string) => void;
}> = ({ sessionId, navigate }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sseSupported, setSseSupported] = useState<boolean | null>(null);
  const [allSessions, setAllSessions] = useState<Session[] | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatusMap>({});
  const [activity, setActivity] = useState<SessionActivityMap>({});
  const [subtasksError, setSubtasksError] = useState<string | null>(null);
  const [loadingSubtasks, setLoadingSubtasks] = useState(false);
  const [mobilePane, setMobilePane] = useState<"thread" | "subtasks">("thread");
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [expandedSubAgentLists, setExpandedSubAgentLists] = useState<Record<string, boolean>>(
    {},
  );
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const didAutoScrollMessagesRef = useRef<string | null>(null);
  const subtaskBoardScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    didAutoScrollMessagesRef.current = null;
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }
        const body = (await res.json()) as { session?: Session };
        if (!cancelled) {
          setSession(body.session ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message ?? "Failed to load session");
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
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;

    async function loadSubtasks(opts?: { background?: boolean }) {
      if (!sessionId) return;

      const isBackground = opts?.background === true;
      const boardEl = subtaskBoardScrollRef.current;
      const prevScrollLeft = boardEl?.scrollLeft ?? 0;

      try {
        if (!isBackground) {
          setLoadingSubtasks(true);
        }
        // Don't clear the existing board state during background refresh.
        if (!isBackground) {
          setSubtasksError(null);
        }

        const [sessionsRes, statusRes, activityRes] = await Promise.all([
          fetch("/api/sessions"),
          fetch("/api/sessions/status"),
          fetch("/api/sessions/activity"),
        ]);

        if (!sessionsRes.ok) {
          throw new Error(`Subtasks request failed with status ${sessionsRes.status}`);
        }

        const sessionsBody = (await sessionsRes.json()) as { sessions?: Session[] };
        const nextSessions = sessionsBody.sessions ?? [];

        let nextStatus: SessionStatusMap = {};
        if (statusRes.ok) {
          const statusBody = (await statusRes.json()) as { status?: SessionStatusMap };
          nextStatus = statusBody.status ?? {};
        }

        let nextActivity: SessionActivityMap = {};
        if (activityRes.ok) {
          const activityBody = (await activityRes.json()) as { activity?: SessionActivityMap };
          nextActivity = activityBody.activity ?? {};
        }

        if (cancelled) return;
        setAllSessions(nextSessions);
        setSessionStatus(nextStatus);
        setActivity(nextActivity);

        if (boardEl) {
          window.requestAnimationFrame(() => {
            if (!subtaskBoardScrollRef.current) return;
            subtaskBoardScrollRef.current.scrollLeft = prevScrollLeft;
          });
        }
      } catch (err) {
        if (!cancelled) {
          setSubtasksError((err as Error).message ?? "Failed to load sub-task sessions");
          // Keep the previous sub-task board state to avoid flicker/jumps when
          // polling fails transiently.
        }
      } finally {
        if (!cancelled) {
          if (!isBackground) {
            setLoadingSubtasks(false);
          }
        }
      }
    }

    void loadSubtasks();

    const interval = window.setInterval(() => {
      void loadSubtasks({ background: true });
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [sessionId]);

  const directChildren = useMemo(() => {
    if (!allSessions || !sessionId) return [];
    return allSessions
      .filter((s) => getSessionParentId(s) === sessionId)
      .sort((l, r) => getChronologicalTimestamp(l) - getChronologicalTimestamp(r));
  }, [allSessions, sessionId]);

  const directChildrenByParentId = useMemo(() => {
    const map = new Map<string, Session[]>();
    if (!allSessions) return map;
    for (const s of allSessions) {
      const parentId = getSessionParentId(s);
      if (!parentId) continue;
      const list = map.get(parentId) ?? [];
      list.push(s);
      map.set(parentId, list);
    }
    for (const list of map.values()) {
      list.sort((l, r) => getChronologicalTimestamp(l) - getChronologicalTimestamp(r));
    }
    return map;
  }, [allSessions]);

  const sessionsById = useMemo(() => {
    const map = new Map<string, Session>();
    if (!allSessions) return map;
    for (const s of allSessions) {
      if (s?.id) {
        map.set(s.id, s);
      }
    }
    return map;
  }, [allSessions]);

  const childColumns = useMemo(() => {
    const columns: Record<ChildColumnKey, Session[]> = {
      active: [],
      ready: [],
      done: [],
    };

    for (const child of directChildren) {
      const key = getChildColumnKey(child, sessionStatus[child.id], activity[child.id]);
      columns[key].push(child);
    }

    for (const key of Object.keys(columns) as ChildColumnKey[]) {
      columns[key].sort((l, r) => getChronologicalTimestamp(l) - getChronologicalTimestamp(r));
    }

    return columns;
  }, [activity, directChildren, sessionStatus]);

  const readyChildCount = childColumns.ready.length;
  const activeChildCount = childColumns.active.length;
  const doneChildCount = childColumns.done.length;

  async function reloadMessages(currentSessionId: string, opts?: { background?: boolean }) {
    const listEl = messageListRef.current;
    const prevScrollTop = listEl?.scrollTop ?? 0;
    const prevScrollHeight = listEl?.scrollHeight ?? 0;

    const isBackground = opts?.background === true;

    try {
      if (!isBackground) {
        setLoadingMessages(true);
      }
      setMessagesError(null);

      const res = await fetch(
        `/api/sessions/${encodeURIComponent(currentSessionId)}/messages`,
      );
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      const body = (await res.json()) as { messages?: SessionMessage[] };
      setMessages(body.messages ?? []);
    } catch (err) {
      setMessagesError((err as Error).message ?? "Failed to load messages");
    } finally {
      if (!isBackground) {
        setLoadingMessages(false);
      }
      if (listEl) {
        window.requestAnimationFrame(() => {
          const newScrollHeight = listEl.scrollHeight;
          const delta = newScrollHeight - prevScrollHeight;
          const isNearBottom =
            prevScrollTop + listEl.clientHeight >= prevScrollHeight - 24;

          if (isNearBottom) {
            listEl.scrollTop = newScrollHeight;
          } else {
            listEl.scrollTop = prevScrollTop + delta;
          }
        });
      }
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadMessages() {
      if (cancelled) return;
      await reloadMessages(sessionId);
      if (cancelled) return;
    }

    void loadMessages();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (loadingMessages) return;
    if (messagesError) return;
    if (messages.length === 0) return;
    if (didAutoScrollMessagesRef.current === sessionId) return;

    const listEl = messageListRef.current;
    if (!listEl) return;

    window.requestAnimationFrame(() => {
      const el = messageListRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
      didAutoScrollMessagesRef.current = sessionId;
    });
  }, [loadingMessages, messagesError, messages.length, sessionId]);

  useEffect(() => {
    // Detect basic SSE support once on mount.
    if (typeof window !== "undefined") {
      setSseSupported(typeof window.EventSource !== "undefined");
    }
  }, []);

  useEffect(() => {
    // Prefer SSE streaming of events when supported; fall back to polling otherwise.
    if (sseSupported === false) {
      const interval = window.setInterval(() => {
        void reloadMessages(sessionId, { background: true });
      }, 5000);

      return () => {
        window.clearInterval(interval);
      };
    }

    if (sseSupported === null || sseSupported === undefined) {
      return;
    }

    const source = new EventSource("/api/opencode/events");

    const handleEvent = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as {
          type?: string;
          properties?: { sessionID?: string };
        };

        if (!data || typeof data !== "object") return;

        if (data.type === "session.status" || data.type === "message.updated") {
          const eventSessionId = data.properties?.sessionID;
          if (!eventSessionId || eventSessionId !== sessionId) return;
          void reloadMessages(sessionId, { background: true });
        }
      } catch {
        // Ignore malformed events.
      }
    };

    source.addEventListener("message", handleEvent);

    source.onerror = () => {
      // Close SSE on error; polling effect will continue to run as a safety net.
      source.close();
    };

    return () => {
      source.removeEventListener("message", handleEvent as EventListener);
      source.close();
    };
  }, [sessionId, sseSupported]);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || submitting) return;

    try {
      setSubmitting(true);
      setSubmitError(null);

      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/prompt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, noReply: false }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Request failed with status ${res.status}`);
      }

      setInput("");
      await reloadMessages(sessionId);
    } catch (err) {
      setSubmitError((err as Error).message ?? "Failed to send message");
    } finally {
      setSubmitting(false);
    }
  };

  const createdAt = session ? getSessionCreatedAt(session) : null;
  const updatedAt = session ? getSessionUpdatedAt(session) : null;
  const hasSubtasks = directChildren.length > 0;
  const titleLabel = session?.title || (session ? session.id.slice(0, 8) : "Session");

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col">
      <div className={shellBodyClassName}>
        <div className="mb-0.5 flex items-center justify-between gap-3">
          <button
            type="button"
            className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-2 text-[14px] font-semibold text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:bg-slate-50 hover:text-slate-900"
            onClick={() => {
              const parentId = session ? getSessionParentId(session) : null;
              navigate(parentId ? `/sessions/${parentId}` : "/sessions");
            }}
            aria-label="Back"
          >
            ←
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 truncate text-[13px] font-semibold text-slate-900">
                {titleLabel}
              </div>
              {!loading && !error && session && (
                <button
                  type="button"
                  className="shrink-0 rounded-full bg-slate-100 p-1.5 text-slate-700 transition hover:bg-slate-200"
                  onClick={() => setMobileDetailsOpen((v) => !v)}
                  aria-label={mobileDetailsOpen ? "Hide session details" : "Show session details"}
                  aria-expanded={mobileDetailsOpen}
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[11px] font-bold leading-none">
                    i
                  </span>
                </button>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              {createdAt && <span>{formatDisplayTimestamp(createdAt) ?? formatDisplayDate(createdAt)}</span>}
            </div>
          </div>

          {hasSubtasks && (
            <div className="flex flex-col items-end gap-1 lg:hidden">
              <div className="flex gap-1">
                <button
                  type="button"
                  className={[
                    "rounded-full px-3 py-1 text-[12px] font-semibold transition",
                    mobilePane === "thread"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  ].join(" ")}
                  onClick={() => setMobilePane("thread")}
                >
                  Thread
                </button>
                <button
                  type="button"
                  className={[
                    "rounded-full px-3 py-1 text-[12px] font-semibold transition",
                    mobilePane === "subtasks"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  ].join(" ")}
                  onClick={() => setMobilePane("subtasks")}
                >
                  Sub-tasks ({directChildren.length})
                </button>
              </div>
              {!loading && !error && session && (
                <div className="text-[11px] text-slate-500">
                  {activeChildCount} active · {readyChildCount} ready
                </div>
              )}
            </div>
          )}
        </div>

        {!loading && !error && session && mobileDetailsOpen && (
          <div className={`${detailPanelClassName} mt-2`}>
            <div className="flex items-center justify-end">
              <button
                type="button"
                className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-200"
                onClick={() => setMobileDetailsOpen(false)}
                aria-label="Close session details"
              >
                Close
              </button>
            </div>
            <div className="flex items-start gap-2.5 max-md:flex-col max-md:items-start">
              <span className="w-[110px] shrink-0 text-slate-500 max-md:w-auto">Title</span>
              <span className="min-w-0 flex-1 break-words">
                {session.title || "Untitled session"}
              </span>
            </div>
            {session.status && (
              <div className="flex items-start gap-2.5 max-md:flex-col max-md:items-start">
                <span className="w-[110px] shrink-0 text-slate-500 max-md:w-auto">Status</span>
                <span className="min-w-0 flex-1 break-words">{session.status}</span>
              </div>
            )}
            {session.directory && (
              <div className="flex items-start gap-2.5 max-md:flex-col max-md:items-start">
                <span className="w-[110px] shrink-0 text-slate-500 max-md:w-auto">
                  Directory
                </span>
                <span className="min-w-0 flex-1 break-all font-mono">{session.directory}</span>
              </div>
            )}
            {session.projectId && (
              <div className="flex items-start gap-2.5 max-md:flex-col max-md:items-start">
                <span className="w-[110px] shrink-0 text-slate-500 max-md:w-auto">Project</span>
                <span className="min-w-0 flex-1 break-all font-mono">{session.projectId}</span>
              </div>
            )}
            {session.rootId && session.rootId !== session.id && (
              <div className="flex items-start gap-2.5 max-md:flex-col max-md:items-start">
                <span className="w-[110px] shrink-0 text-slate-500 max-md:w-auto">
                  Root session
                </span>
                <span className="min-w-0 flex-1 break-all font-mono">{session.rootId}</span>
              </div>
            )}
            {createdAt && (
              <div className="flex items-start gap-2.5 max-md:flex-col max-md:items-start">
                <span className="w-[110px] shrink-0 text-slate-500 max-md:w-auto">Created</span>
                <span className="min-w-0 flex-1 break-words">{formatDisplayDate(createdAt)}</span>
              </div>
            )}
            {updatedAt && (
              <div className="flex items-start gap-2.5 max-md:flex-col max-md:items-start">
                <span className="w-[110px] shrink-0 text-slate-500 max-md:w-auto">
                  Last updated
                </span>
                <span className="min-w-0 flex-1 break-words">{formatDisplayDate(updatedAt)}</span>
              </div>
            )}
          </div>
        )}
        {loading && <div className={mutedTextClassName}>Loading session {sessionId}…</div>}
        {error && !loading && (
          <div className={errorClassName}>
            <div>Couldn&apos;t load this session.</div>
            <div className="text-amber-700">
              Make sure <code>opencode web</code> is running, then try again.
            </div>
            <div className="text-xs text-amber-700">{error}</div>
          </div>
        )}

        {!loading && !error && session && (
          <>
            <div className="mt-2 flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:overflow-x-auto">
              <div
                className={[
                  "flex min-h-0 flex-1 shrink-0 flex-col gap-2 max-md:gap-1.5 lg:min-w-[560px]",
                  hasSubtasks && mobilePane === "subtasks" ? "hidden lg:flex" : "",
                ].join(" ")}
              >
                {/* Desktop metadata panel now behind info toggle */}
                <div className={`${detailPanelClassName} hidden`}>
                  <div className="flex items-start gap-2.5 max-md:flex-col max-md:items-start">
                    <span className="w-[110px] shrink-0 text-slate-500 max-md:w-auto">Title</span>
                    <span className="min-w-0 flex-1 break-words">
                      {session.title || "Untitled session"}
                    </span>
                  </div>
                  {session.status && (
                    <div className="flex items-start gap-2.5 max-md:flex-col max-md:items-start">
                      <span className="w-[110px] shrink-0 text-slate-500 max-md:w-auto">
                        Status
                      </span>
                      <span className="min-w-0 flex-1 break-words">{session.status}</span>
                    </div>
                  )}
                  {session.directory && (
                    <div className="flex items-start gap-2.5 max-md:flex-col max-md:items-start">
                      <span className="w-[110px] shrink-0 text-slate-500 max-md:w-auto">
                        Directory
                      </span>
                      <span className="min-w-0 flex-1 break-all font-mono">{session.directory}</span>
                    </div>
                  )}
                  {session.projectId && (
                    <div className="flex items-start gap-2.5 max-md:flex-col max-md:items-start">
                      <span className="w-[110px] shrink-0 text-slate-500 max-md:w-auto">
                        Project
                      </span>
                      <span className="min-w-0 flex-1 break-all font-mono">
                        {session.projectId}
                      </span>
                    </div>
                  )}
                  {session.rootId && session.rootId !== session.id && (
                    <div className="flex items-start gap-2.5 max-md:flex-col max-md:items-start">
                      <span className="w-[110px] shrink-0 text-slate-500 max-md:w-auto">
                        Root session
                      </span>
                      <span className="min-w-0 flex-1 break-all font-mono">{session.rootId}</span>
                    </div>
                  )}
                  {createdAt && (
                    <div className="flex items-start gap-2.5 max-md:flex-col max-md:items-start">
                      <span className="w-[110px] shrink-0 text-slate-500 max-md:w-auto">
                        Created
                      </span>
                      <span className="min-w-0 flex-1 break-words">
                        {formatDisplayDate(createdAt)}
                      </span>
                    </div>
                  )}
                  {updatedAt && (
                    <div className="flex items-start gap-2.5 max-md:flex-col max-md:items-start">
                      <span className="w-[110px] shrink-0 text-slate-500 max-md:w-auto">
                        Last updated
                      </span>
                      <span className="min-w-0 flex-1 break-words">
                        {formatDisplayDate(updatedAt)}
                      </span>
                    </div>
                  )}
                  {hasSubtasks && (
                    <div className="flex items-start gap-2.5 max-md:flex-col max-md:items-start">
                      <span className="w-[110px] shrink-0 text-slate-500 max-md:w-auto">
                        Sub-tasks
                      </span>
                      <span className="min-w-0 flex-1 text-[12px] text-slate-600">
                        {directChildren.length} direct children · {activeChildCount} active ·{" "}
                        {readyChildCount} ready
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-2 max-md:gap-1.5">
              {loadingMessages && (
                <div className={mutedTextClassName}>Loading messages…</div>
              )}

              {messagesError && !loadingMessages && (
                <div className={errorClassName}>
                  <div>Couldn&apos;t load messages.</div>
                  <div className="text-xs text-amber-700">{messagesError}</div>
                </div>
              )}

              {!loadingMessages && !messagesError && messages.length === 0 && (
                <div className={mutedTextClassName}>No messages in this session yet.</div>
              )}

              {!loadingMessages && !messagesError && messages.length > 0 && (
                <div
                  ref={messageListRef}
                  className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-[18px] border border-slate-200 bg-slate-100 p-3"
                >
                  {messages.map((msg) => {
                    const created = formatDisplayDate(msg.info.createdAt);
                    const role = msg.info.role;
                    const isUser = role === "user";
                    const parts = msg.parts as SessionMessagePart[];
                    const textParts = parts.filter(isTextPart);
                    const otherParts = parts.filter((p) => !isTextPart(p));

                    return (
                      <div key={msg.info.id} className="flex flex-col gap-2">
                        {isUser ? (
                          <div className="ml-auto inline-block w-fit max-w-[70%] rounded-[16px] border border-blue-200 bg-blue-50 px-[14px] py-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] max-md:max-w-[92%]">
                            <div className="flex items-center gap-2 text-[11px] text-slate-500">
                              {created && <span className="ml-auto text-slate-400">{created}</span>}
                              {msg.info.status && (
                                <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold tracking-[0.04em] text-slate-700">
                                  {msg.info.status}
                                </span>
                              )}
                            </div>
                            <Markdown
                              content={textParts.map((p) => p.text).join("\n")}
                              className="mt-1 text-slate-900"
                            />
                          </div>
                        ) : (
                          <div className="w-full max-w-[860px]">
                            {created && (
                              <div className="mb-1 text-[11px] text-slate-400">{created}</div>
                            )}
                            {msg.info.status && (
                              <div className="mb-2">
                                <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold tracking-[0.04em] text-slate-700">
                                  {msg.info.status}
                                </span>
                              </div>
                            )}

                            {textParts.length > 0 && (
                              <Markdown
                                content={textParts.map((p) => p.text).join("\n")}
                                className="text-slate-900"
                              />
                            )}

                            {otherParts.length > 0 && (
                              <div className="mt-2 flex flex-col gap-2">
                                {otherParts.map((part, index) => {
                                  if (isToolPart(part)) {
                                    return (
                                      <ToolPartCard
                                        key={index}
                                        part={part}
                                        sessionsById={sessionsById}
                                        sessionStatus={sessionStatus}
                                        activity={activity}
                                        navigate={navigate}
                                      />
                                    );
                                  }

                                  if (isReasoningPart(part)) {
                                    return (
                                      <details
                                        key={index}
                                        className="rounded-[14px] border border-slate-200 bg-white px-[14px] py-3 text-[12px] text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                                      >
                                        <summary className="cursor-pointer select-none pl-3 text-[11px] font-semibold tracking-[0.04em] text-slate-500">
                                          <span className="inline-flex items-center gap-1.5">
                                            <span>reasoning</span>
                                          </span>
                                        </summary>
                                        <div className="mt-2 whitespace-pre-wrap leading-[1.55] text-slate-800">
                                          {part.text}
                                        </div>
                                      </details>
                                    );
                                  }

                                  if (isStepStartPart(part)) {
                                    return null;
                                  }

                                  if (isStepFinishPart(part)) {
                                    return null;
                                  }

                                  if ((part as any)?.type === "patch") {
                                    return null;
                                  }

                                  const baseType =
                                    typeof (part as any)?.type === "string" ? ((part as any).type as string) : "meta";
                                  return (
                                    <div
                                      key={index}
                                      className="text-[11px] font-semibold tracking-[0.04em] text-slate-500"
                                    >
                                      {baseType}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <div className="relative">
                  <textarea
                    className="min-h-[72px] w-full max-h-[180px] resize-y rounded-[14px] border border-slate-300 bg-white px-[13px] py-3 pr-[92px] pb-[52px] text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-4 focus:ring-blue-200/60"
                    placeholder="Write a message…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    rows={2}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    className="absolute bottom-3 right-3 rounded-full border border-transparent bg-blue-600 px-[14px] py-2 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(37,99,235,0.18)] transition hover:bg-blue-700 disabled:cursor-default disabled:opacity-55 disabled:shadow-none"
                    disabled={submitting || !input.trim()}
                    onClick={() => handleSubmit()}
                  >
                    {submitting ? "Sending…" : "Send"}
                  </button>
                </div>
                {submitError && (
                  <div className={errorClassName}>
                    <div>Couldn&apos;t send message.</div>
                    <div className="text-xs text-amber-700">{submitError}</div>
                  </div>
                )}
              </div>
            </div>
              </div>

              <div
                className={[
                  "flex min-h-0 flex-1 shrink-0 flex-col lg:min-w-[420px]",
                  hasSubtasks && mobilePane === "thread" ? "hidden lg:flex" : "",
                  !hasSubtasks ? "hidden lg:flex" : "",
                ].join(" ")}
              >
                <div className="flex min-h-0 flex-1 flex-col rounded-[18px] border border-slate-200 bg-slate-50 p-[14px]">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-sm font-bold text-slate-900">Sub-task board</div>
                    <div className="text-[11px] text-slate-500">
                      {directChildren.length > 0
                        ? `${directChildren.length} sub-tasks`
                        : "No sub-tasks"}
                    </div>
                  </div>

                  {loadingSubtasks && (
                    <div className={mutedTextClassName}>Loading sub-tasks…</div>
                  )}
                  {subtasksError && !loadingSubtasks && (
                    <div className="rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                      {subtasksError}
                    </div>
                  )}

                  {!loadingSubtasks && !subtasksError && directChildren.length === 0 && (
                    <div className="flex min-h-[120px] flex-1 items-center justify-center rounded-[14px] border border-dashed border-slate-300 bg-white/65 p-[14px] text-[13px] text-slate-400">
                      No sub-tasks for this session.
                    </div>
                  )}

                  {!loadingSubtasks && !subtasksError && directChildren.length > 0 && (
                    <div
                      ref={subtaskBoardScrollRef}
                      className="flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden"
                    >
                      {childColumnDefinitions.map((column) => {
                        const sessionsForColumn = childColumns[column.key];

                        return (
                          <div
                            key={column.key}
                            className="flex h-full min-h-0 min-w-[260px] shrink-0 flex-col rounded-[16px] border border-slate-200 bg-white p-3 md:min-w-[280px]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-bold text-slate-900">
                                {column.title}
                              </span>
                              <span className="min-w-7 rounded-full border border-slate-200 bg-slate-50 px-[9px] py-[3px] text-center text-xs text-slate-500">
                                {sessionsForColumn.length}
                              </span>
                            </div>
                            <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                              {sessionsForColumn.length === 0 && (
                                <div className="flex min-h-[96px] flex-1 items-center justify-center rounded-[14px] border border-dashed border-slate-300 bg-slate-50 p-[14px] text-[13px] text-slate-400">
                                  {column.emptyMessage}
                                </div>
                              )}
                              {sessionsForColumn.map((child) => {
                                const normalized = normalizeSessionStatus(
                                  child,
                                  sessionStatus[child.id],
                                );
                                const statusLabel = normalized.label ?? normalized.type;
                                const createdLabel = formatDisplayTimestamp(
                                  getSessionCreatedAt(child),
                                );
                                const directAgents = directChildrenByParentId.get(child.id) ?? [];
                                const hasDirectAgents = directAgents.length > 0;
                                const isExpanded = expandedSubAgentLists[child.id] ?? false;

                                return (
                                  <div
                                    key={child.id}
                                    className="flex w-full shrink-0 flex-col gap-2 rounded-[14px] border border-slate-200 bg-white px-[14px] py-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                                  >
                                    <SessionCardHeader
                                      session={child}
                                      statusLabel={statusLabel}
                                      createdLabel={createdLabel ?? null}
                                      onClick={() => navigate(`/sessions/${child.id}`)}
                                      buttonClassName="flex w-full items-start justify-between gap-3 text-left text-inherit"
                                    />

                                    {hasDirectAgents && (
                                      <div className="flex items-center justify-between gap-2">
                                        <button
                                          type="button"
                                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-200"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setExpandedSubAgentLists((prev) => ({
                                              ...prev,
                                              [child.id]: !(prev[child.id] ?? false),
                                            }));
                                          }}
                                          aria-expanded={isExpanded}
                                          aria-label={
                                            isExpanded
                                              ? "Hide sub-agent sessions"
                                              : "Show sub-agent sessions"
                                          }
                                        >
                                          <span>{directAgents.length} sub-agents</span>
                                          <span className="text-[12px] text-slate-500">
                                            {isExpanded ? "▾" : "▸"}
                                          </span>
                                        </button>
                                      </div>
                                    )}

                                    {hasDirectAgents && isExpanded && (
                                      <div className="flex flex-col gap-1 rounded-[12px] border border-slate-200 bg-slate-50 px-2.5 py-2">
                                        <div className="px-0.5 text-[11px] font-semibold text-slate-500">
                                          Sub-agents (oldest first)
                                        </div>
                                        <div className="flex flex-col gap-1">
                                          {directAgents.map((agent) => {
                                            const agentCreatedAt = formatDisplayTimestamp(
                                              getSessionCreatedAt(agent),
                                            );
                                            const agentNormalized = normalizeSessionStatus(
                                              agent,
                                              sessionStatus[agent.id],
                                            );
                                            const agentStatusLabel =
                                              agentNormalized.label ?? agentNormalized.type;

                                            return (
                                              <button
                                                key={agent.id}
                                                type="button"
                                                className="flex items-center justify-between gap-2 rounded-[12px] border border-slate-200 bg-white px-2.5 py-1.5 text-left text-[12px] text-slate-700 transition hover:border-blue-200 hover:bg-blue-50/60"
                                                onClick={() => navigate(`/sessions/${agent.id}`)}
                                              >
                                                <div className="min-w-0 flex-1">
                                                  <div className="truncate font-medium">
                                                    {agent.title || agent.id.slice(0, 8)}
                                                  </div>
                                                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                                    <span className="rounded-full bg-emerald-100 px-2 py-[2px] text-[10px] font-semibold text-emerald-800">
                                                      {agentStatusLabel}
                                                    </span>
                                                    {agentCreatedAt && <span>{agentCreatedAt}</span>}
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
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

