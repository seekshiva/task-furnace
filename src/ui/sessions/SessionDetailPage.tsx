import React, { useEffect, useState } from "react";
import { Session, SessionMessage } from "./types";

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

  async function reloadMessages(currentSessionId: string, opts?: { background?: boolean }) {
    const listEl = document.querySelector<HTMLDivElement>(".tf-session-messages-list");
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

  return (
    <section className="tf-shell-window">
      <div className="tf-shell-titlebar">
        <div className="tf-shell-titlebar-left">
          <div className="tf-shell-dots">
            <span className="dot dot-red" />
            <span className="dot dot-amber" />
            <span className="dot dot-green" />
          </div>
          <button
            type="button"
            className="tf-shell-back"
            onClick={() => navigate("/sessions")}
            aria-label="Back to all sessions"
          >
            ←
          </button>
        </div>
        <span className="tf-shell-title">session details</span>
      </div>

      <div className="tf-shell-body tf-sessions-body">
        {loading && <div className="tf-sessions-muted">Loading session {sessionId}…</div>}
        {error && !loading && (
          <div className="tf-sessions-error">
            <div>Couldn&apos;t load this session.</div>
            <div className="tf-sessions-error-hint">
              Make sure <code>opencode web</code> is running, then try again.
            </div>
            <div className="tf-sessions-error-raw">{error}</div>
          </div>
        )}

        {!loading && !error && session && (
          <>
            <div className="tf-session-detail">
              <div className="tf-session-detail-row">
                <span className="label">Title</span>
                <span className="value">{session.title || "Untitled session"}</span>
              </div>
              <div className="tf-session-detail-row">
                <span className="label">ID</span>
                <span className="value">{session.id}</span>
              </div>
              {session.status && (
                <div className="tf-session-detail-row">
                  <span className="label">Status</span>
                  <span className="value">{session.status}</span>
                </div>
              )}
              {session.directory && (
                <div className="tf-session-detail-row">
                  <span className="label">Directory</span>
                  <span className="value">{session.directory}</span>
                </div>
              )}
              {session.projectId && (
                <div className="tf-session-detail-row">
                  <span className="label">Project</span>
                  <span className="value">{session.projectId}</span>
                </div>
              )}
              {session.rootId && session.rootId !== session.id && (
                <div className="tf-session-detail-row">
                  <span className="label">Root session</span>
                  <span className="value">{session.rootId}</span>
                </div>
              )}
              {session.createdAt && (
                <div className="tf-session-detail-row">
                  <span className="label">Created</span>
                  <span className="value">
                    {new Date(session.createdAt).toLocaleString()}
                  </span>
                </div>
              )}
              {session.updatedAt && (
                <div className="tf-session-detail-row">
                  <span className="label">Last updated</span>
                  <span className="value">
                    {new Date(session.updatedAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            <div className="tf-session-messages">
              {loadingMessages && (
                <div className="tf-sessions-muted">Loading messages…</div>
              )}

              {messagesError && !loadingMessages && (
                <div className="tf-sessions-error">
                  <div>Couldn&apos;t load messages.</div>
                  <div className="tf-sessions-error-raw">{messagesError}</div>
                </div>
              )}

              {!loadingMessages && !messagesError && messages.length === 0 && (
                <div className="tf-sessions-muted">No messages in this session yet.</div>
              )}

              {!loadingMessages && !messagesError && messages.length > 0 && (
                <div className="tf-session-messages-list">
                  {messages.map((msg) => {
                    const created = msg.info.createdAt
                      ? new Date(msg.info.createdAt).toLocaleTimeString()
                      : null;
                    const textPart = msg.parts.find(
                      (p) => p.type === "text",
                    ) as { type: "text"; text: string } | undefined;

                    return (
                      <div key={msg.info.id} className={`tf-message tf-message-${msg.info.role}`}>
                        <div className="tf-message-header">
                          <span className="tf-message-role">{msg.info.role}</span>
                          {created && <span className="tf-message-time">{created}</span>}
                          {msg.info.status && (
                            <span className="tf-message-status">{msg.info.status}</span>
                          )}
                        </div>
                        {textPart && (
                          <div className="tf-message-body">
                            {textPart.text}
                          </div>
                        )}
                        {!textPart && msg.parts.length > 0 && (
                          <div className="tf-message-body tf-message-body-meta">
                            {msg.parts.map((part, index) => {
                              const baseType = (part as { type?: string }).type ?? "meta";

                              if (baseType === "tool") {
                                const tool = (part as any).tool ?? "tool";
                                const title =
                                  (part as any).state?.title ??
                                  (part as any).state?.input?.filePath;
                                return (
                                  <span key={index} className="tf-meta-chip">
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
                                  <span key={index} className="tf-meta-chip">
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
                                  <span key={index} className="tf-meta-chip">
                                    {baseType}
                                    {subtype ? ` · ${subtype}` : ""}
                                  </span>
                                );
                              }

                              return (
                                <span key={index} className="tf-meta-chip">
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

              <div className="tf-session-input">
                <textarea
                  className="tf-session-input-textarea"
                  placeholder="Add a comment or ask the session to continue…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={3}
                  disabled={submitting}
                />
                {submitError && (
                  <div className="tf-sessions-error tf-session-input-error">
                    <div>Couldn&apos;t send message.</div>
                    <div className="tf-sessions-error-raw">{submitError}</div>
                  </div>
                )}
                <div className="tf-session-input-actions">
                  <button
                    type="button"
                    className="tf-button tf-button-secondary"
                    disabled={submitting || !input.trim()}
                    onClick={() => handleSubmit(true)}
                  >
                    {submitting ? "Sending…" : "Add comment only"}
                  </button>
                  <button
                    type="button"
                    className="tf-button tf-button-primary"
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

