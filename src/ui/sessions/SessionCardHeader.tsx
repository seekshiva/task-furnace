import React from "react";
import type { Session } from "./types";

export const SessionCardHeader: React.FC<{
  session: Pick<Session, "id" | "title">;
  statusLabel: string;
  createdLabel: string | null;
  onClick: () => void;
  buttonClassName: string;
  extraBadges?: React.ReactNode;
  showChevron?: boolean;
}> = ({
  session,
  statusLabel,
  createdLabel,
  onClick,
  buttonClassName,
  extraBadges,
  showChevron = true,
}) => {
  return (
    <button type="button" className={buttonClassName} onClick={onClick}>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {session.title || session.id.slice(0, 8)}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
            {statusLabel}
          </span>
          {extraBadges}
        </div>
        {createdLabel && (
          <div className="text-xs text-slate-500 dark:text-slate-400">Created {createdLabel}</div>
        )}
      </div>
      {showChevron && <div className="shrink-0 text-lg text-slate-400 dark:text-slate-500">›</div>}
    </button>
  );
};

