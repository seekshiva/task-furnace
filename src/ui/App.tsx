import React from "react";
import { useRoute } from "./router";
import { SessionsPage } from "./sessions/SessionsPage";
import { SessionDetailPage } from "./sessions/SessionDetailPage";
import { TowerPage } from "./tower/TowerPage";

const appClassName =
  "flex h-full max-h-screen min-h-0 w-full flex-1 flex-col bg-[radial-gradient(circle_at_top_right,rgba(191,219,254,0.45),transparent_28%),linear-gradient(180deg,#fdfefe_0%,#f5f7fb_100%)] px-[18px] pt-4 pb-[18px] max-md:px-[10px] max-md:pt-[14px] max-md:pb-4";

const headerClassName =
  "flex w-full items-center justify-between gap-5 rounded-full border border-[rgba(219,228,240,0.95)] bg-white/92 px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-[14px] max-[900px]:flex-col max-[900px]:items-stretch max-[900px]:rounded-[24px] max-md:p-[14px]";

const navButtonClass = (active: boolean) =>
  [
    "rounded-full border px-4 py-[7px] text-[13px] font-semibold transition",
    active
      ? "border-slate-200 bg-white text-blue-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
      : "border-transparent bg-transparent text-slate-500 hover:bg-white/80 hover:text-slate-900",
  ].join(" ");

export const App: React.FC = () => {
  const [route, navigate] = useRoute();

  const isSessionsRoute =
    route.type === "sessions" || route.type === "session-detail";

  return (
    <div className={appClassName}>
      <header className={headerClassName}>
        <div className="flex min-w-0 items-center gap-3 max-[900px]:justify-center">
          <span className="text-[20px] leading-none">🔥</span>
          <div className="flex min-w-0 flex-row items-baseline gap-1.5 max-[900px]:justify-center max-md:flex-col max-md:gap-0.5 max-md:text-center">
            <span className="text-[18px] font-bold uppercase tracking-[0.04em] text-slate-900">
              TaskFurnace
            </span>
            <span className="whitespace-nowrap text-xs text-slate-500">
              Always-on orchestration shell
            </span>
          </div>
        </div>
        <nav className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 p-1 max-[900px]:self-center">
          <button
            type="button"
            className={navButtonClass(isSessionsRoute)}
            onClick={() => navigate("/sessions")}
          >
            Sessions
          </button>
          <button
            type="button"
            className={navButtonClass(route.type === "tower")}
            onClick={() => navigate("/tower")}
          >
            Tower
          </button>
        </nav>
      </header>

      <main className="flex min-h-0 flex-1 items-stretch justify-stretch pt-3 max-md:pt-4">
        {route.type === "sessions" && <SessionsPage navigate={navigate} />}
        {route.type === "session-detail" && (
          <SessionDetailPage sessionId={route.sessionId} navigate={navigate} />
        )}
        {route.type === "tower" && <TowerPage />}
      </main>
    </div>
  );
};

