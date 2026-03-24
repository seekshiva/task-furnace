import type { Session } from "./types";

/** Path for the session detail route (includes `cc-` prefix for Claude Code). */
export function sessionDetailPath(session: Pick<Session, "id" | "source">): string {
  const id = session.source === "claude-code" ? `cc-${session.id}` : session.id;
  return `/sessions/${id}`;
}
