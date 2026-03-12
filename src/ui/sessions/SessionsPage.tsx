import React, { useEffect, useState } from "react";
import {
  Session,
  Project,
  SessionStatusMap,
  SessionActivityMap,
  normalizeSessionStatus,
  isActiveSessionStatus,
} from "./types";

export const SessionsPage: React.FC<{ navigate: (path: string) => void }> = ({
  navigate,
}) => {
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

        let projectsBody: { projects?: Project[]; current?: Project | null } | null =
          null;
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

