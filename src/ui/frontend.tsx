import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

type Route =
  | { type: "home" }
  | { type: "sessions" }
  | { type: "session-detail"; sessionId: string }
  | { type: "tower" };

function parseRoute(pathname: string): Route {
  if (pathname === "/sessions") {
    return { type: "sessions" };
  }

  if (pathname === "/tower") {
    return { type: "tower" };
  }

  if (pathname.startsWith("/sessions/")) {
    const sessionId = pathname.slice("/sessions/".length);
    if (sessionId) {
      return { type: "session-detail", sessionId };
    }
  }

  return { type: "home" };
}

function useRoute(): [Route, (path: string) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (path: string) => {
    if (path === window.location.pathname) return;
    window.history.pushState({}, "", path);
    setRoute(parseRoute(path));
  };

  return [route, navigate];
}

const App: React.FC = () => {
  const [route, navigate] = useRoute();

  return (
    <div className="tf-app">
      <header className="tf-header">
        <div className="tf-header-main">
          <span className="tf-header-logo">🔥</span>
          <div className="tf-header-text">
            <span className="tf-header-title">TaskFurnace</span>
            <span className="tf-header-subtitle">Always-on orchestration shell</span>
          </div>
        </div>
        <nav className="tf-nav">
          <button
            type="button"
            className={`tf-nav-link ${route.type === "home" ? "tf-nav-link-active" : ""}`}
            onClick={() => navigate("/")}
          >
            Console
          </button>
          <button
            type="button"
            className={`tf-nav-link ${
              route.type === "sessions" || route.type === "session-detail"
                ? "tf-nav-link-active"
                : ""
            }`}
            onClick={() => navigate("/sessions")}
          >
            Sessions
          </button>
          <button
            type="button"
            className={`tf-nav-link ${route.type === "tower" ? "tf-nav-link-active" : ""}`}
            onClick={() => navigate("/tower")}
          >
            Tower
          </button>
        </nav>
      </header>

      <main className="tf-main">
        {route.type === "home" && <HomeConsole />}
        {route.type === "sessions" && <SessionsPage navigate={navigate} />}
        {route.type === "session-detail" && (
          <SessionDetailPage sessionId={route.sessionId} navigate={navigate} />
        )}
        {route.type === "tower" && <TowerPage />}
      </main>
    </div>
  );
};

const HomeConsole: React.FC = () => {
  return (
    <section className="tf-shell-window">
      <div className="tf-shell-titlebar">
        <div className="tf-shell-dots">
          <span className="dot dot-red" />
          <span className="dot dot-amber" />
          <span className="dot dot-green" />
        </div>
        <span className="tf-shell-title">task-furnace dev console</span>
      </div>

      <div className="tf-shell-body">
        <div className="tf-shell-line tf-shell-line-muted">
          <span className="tf-prefix">system</span>
          <span>Booting TaskFurnace orchestration engine…</span>
        </div>
        <div className="tf-shell-line">
          <span className="tf-prefix">furnace</span>
          <span>Listening for tasks and AI agents.</span>
        </div>
        <div className="tf-shell-line">
          <span className="tf-prefix">status</span>
          <span>0 tasks queued · 0 running · idle loop active</span>
        </div>

        <div className="tf-shell-prompt">
          <span className="tf-prompt-user">you@task-furnace</span>
          <span className="tf-prompt-path">~/workspace</span>
          <span className="tf-prompt-sign">$</span>
          <span className="tf-prompt-caret" />
        </div>
      </div>
    </section>
  );
};

type Session = {
  id: string;
  title?: string | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  directory?: string | null;
  projectId?: string | null;
  rootId?: string | null;
};

type Project = {
  id: string;
  name?: string | null;
  directory?: string | null;
  root?: string | null;
  path?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type SessionMessage = {
  info: {
    id: string;
    role: string;
    createdAt?: string | null;
    status?: string | null;
  };
  parts: Array<
    | { type: "text"; text: string }
    | { type: string; [key: string]: unknown }
  >;
};

type SessionStatusMap = Record<
  string,
  {
    // Support both the typed opencode shape ({ type: "busy" | "retry" | "idle" })
    // and the looser status/state strings used earlier.
    type?: "idle" | "busy" | "retry" | string;
    status?: string | null;
    state?: string | null;
  }
>;

type SessionActivityMap = Record<
  string,
  {
    state: "active" | "ready";
    rawType: string | null;
    lastEventAt: number | null;
  }
>;

type NormalizedSessionStatus = {
  type: "idle" | "busy" | "retry" | "unknown";
  label: string | null;
};

function normalizeSessionStatus(
  session: Session,
  statusEntry: SessionStatusMap[string] | undefined,
): NormalizedSessionStatus {
  const rawType =
    (statusEntry?.type as NormalizedSessionStatus["type"] | undefined) ??
    (statusEntry?.state as string | undefined) ??
    (statusEntry?.status as string | undefined) ??
    (session.status as string | undefined) ??
    null;

  if (!rawType) {
    // No explicit status from opencode – treat as ready/idle.
    return { type: "idle", label: "ready" };
  }

  const lowered = rawType.toLowerCase();

  if (lowered === "busy") {
    return { type: "busy", label: "busy" };
  }

  if (lowered === "retry") {
    return { type: "retry", label: "retrying" };
  }

  if (lowered === "idle") {
    return { type: "idle", label: "idle" };
  }

  // Unknown string – keep label but treat as non-active.
  return { type: "idle", label: rawType };
}

function isActiveSessionStatus(status: NormalizedSessionStatus): boolean {
  return status.type === "busy" || status.type === "retry";
}

const SessionsPage: React.FC<{ navigate: (path: string) => void }> = ({ navigate }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatusMap>({});
   const [activity, setActivity] = useState<SessionActivityMap>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setProjectError(null);

        const [sessionsRes, projectsRes, statusRes, activityRes] = await Promise.all([
          fetch("/api/sessions"),
          fetch("/api/projects"),
          fetch("/api/sessions/status"),
          fetch("/api/sessions/activity"),
        ]);

        if (!sessionsRes.ok) {
          throw new Error(`Sessions request failed with status ${sessionsRes.status}`);
        }
        const body = (await sessionsRes.json()) as { sessions?: Session[] };

        let projectsBody: { projects?: Project[]; current?: Project | null } | null = null;
        if (projectsRes.ok) {
          projectsBody = (await projectsRes.json()) as {
            projects?: Project[];
            current?: Project | null;
          };
        } else {
          setProjectError(`Projects request failed with status ${projectsRes.status}`);
        }

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
          if (projectsBody) {
            setProjects(projectsBody.projects ?? []);
            setCurrentProject(projectsBody.current ?? null);
          }
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
    <section className="tf-shell-window">
      <div className="tf-shell-titlebar">
        <div className="tf-shell-dots">
          <span className="dot dot-red" />
          <span className="dot dot-amber" />
          <span className="dot dot-green" />
        </div>
        <span className="tf-shell-title">opencode sessions</span>
      </div>

      <div className="tf-shell-body tf-sessions-body">
        {loading && <div className="tf-sessions-muted">Loading sessions from opencode…</div>}
        {error && !loading && (
          <div className="tf-sessions-error">
            <div>Couldn&apos;t load sessions.</div>
            <div className="tf-sessions-error-hint">
              Make sure <code>opencode web</code> is running, then refresh this page.
            </div>
            <div className="tf-sessions-error-raw">{error}</div>
          </div>
        )}

        {!loading && !error && !currentProject && sessions.length === 0 && (
          <div className="tf-sessions-muted">No sessions found yet.</div>
        )}

        {!loading && !error && (
          <div className="tf-sessions-list">
            {projects.length > 0 && (
              <div className="tf-project-summary">
                <div className="tf-project-summary-header">
                  <span className="tf-project-summary-label">Projects</span>
                  <span className="tf-project-summary-count">
                    {projects.length} project{projects.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="tf-project-summary-body">
                  {projects.map((project) => {
                    const isCurrent = currentProject && project.id === currentProject.id;
                    const dir =
                      project.directory ??
                      (project as { root?: string | null }).root ??
                      (project as { path?: string | null }).path ??
                      null;
                    return (
                      <div key={project.id} className="tf-project-row">
                        <div className="tf-project-row-main">
                          <span className="tf-project-summary-name">
                            {dir || project.name || project.id}
                          </span>
                          {project.name && project.name !== dir && (
                            <span className="tf-project-summary-dir">{project.name}</span>
                          )}
                        </div>
                        {isCurrent && (
                          <span className="tf-project-current-pill">current</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {projectError && (
                  <div className="tf-sessions-error tf-project-summary-error">
                    <div>Couldn&apos;t load full project list.</div>
                    <div className="tf-sessions-error-raw">{projectError}</div>
                  </div>
                )}
              </div>
            )}

            <div className="tf-kanban">
              <div className="tf-kanban-column">
                <div className="tf-kanban-column-header">
                  <span className="tf-kanban-column-title">Active</span>
                  <span className="tf-kanban-column-count">
                    {activeSessions.length}
                  </span>
                </div>
                <div className="tf-kanban-column-body">
                  {activeSessions.length === 0 && (
                    <div className="tf-sessions-muted tf-kanban-empty">
                      No active sessions.
                    </div>
                  )}
                  {activeSessions.map((session) => {
                    const normalized = normalizeSessionStatus(
                      session,
                      sessionStatus[session.id],
                    );
                    const statusLabel = normalized.label ?? normalized.type;
                    return (
                      <button
                        key={session.id}
                        type="button"
                        className="tf-session-row"
                        onClick={() => navigate(`/sessions/${session.id}`)}
                      >
                        <div className="tf-session-row-main">
                          <div className="tf-session-title">
                            {session.title || session.id.slice(0, 8)}
                          </div>
                          <div className="tf-session-meta">
                            <span className="tf-session-status">
                              {statusLabel}
                            </span>
                            <span className="tf-session-id">{session.id}</span>
                          </div>
                        </div>
                        <div className="tf-session-chevron">›</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="tf-kanban-column">
                <div className="tf-kanban-column-header">
                  <span className="tf-kanban-column-title">Ready</span>
                  <span className="tf-kanban-column-count">
                    {readySessions.length}
                  </span>
                </div>
                <div className="tf-kanban-column-body">
                  {readySessions.length === 0 && (
                    <div className="tf-sessions-muted tf-kanban-empty">
                      No ready sessions.
                    </div>
                  )}
                  {readySessions.map((session) => {
                    const normalized = normalizeSessionStatus(
                      session,
                      sessionStatus[session.id],
                    );
                    const statusLabel = normalized.label ?? normalized.type;
                    return (
                      <button
                        key={session.id}
                        type="button"
                        className="tf-session-row"
                        onClick={() => navigate(`/sessions/${session.id}`)}
                      >
                        <div className="tf-session-row-main">
                          <div className="tf-session-title">
                            {session.title || session.id.slice(0, 8)}
                          </div>
                          <div className="tf-session-meta">
                            <span className="tf-session-status">
                              {statusLabel}
                            </span>
                            <span className="tf-session-id">{session.id}</span>
                          </div>
                        </div>
                        <div className="tf-session-chevron">›</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

const SessionDetailPage: React.FC<{ sessionId: string; navigate: (path: string) => void }> = ({
  sessionId,
  navigate,
}) => {
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

      const res = await fetch(`/api/sessions/${encodeURIComponent(currentSessionId)}/messages`);
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

const TowerPage: React.FC = () => {
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
      <div className="tf-shell-titlebar">
        <div className="tf-shell-dots">
          <span className="dot dot-red" />
          <span className="dot dot-amber" />
          <span className="dot dot-green" />
        </div>
        <span className="tf-shell-title">connector-service · tower</span>
      </div>

      <div className="tf-shell-body tf-sessions-body">
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

const container = document.getElementById("root");

if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

