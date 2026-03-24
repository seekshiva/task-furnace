import React from "react";
import type { Session } from "./types";

export const SessionCardHeader: React.FC<{
  session: Pick<Session, "id" | "title">;
  statusLabel: string;
  createdLabel: string | null;
  onClick: () => void;
  className: string;
  extraBadges?: React.ReactNode;
  showChevron?: boolean;
}> = ({
  session,
  statusLabel,
  createdLabel,
  onClick,
  className,
  extraBadges,
  showChevron = true,
}) => {
  const label = session.title || session.id.slice(0, 8);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={className}
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-label={`Open session: ${label}`}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</div>
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
    </div>
  );
};
