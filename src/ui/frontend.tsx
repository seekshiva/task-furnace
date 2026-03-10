import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const App: React.FC = () => {
  return (
    <div className="tf-app">
      <header className="tf-header">
        <span className="tf-header-logo">🔥</span>
        <span className="tf-header-title">TaskFurnace</span>
        <span className="tf-header-subtitle">Always-on orchestration shell</span>
      </header>

      <main className="tf-main">
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
      </main>
    </div>
  );
};

const container = document.getElementById("root");

if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

