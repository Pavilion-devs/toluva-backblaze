"use client";

import { useWorkspace } from "./workspace-data";

export function WorkspaceNotices() {
  const { notice, setNotice, statusWarning } = useWorkspace();

  if (!notice && !statusWarning) return null;

  return (
    <div className="mb-6 flex flex-col gap-3">
      {notice && (
        <div
          className="flex items-center gap-3 rounded-2xl border border-fit-green/25 bg-fit-green-soft px-5 py-3 text-body font-semibold text-fit-green"
          role="status"
        >
          <span aria-hidden="true">✓</span>
          <span className="flex-1">{notice}</span>
          <button
            aria-label="Dismiss notice"
            className="text-lg leading-none opacity-60 hover:opacity-100"
            onClick={() => setNotice(null)}
          >
            ×
          </button>
        </div>
      )}
      {statusWarning && (
        <div
          className="rounded-2xl border border-fit-amber/25 bg-fit-amber-soft px-5 py-3 text-body font-medium text-fit-amber"
          role="status"
        >
          {statusWarning}
        </div>
      )}
    </div>
  );
}
