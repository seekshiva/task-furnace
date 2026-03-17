import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSessionCreatedAt, getSessionParentId, getSessionUpdatedAt } from "./types";
import { formatDisplayDate } from "../date";
import type { Session, SessionMessage } from "./types";

const shellBodyClassName =
  "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-[18px] text-[13px] leading-[1.55] shadow-[0_16px_40px_rgba(15,23,42,0.08)] max-md:px-[14px] max-md:py-[14px]";

const mutedTextClassName = "text-[13px] text-slate-500";

const errorClassName =
  "flex flex-col gap-1 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-[14px] text-rose-700";

const detailPanelClassName =
  "flex flex-col gap-2.5 rounded-[18px] border border-slate-200 bg-slate-50 p-[14px]";

const baseButtonClassName =
  "rounded-full border px-[14px] py-2 text-xs font-semibold transition disabled:cursor-default disabled:opacity-55 disabled:shadow-none";

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
  const [relatedSessions, setRelatedSessions] = useState<Session[] | null>(null);
  const [relatedSessionsError, setRelatedSessionsError] = useState<string | null>(null);
  const [loadingRelatedSessions, setLoadingRelatedSessions] = useState(false);
  const messageListRef = useRef<HTMLDivElement | null>(null);

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

    async function loadRelatedSessions(currentSession: Session | null) {
      if (!currentSession) {
        setRelatedSessions(null);
        setRelatedSessionsError(null);
        return;
      }

      try {
        setLoadingRelatedSessions(true);
        setRelatedSessionsError(null);

        const res = await fetch("/api/sessions");
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }

        const body = (await res.json()) as { sessions?: Session[] };
        if (cancelled) return;

        const all = body.sessions ?? [];
        const byId = new Map<string, Session>();
        for (const s of all) {
          byId.set(s.id, s);
        }

        const childrenById = new Map<string, Session[]>();
        for (const s of all) {
          const parentId = getSessionParentId(s);
          if (!parentId) continue;
          const list = childrenById.get(parentId) ?? [];
          list.push(s);
          childrenById.set(parentId, list);
        }

        // Find the actual root by walking parent links.
        let root: Session = currentSession;
        const seen = new Set<string>();
        while (true) {
          if (seen.has(root.id)) break;
          seen.add(root.id);
          const parentId = getSessionParentId(root);
          if (!parentId) break;
          const parent = byId.get(parentId);
          if (!parent) break;
          root = parent;
        }

        // Collect the entire descendant set from the root.
        const out: Session[] = [];
        const stack: Session[] = [root];
        const seenTree = new Set<string>();

        while (stack.length > 0) {
          const current = stack.pop();
          if (!current) continue;
          if (seenTree.has(current.id)) continue;
          seenTree.add(current.id);
          out.push(current);
          const kids = childrenById.get(current.id) ?? [];
          for (const child of kids) {
            stack.push(child);
          }
        }

        const inTree = out.sort((left, right) => {
          const leftCreated = getSessionCreatedAt(left);
          const rightCreated = getSessionCreatedAt(right);
          const leftTs = leftCreated ? new Date(leftCreated).getTime() : Number.POSITIVE_INFINITY;
          const rightTs = rightCreated ? new Date(rightCreated).getTime() : Number.POSITIVE_INFINITY;
          return leftTs - rightTs;
        });

        setRelatedSessions(inTree);
      } catch (err) {
        if (!cancelled) {
          setRelatedSessionsError(
            (err as Error).message ?? "Failed to load related sessions for this tree",
          );
          setRelatedSessions(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingRelatedSessions(false);
        }
      }
    }

    void loadRelatedSessions(session);

    return () => {
      cancelled = true;
    };
  }, [session]);

  const rootSessionId = useMemo(() => {
    if (!relatedSessions || relatedSessions.length === 0) return null;
    const first = relatedSessions[0];
    return first ? first.id : null;
  }, [relatedSessions]);

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

  const handleSubmit = async (noReply: boolean) => {
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
        body: JSON.stringify({ text, noReply }),
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

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col">
      <div className={shellBodyClassName}>
        <div className="mb-0.5 flex items-center justify-between gap-3 max-md:flex-col max-md:items-start">
          <button
            type="button"
            className="border-0 bg-transparent p-0 text-[13px] font-semibold text-slate-500 transition hover:text-slate-900"
            onClick={() => navigate("/sessions")}
            aria-label="Back to all sessions"
          >
            ← Back to sessions
          </button>
          <div className="text-sm font-semibold text-slate-900">Session details</div>
        </div>
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
            <div className={`${detailPanelClassName} mt-1`}>
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
                  <span className="w-[110px] shrink-0 text-slate-500 max-md:w-auto">Created</span>
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
              {relatedSessions && relatedSessions.length > 0 && (
                <div className="mt-1 flex flex-col gap-1.5">
                  <div className="flex items-start gap-2.5 max-md:flex-col max-md:items-start">
                    <span className="w-[110px] shrink-0 text-slate-500 max-md:w-auto">
                      Sub-agent tree
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 text-[12px] text-slate-500">
                        {relatedSessions.length} sessions in this tree, oldest first.
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {relatedSessions.map((s) => {
                          const created = getSessionCreatedAt(s);
                          const createdLabel = created ? formatDisplayDate(created) : null;
                          const isRoot = rootSessionId ? s.id === rootSessionId : !getSessionParentId(s);
                          const isCurrent = s.id === session.id;

                          return (
                            <button
                              key={s.id}
                              type="button"
                              className={[
                                "flex items-center justify-between gap-2 rounded-[12px] border px-2.5 py-1.5 text-left text-[12px] transition",
                                isCurrent
                                  ? "border-blue-300 bg-blue-50 text-slate-900"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50/60",
                              ].join(" ")}
                              onClick={() => {
                                if (s.id !== session.id) {
                                  navigate(`/sessions/${s.id}`);
                                }
                              }}
                            >
                              <div className="flex min-w-0 flex-col">
                                <div className="flex items-center gap-1">
                                  {isRoot && (
                                    <span className="inline-flex items-center rounded-full bg-slate-900 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-[0.08em] text-white">
                                      Root
                                    </span>
                                  )}
                                  <span className="truncate font-medium">
                                    {s.title || s.id.slice(0, 8)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                  {createdLabel && <span>{createdLabel}</span>}
                                  {!createdLabel && <span>Created time unknown</span>}
                                  {s.id === session.id && (
                                    <span className="rounded-full bg-blue-100 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-[0.08em] text-blue-700">
                                      Viewing
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className="shrink-0 text-slate-400 text-[14px]">›</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {loadingRelatedSessions && (
                <div className="flex items-start gap-2.5 max-md:flex-col max-md:items-start">
                  <span className="w-[110px] shrink-0 text-slate-500 max-md:w-auto" />
                  <span className="min-w-0 flex-1 text-[12px] text-slate-500">
                    Loading sub-agent tree…
                  </span>
                </div>
              )}
              {relatedSessionsError && !loadingRelatedSessions && (
                <div className="flex items-start gap-2.5 max-md:flex-col max-md:items-start">
                  <span className="w-[110px] shrink-0 text-slate-500 max-md:w-auto" />
                  <span className="min-w-0 flex-1 text-[12px] text-amber-700">
                    {relatedSessionsError}
                  </span>
                </div>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2.5">
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
                  className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-[18px] border border-slate-200 bg-slate-100 p-1"
                >
                  {messages.map((msg) => {
                    const created = formatDisplayDate(msg.info.createdAt);
                    const textPart = msg.parts.find(
                      (p) => p.type === "text",
                    ) as { type: "text"; text: string } | undefined;

                    return (
                      <div
                        key={msg.info.id}
                        className={[
                          "rounded-[14px] border px-[14px] py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
                          msg.info.role === "user"
                            ? "border-blue-200 bg-blue-50"
                            : "border-emerald-200 bg-emerald-50",
                        ].join(" ")}
                      >
                        <div className="mb-1.5 flex items-center gap-2 text-[11px]">
                          <span className="font-bold uppercase tracking-[0.06em] text-slate-500">
                            {msg.info.role}
                          </span>
                          {created && <span className="ml-auto text-slate-400">{created}</span>}
                          {msg.info.status && (
                            <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold tracking-[0.04em] text-slate-700">
                              {msg.info.status}
                            </span>
                          )}
                        </div>
                        {textPart && (
                          <div className="whitespace-pre-wrap text-[13px] leading-[1.55]">
                            {textPart.text}
                          </div>
                        )}
                        {!textPart && msg.parts.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 text-[13px] leading-[1.55]">
                            {msg.parts.map((part, index) => {
                              const baseType = (part as { type?: string }).type ?? "meta";

                              if (baseType === "tool") {
                                const tool = (part as any).tool ?? "tool";
                                const title =
                                  (part as any).state?.title ??
                                  (part as any).state?.input?.filePath;
                                return (
                                  <span
                                    key={index}
                                    className="inline-flex max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-slate-200 bg-white px-2 py-[3px] text-[10px] font-bold tracking-[0.04em] text-slate-500"
                                  >
                                    {tool}
                                    {title ? ` · ${title}` : ""}
                                  </span>
                                );
                              }

                              if (baseType === "reasoning") {
                                const fullText = (part as any).text as string | undefined;
                                const snippet =
                                  fullText && fullText.length > 80
                                    ? `${fullText.slice(0, 80)}…`
                                    : fullText;
                                return (
                                  <span
                                    key={index}
                                    className="inline-flex max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-slate-200 bg-white px-2 py-[3px] text-[10px] font-bold tracking-[0.04em] text-slate-500"
                                  >
                                    reasoning
                                    {snippet ? ` · ${snippet}` : ""}
                                  </span>
                                );
                              }

                              if (baseType === "step-start" || baseType === "step-finish") {
                                const subtype =
                                  (part as any).reason ??
                                  (part as any).state?.status ??
                                  undefined;
                                return (
                                  <span
                                    key={index}
                                    className="inline-flex max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-slate-200 bg-white px-2 py-[3px] text-[10px] font-bold tracking-[0.04em] text-slate-500"
                                  >
                                    {baseType}
                                    {subtype ? ` · ${subtype}` : ""}
                                  </span>
                                );
                              }

                              return (
                                <span
                                  key={index}
                                  className="inline-flex max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-slate-200 bg-white px-2 py-[3px] text-[10px] font-bold tracking-[0.04em] text-slate-500"
                                >
                                  {baseType}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className={detailPanelClassName}>
                <textarea
                  className="min-h-[88px] w-full max-h-[180px] resize-y rounded-[14px] border border-slate-300 bg-white px-[13px] py-3 text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-4 focus:ring-blue-200/60"
                  placeholder="Add a comment or ask the session to continue…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={3}
                  disabled={submitting}
                />
                {submitError && (
                  <div className={errorClassName}>
                    <div>Couldn&apos;t send message.</div>
                    <div className="text-xs text-amber-700">{submitError}</div>
                  </div>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className={`${baseButtonClassName} border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900`}
                    disabled={submitting || !input.trim()}
                    onClick={() => handleSubmit(true)}
                  >
                    {submitting ? "Sending…" : "Add comment only"}
                  </button>
                  <button
                    type="button"
                    className={`${baseButtonClassName} border-transparent bg-blue-600 text-white shadow-[0_10px_20px_rgba(37,99,235,0.18)] hover:bg-blue-700`}
                    disabled={submitting || !input.trim()}
                    onClick={() => handleSubmit(false)}
                  >
                    {submitting ? "Continuing…" : "Continue session"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

