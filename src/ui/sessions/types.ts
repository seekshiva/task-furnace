export type Session = {
  id: string;
  title?: string | null;
  status?: string | null;
  time?: {
    created?: string | null;
    updated?: string | null;
  } | null;
  directory?: string | null;
  projectId?: string | null;
  rootId?: string | null;
};

export type Project = {
  id: string;
  name?: string | null;
  directory?: string | null;
  root?: string | null;
  path?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SessionMessage = {
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

export type SessionStatusMap = Record<
  string,
  {
    // Support both the typed opencode shape ({ type: "busy" | "retry" | "idle" })
    // and the looser status/state strings used earlier.
    type?: "idle" | "busy" | "retry" | string;
    status?: string | null;
    state?: string | null;
  }
>;

export type SessionActivityMap = Record<
  string,
  {
    state: "active" | "ready";
    rawType: string | null;
    lastEventAt: number | null;
  }
>;

export type NormalizedSessionStatus = {
  type: "idle" | "busy" | "retry" | "unknown";
  label: string | null;
};

export function normalizeSessionStatus(
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

export function isActiveSessionStatus(status: NormalizedSessionStatus): boolean {
  return status.type === "busy" || status.type === "retry";
}

export function getSessionCreatedAt(session: Session): string | null {
  return session.time?.created ?? null;
}

export function getSessionUpdatedAt(session: Session): string | null {
  return session.time?.updated ?? null;
}

