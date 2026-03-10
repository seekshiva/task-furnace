import indexHtml from "./ui/index.html";
import { createOpencodeClient } from "@opencode-ai/sdk";

// TODO: Implement TaskFurnace engine core and expose a public API from this module.
// For now, this file serves as the dev entrypoint that runs the React shell UI.

const port = Number(process.env.PORT ?? 3000);

const opencodeBaseUrl = process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096";
const opencodeClient = createOpencodeClient({
  baseUrl: opencodeBaseUrl,
});

const server = Bun.serve({
  port,
  routes: {
    "/": indexHtml,
    "/sessions": indexHtml,
    "/sessions/:sessionId": indexHtml,
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
          const url = new URL("/session/status", opencodeBaseUrl);
          const res = await fetch(url);
          if (!res.ok) {
            throw new Error(`Request failed with status ${res.status}`);
          }
          const body = await res.json();
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
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`🔧 TaskFurnace dev server running at http://localhost:${server.port}`);
