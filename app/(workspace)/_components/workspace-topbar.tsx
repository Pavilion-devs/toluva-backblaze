"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonClass } from "./ui";
import { useWorkspace } from "./workspace-data";

const crumbs: Record<string, string> = {
  "/workspace": "Example project",
  "/workspace/assets": "B2 assets",
  "/workspace/editions": "Language editions",
  "/workspace/new": "New localization",
  "/workspace/provenance": "Provenance",
  "/workspace/runs": "Runs",
  "/workspace/timing": "Timing QA",
  "/workspace/voice": "Voice authorization",
};

const workerCopy: Record<string, string> = {
  checking: "CHECKING WORKER",
  idle: "WORKER ONLINE",
  offline: "QUEUE ONLY",
  processing: "WORKER BUSY",
};

const workerTone: Record<string, string> = {
  checking: "bg-slate-100 border-slate-200 text-slate-500",
  idle: "bg-fit-green-soft border-fit-green/25 text-fit-green",
  offline: "bg-fit-amber-soft border-fit-amber/25 text-fit-amber",
  processing: "bg-fit-green-soft border-fit-green/25 text-fit-green",
};

export function WorkspaceTopbar() {
  const pathname = usePathname();
  const { connection, refreshRun, workerConnection } = useWorkspace();

  const crumb =
    crumbs[pathname] ??
    (pathname.startsWith("/workspace/runs/") ? "Run detail" : "Workspace");

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 bg-cream/85 px-4 py-3 backdrop-blur-md md:px-8">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
        <Link className="hover:text-ink" href="/">
          Toluva
        </Link>
        <span aria-hidden="true">/</span>
        <strong className="font-semibold text-ink">{crumb}</strong>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide ${workerTone[workerConnection]}`}
          title={
            workerConnection === "offline"
              ? "Uploads remain durable in B2 until the generation worker reconnects."
              : "The single-replica Python generation worker is reporting through B2."
          }
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {workerCopy[workerConnection]}
        </span>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide ${
            connection === "live"
              ? "bg-fit-green-soft border-fit-green/25 text-fit-green"
              : connection === "checking"
                ? "bg-slate-100 border-slate-200 text-slate-500"
                : "bg-slate-100 border-slate-200 text-slate-600"
          }`}
          title={
            connection === "live"
              ? "Records are loaded from the private Backblaze B2 project."
              : "The last verified run snapshot is visible."
          }
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {connection === "live"
            ? "LIVE B2 RUN"
            : connection === "checking"
              ? "CHECKING B2"
              : "VERIFIED SNAPSHOT"}
        </span>

        <button
          className={buttonClass("secondary")}
          onClick={() => void refreshRun()}
        >
          Refresh
        </button>

        <Link className={buttonClass("primary")} href="/workspace/new">
          New localization
        </Link>
      </div>
    </header>
  );
}
