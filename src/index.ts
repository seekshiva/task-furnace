import indexHtml from "./ui/index.html";
import { $ } from "bun";
import { createOpencodeClient } from "@opencode-ai/sdk";

// TODO: Implement TaskFurnace engine core and expose a public API from this module.
// For now, this file serves as the dev entrypoint that runs the React shell UI.

const port = Number(process.env.PORT ?? 3000);

const opencodeBaseUrl = process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096";
const opencodeClient = createOpencodeClient({
  baseUrl: opencodeBaseUrl,
});

const connectorServicePath = process.env.CONNECTOR_SERVICE_PATH;

type SessionActivityStatus = {
  statusType: "busy" | "retry" | "idle" | "unknown";
  rawType: string | null;
  isActive: boolean;
  lastEventAt: number | null;
};

const sessionActivity = new Map<string, SessionActivityStatus>();
let eventsSubscribed = false;

function updateSessionActivity(sessionID: string, statusType: string | null | undefined) {
  const now = Date.now();
  const lowered = (statusType ?? "").toLowerCase();

  let normalized: SessionActivityStatus["statusType"] = "unknown";
  let isActive = false;

  if (lowered === "busy") {
    normalized = "busy";
    isActive = true;
  } else if (lowered === "retry") {
    normalized = "retry";
    isActive = true;
  } else if (lowered === "idle") {
    normalized = "idle";
    isActive = false;
  } else {
    normalized = "unknown";
    isActive = false;
  }

  sessionActivity.set(sessionID, {
    statusType: normalized,
    rawType: statusType ?? null,
    isActive,
    lastEventAt: now,
  });
}

async function startEventSubscription() {
  if (eventsSubscribed) return;
  eventsSubscribed = true;

  try {
    const result = await (opencodeClient as any).event.subscribe({
      directory: undefined,
      workspace: undefined,
    });

    for await (const event of (result as any).stream) {
      try {
        if (!event || typeof event !== "object") continue;
        const type = (event as { type?: string }).type;

        if (type === "session.status") {
          const props = (event as { properties?: { sessionID?: string; status?: { type?: string } } })
            .properties;
          const sessionID = props?.sessionID;
          const statusType = props?.status?.type;
          if (!sessionID) continue;
          updateSessionActivity(sessionID, statusType);
        } else if (type === "session.idle") {
          const props = (event as { properties?: { sessionID?: string } }).properties;
          const sessionID = props?.sessionID;
          if (!sessionID) continue;
          updateSessionActivity(sessionID, "idle");
        }
      } catch (err) {
        console.error("Failed to process opencode event", err);
      }
    }
  } catch (error) {
    console.error("Failed to subscribe to opencode events", error);
    // Allow retry on next incoming request.
    eventsSubscribed = false;
  }
}

const server = Bun.serve({
  port,
  routes: {
    "/": indexHtml,
    "/sessions": indexHtml,
    "/sessions/:sessionId": indexHtml,
    "/tower": indexHtml,
    "/api/projects": {
      GET: async () => {
        try {
          const [listResult, currentResult] = await Promise.all([
            (opencodeClient as any).project.list(),
            (opencodeClient as any).project.current(),
          ]);

          const projects = (listResult as any).data ?? listResult;
          const current = (currentResult as any).data ?? currentResult;

          return Response.json({ projects, current });
        } catch (error) {
          console.error("Failed to load opencode projects", error);
          return new Response(
            JSON.stringify({ error: "Failed to load projects from opencode" }),
            { status: 500 },
          );
        }
      },
    },
    "/api/sessions/status": {
      GET: async () => {
        try {
          const params: { directory?: string } = {};
          if (connectorServicePath) {
            params.directory = connectorServicePath;
          }

          const result = await (opencodeClient as any).session.status(params);
          const body = (result as any).data ?? result;

          return Response.json({ status: body });
        } catch (error) {
          console.error("Failed to load opencode session status", error);
          return new Response(
            JSON.stringify({ error: "Failed to load session status from opencode" }),
            { status: 500 },
          );
        }
      },
    },
    "/api/sessions": {
      GET: async () => {
        try {
          const result = await opencodeClient.session.list();
          const items = Array.isArray((result as any).data) ? (result as any).data : result;
          return Response.json({ sessions: items });
        } catch (error) {
          console.error("Failed to list opencode sessions", error);
          return new Response(
            JSON.stringify({ error: "Failed to load sessions from opencode" }),
            { status: 500 },
          );
        }
      },
    },
    "/api/sessions/:sessionId": {
      GET: async (req) => {
        const { sessionId } = req.params;

        try {
          const result = await opencodeClient.session.get({ path: { id: sessionId } });
          const data = (result as any).data ?? result;
          return Response.json({ session: data });
        } catch (error) {
          console.error(`Failed to load opencode session ${sessionId}`, error);
          return new Response(
            JSON.stringify({ error: "Failed to load session from opencode" }),
            { status: 500 },
          );
        }
      },
    },
    "/api/sessions/:sessionId/prompt": {
      POST: async (req) => {
        const { sessionId } = req.params;

        try {
          const body = await req.json();
          const text = typeof body?.text === "string" ? body.text.trim() : "";
          const noReply = Boolean(body?.noReply);

          if (!text) {
            return new Response(
              JSON.stringify({ error: "Missing or empty 'text' field in request body" }),
              { status: 400 },
            );
          }

          const result = await (opencodeClient as any).session.prompt({
            path: { id: sessionId },
            body: {
              noReply,
              parts: [{ type: "text", text }],
            },
          });

          const data = (result as any).data ?? result;
          return Response.json({ result: data });
        } catch (error) {
          console.error(`Failed to send prompt to opencode session ${sessionId}`, error);
          return new Response(
            JSON.stringify({ error: "Failed to send prompt to opencode session" }),
            { status: 500 },
          );
        }
      },
    },
    "/api/sessions/:sessionId/messages": {
      GET: async (req) => {
        const { sessionId } = req.params;

        try {
          const result = await (opencodeClient as any).session.messages({
            path: { id: sessionId },
          });
          const data = (result as any).data ?? result;
          return Response.json({ messages: data });
        } catch (error) {
          console.error(`Failed to load opencode session messages for ${sessionId}`, error);
          return new Response(
            JSON.stringify({ error: "Failed to load session messages from opencode" }),
            { status: 500 },
          );
        }
      },
    },
    "/api/sessions/activity": {
      GET: async () => {
        // Lazily start subscription on first use.
        void startEventSubscription();

        const now = Date.now();
        const timeoutMs = 5 * 60 * 1000;
        const activity: Record<
          string,
          { state: "active" | "ready"; rawType: string | null; lastEventAt: number | null }
        > = {};

        for (const [sessionID, status] of sessionActivity.entries()) {
          let isActive = status.isActive;
          if (isActive && status.lastEventAt !== null && now - status.lastEventAt > timeoutMs) {
            isActive = false;
          }

          activity[sessionID] = {
            state: isActive ? "active" : "ready",
            rawType: status.rawType,
            lastEventAt: status.lastEventAt,
          };
        }

        return Response.json({ activity });
      },
    },
    "/api/opencode/events": {
      GET: async () => {
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          async start(controller) {
            try {
              const result = await (opencodeClient as any).event.subscribe({
                directory: undefined,
                workspace: undefined,
              });

              // result.stream is an async generator of events; forward as SSE.
              for await (const event of (result as any).stream) {
                const payload = JSON.stringify(event);
                const chunk = encoder.encode(`data: ${payload}\n\n`);
                controller.enqueue(chunk);
              }

              controller.close();
            } catch (error) {
              console.error("Failed to proxy opencode events", error);
              try {
                controller.close();
              } catch {
                // ignore
              }
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
    },
    "/api/tower/commits": {
      GET: async () => {
        if (!connectorServicePath) {
          return new Response(
            JSON.stringify({
              error:
                "CONNECTOR_SERVICE_PATH is not configured. Set it in .env to use the Tower view.",
            }),
            { status: 400 },
          );
        }

        try {
          // Show commits that are ahead of main for the current branch.
          const { stdout } =
            await $`git -C ${connectorServicePath} log main..HEAD --pretty=format:%H%x1f%an%x1f%ad%x1f%s --date=iso`;

          const commits = stdout
            .toString()
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              const [hash, author, date, message] = line.split("\x1f");
              return {
                hash,
                author,
                date,
                message,
              };
            });

          const aheadCount = commits.length;

          return Response.json({ commits, aheadCount });
        } catch (error) {
          console.error("Failed to load commits for connector-service", error);
          return new Response(JSON.stringify({ error: "Failed to load commits from connector-service" }), {
            status: 500,
          });
        }
      },
    },
    "/api/tower/commits/:hash/files": {
      GET: async (req) => {
        if (!connectorServicePath) {
          return new Response(
            JSON.stringify({
              error:
                "CONNECTOR_SERVICE_PATH is not configured. Set it in .env to use the Tower view.",
            }),
            { status: 400 },
          );
        }

        const { hash } = req.params;

        try {
          const [statusResult, numstatResult] = await Promise.all([
            $`git -C ${connectorServicePath} show --name-status --format= ${hash}`,
            $`git -C ${connectorServicePath} show --numstat --format= ${hash}`,
          ]);

          const statusLines = statusResult.stdout
            .toString()
            .trim()
            .split("\n")
            .filter(Boolean);

          const numstatLines = numstatResult.stdout
            .toString()
            .trim()
            .split("\n")
            .filter(Boolean);

          const statusMap = new Map<string, string>();

          for (const line of statusLines) {
            const parts = line.split(/\s+/, 2);
            if (parts.length === 2) {
              const status = parts[0] ?? "";
              const path = parts[1] ?? "";
              statusMap.set(path, status);
            }
          }

          const files = numstatLines
            .map((line) => {
              const [additionsRaw, deletionsRaw, pathRaw] = line.split("\t");
              const path = pathRaw ?? "";
              if (!path) {
                return null;
              }

              const additionsNumber = Number(additionsRaw);
              const deletionsNumber = Number(deletionsRaw);

              const additions =
                additionsRaw === "-" || Number.isNaN(additionsNumber) ? 0 : additionsNumber;
              const deletions =
                deletionsRaw === "-" || Number.isNaN(deletionsNumber) ? 0 : deletionsNumber;
              const status = statusMap.get(path) ?? "M";

              return {
                path,
                status,
                additions,
                deletions,
              };
            })
            .filter(
              (file): file is { path: string; status: string; additions: number; deletions: number } =>
                file !== null,
            );

          return Response.json({ files });
        } catch (error) {
          console.error(`Failed to load commit details for ${hash}`, error);
          return new Response(
            JSON.stringify({ error: "Failed to load commit details from connector-service" }),
            { status: 500 },
          );
        }
      },
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`🔧 TaskFurnace dev server running at http://localhost:${server.port}`);
