import type { Session, SessionStatusMap } from "./types";

export function getRawSessionStatusValue(
  session: Session,
  statusEntry: SessionStatusMap[string] | undefined,
): string | null {
  return statusEntry?.type ?? statusEntry?.state ?? statusEntry?.status ?? session.status ?? null;
}

/** Completed / closed sessions (merged with idle “ready” in the Done kanban column). */
export function isSessionDoneState(
  session: Session,
  statusEntry: SessionStatusMap[string] | undefined,
): boolean {
  const rawStatus = getRawSessionStatusValue(session, statusEntry)?.trim().toLowerCase() ?? null;
  return (
    rawStatus === "done" ||
    rawStatus === "complete" ||
    rawStatus === "completed" ||
    rawStatus === "closed"
  );
}
