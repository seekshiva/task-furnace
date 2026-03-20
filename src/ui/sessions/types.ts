export type Session = {
  id: string;
  title?: string | null;
  status?: string | null;
  time?: {
    created?: string | number | null;
    updated?: string | number | null;
  } | null;
  directory?: string | null;
  projectId?: string | null;
  projectID?: string | null;
  rootId?: string | null;
  rootID?: string | null;
  parentId?: string | null;
  parentID?: string | null;
  source?: "opencode" | "claude-code";
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
  parts: SessionMessagePart[];
};

export type SessionMessageRole = "user" | "assistant" | (string & {});

export type SessionMessagePart =
  | { type: "text"; text: string; [key: string]: unknown }
  | { type: "reasoning"; text: string; [key: string]: unknown }
  | { type: "step-start"; [key: string]: unknown }
  | { type: "step-finish"; reason?: string; [key: string]: unknown }
  | {
      type: "tool";
      tool?: string;
      callID?: string;
      state?: SessionToolState;
      [key: string]: unknown;
    }
  | { type: string; [key: string]: unknown };

export type SessionToolState =
  | { status: "pending"; input?: Record<string, unknown>; raw?: string; [key: string]: unknown }
  | {
      status: "running";
      input?: Record<string, unknown>;
      title?: string;
      time?: { start?: number };
      metadata?: Record<string, unknown>;
      [key: string]: unknown;
    }
  | {
      status: "completed";
      input?: Record<string, unknown>;
      output?: string;
      title?: string;
      time?: { start?: number; end?: number; compacted?: number };
      metadata?: Record<string, unknown>;
      attachments?: Array<unknown>;
      [key: string]: unknown;
    }
  | {
      status: "error";
      input?: Record<string, unknown>;
      error?: string;
      time?: { start?: number; end?: number };
      metadata?: Record<string, unknown>;
      [key: string]: unknown;
    }
  | { status: string; [key: string]: unknown };

export function isTextPart(part: SessionMessagePart): part is Extract<SessionMessagePart, { type: "text" }> {
  return part?.type === "text" && typeof (part as any).text === "string";
}

export function isReasoningPart(
  part: SessionMessagePart,
): part is Extract<SessionMessagePart, { type: "reasoning" }> {
  return part?.type === "reasoning" && typeof (part as any).text === "string";
}

export function isToolPart(part: SessionMessagePart): part is Extract<SessionMessagePart, { type: "tool" }> {
  return part?.type === "tool";
}

export function isStepStartPart(
  part: SessionMessagePart,
): part is Extract<SessionMessagePart, { type: "step-start" }> {
  return part?.type === "step-start";
}

export function isStepFinishPart(
  part: SessionMessagePart,
): part is Extract<SessionMessagePart, { type: "step-finish" }> {
  return part?.type === "step-finish";
}

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
  const value = session.time?.created ?? null;
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? new Date(value).toISOString() : value;
}

export function getSessionUpdatedAt(session: Session): string | null {
  const value = session.time?.updated ?? null;
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? new Date(value).toISOString() : value;
}

export function getSessionParentId(session: Session): string | null {
  return session.parentID ?? session.parentId ?? null;
}

export function getSessionRootId(session: Session): string | null {
  return session.rootID ?? session.rootId ?? null;
}

