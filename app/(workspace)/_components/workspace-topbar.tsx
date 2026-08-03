"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonClass, Spinner } from "./ui";
import { activeLabel } from "./workspace-nav";
import { useWorkspace } from "./workspace-data";

const workerCopy: Record<string, string> = {
  checking: "Checking worker",
  idle: "Worker online",
  offline: "Queue only",
  processing: "Worker busy",
};

const workerTone: Record<string, string> = {
  checking: "bg-slate-100 border-slate-200 text-slate-500",
  idle: "bg-fit-green-soft border-fit-green/25 text-fit-green",
  offline: "bg-fit-amber-soft border-fit-amber/25 text-fit-amber",
  processing: "bg-fit-green-soft border-fit-green/25 text-fit-green",
};

const connectionCopy: Record<string, string> = {
  checking: "Checking B2",
  live: "Live B2",
  snapshot: "Snapshot",
};

const connectionTone: Record<string, string> = {
  checking: "bg-slate-100 border-slate-200 text-slate-500",
  live: "bg-fit-green-soft border-fit-green/25 text-fit-green",
  snapshot: "bg-slate-100 border-slate-200 text-slate-600",
};

function StatusPill({
  className,
  label,
  pulse,
  title,
}: {
  className: string;
  label: string;
  pulse?: boolean;
  title: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-micro font-bold ${className}`}
      title={title}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full bg-current ${pulse ? "animate-pulse-dot" : ""}`}
      />
      {label}
    </span>
  );
}

export function WorkspaceTopbar() {
  const pathname = usePathname();
  const { connection, refreshRun, workerConnection } = useWorkspace();
  const crumb = activeLabel(pathname);
  const refreshing = connection === "checking";

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-cream/90 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-8">
        <div className="flex min-w-0 items-center gap-2 text-caption font-medium text-slate-500">
          <Link className="hidden hover:text-ink sm:inline" href="/">
            Toluva
          </Link>
          <span aria-hidden="true" className="hidden sm:inline">
            /
          </span>
          <strong className="truncate text-body font-semibold text-ink">
            {crumb}
          </strong>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
            <StatusPill
              className={workerTone[workerConnection]}
              label={workerCopy[workerConnection]}
              pulse={workerConnection === "processing"}
              title={
                workerConnection === "offline"
                  ? "Uploads remain durable in B2 until the generation worker reconnects."
                  : "The single-replica Python generation worker is reporting through B2."
              }
            />
            <StatusPill
              className={connectionTone[connection]}
              label={connectionCopy[connection]}
              title={
                connection === "live"
                  ? "Records are loaded from the private Backblaze B2 project."
                  : "The last stored snapshot is visible."
              }
            />
          </div>

          <Link
            className="hidden text-caption font-medium text-slate-600 transition-colors hover:text-ink sm:block"
            href="/docs"
          >
            Docs
          </Link>

          <button
            aria-label="Refresh records from Backblaze B2"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:text-ink disabled:opacity-50"
            disabled={refreshing}
            onClick={() => void refreshRun()}
          >
            {refreshing ? (
              <Spinner />
            ) : (
              <svg
                aria-hidden="true"
                fill="none"
                height="16"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="16"
              >
                <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            )}
          </button>

          <Link
            className={`${buttonClass("primary")} whitespace-nowrap px-4 py-2 text-caption sm:px-5 sm:py-2.5 sm:text-sm`}
            href="/workspace/new"
          >
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New localization</span>
          </Link>
        </div>
      </div>

      {/* Status moves below the crumb rather than disappearing on small screens. */}
      <div className="flex items-center gap-2 overflow-x-auto border-t border-slate-200/60 px-4 py-2 md:hidden">
        <StatusPill
          className={workerTone[workerConnection]}
          label={workerCopy[workerConnection]}
          pulse={workerConnection === "processing"}
          title="Generation worker state"
        />
        <StatusPill
          className={connectionTone[connection]}
          label={connectionCopy[connection]}
          title="Backblaze B2 connection state"
        />
      </div>
    </header>
  );
}
