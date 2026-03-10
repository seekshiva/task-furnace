import indexHtml from "./ui/index.html";

// TODO: Implement TaskFurnace engine core and expose a public API from this module.
// For now, this file serves as the dev entrypoint that runs the React shell UI.

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  routes: {
    "/": indexHtml,
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`🔧 TaskFurnace dev server running at http://localhost:${server.port}`);
