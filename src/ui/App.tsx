import React from "react";
import { useRoute } from "./router";
import { SessionsPage } from "./sessions/SessionsPage";
import { SessionDetailPage } from "./sessions/SessionDetailPage";
import { TowerPage } from "./tower/TowerPage";

export const App: React.FC = () => {
  const [route, navigate] = useRoute();

  const isSessionsRoute =
    route.type === "sessions" || route.type === "session-detail";

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
            className={`tf-nav-link ${isSessionsRoute ? "tf-nav-link-active" : ""}`}
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
        {route.type === "sessions" && <SessionsPage navigate={navigate} />}
        {route.type === "session-detail" && (
          <SessionDetailPage sessionId={route.sessionId} navigate={navigate} />
        )}
        {route.type === "tower" && <TowerPage />}
      </main>
    </div>
  );
};

