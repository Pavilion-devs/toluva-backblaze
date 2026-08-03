"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isActive, navGroups } from "./workspace-nav";
import { useWorkspace } from "./workspace-data";

function BrandMark() {
  return (
    <>
      <span className="h-6 w-6 rounded-tr-lg rounded-bl-lg bg-ink" />
      <span className="text-xl font-bold tracking-tight text-ink">Toluva</span>
    </>
  );
}

function NavLinks({
  onNavigate,
  pathname,
}: {
  onNavigate?: () => void;
  pathname: string;
}) {
  return (
    <>
      {navGroups.map((group) => (
        <div key={group.label}>
          <span className="mb-2 block px-3 text-label font-bold uppercase tracking-[0.14em] text-slate-500">
            {group.label}
          </span>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-3 py-2 text-body font-medium transition-colors ${
                    active
                      ? "bg-ink text-white shadow-sm"
                      : "text-slate-700 hover:bg-white/70 hover:text-ink"
                  }`}
                  href={item.href}
                  key={item.href}
                  onClick={onNavigate}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function ProjectCard() {
  const { run } = useWorkspace();
  return (
    <div className="rounded-2xl border border-white/60 bg-white/60 p-4 backdrop-blur-md">
      <span className="mb-1.5 block text-label font-bold uppercase tracking-[0.14em] text-slate-500">
        Example project
      </span>
      <strong className="block text-[15px] font-bold leading-tight text-ink">
        {run.project.title}
      </strong>
      <small className="mt-1 block text-caption text-slate-600">
        English → German
      </small>
      <div className="mt-3 border-t border-slate-900/5 pt-3 text-caption font-medium text-slate-600">
        Completed reference run
      </div>
    </div>
  );
}

export function WorkspaceSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sky-backdrop sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col overflow-y-auto border-r border-white/50 px-5 py-6 lg:flex">
      <Link className="mb-8 flex items-center gap-2" href="/">
        <BrandMark />
      </Link>

      <nav aria-label="Workspace" className="flex flex-col gap-6">
        <NavLinks pathname={pathname} />
      </nav>

      <div className="mt-auto pt-8">
        <ProjectCard />
      </div>
    </aside>
  );
}

/**
 * Under `lg` the rail is replaced by a drawer. A flat scroller of eight pills
 * lost the four-group structure and hid whatever sat past the right edge.
 */
export function WorkspaceMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div className="sky-backdrop flex items-center justify-between gap-3 border-b border-white/50 px-4 py-3 lg:hidden">
        <Link className="flex items-center gap-2" href="/">
          <BrandMark />
        </Link>
        <button
          aria-controls="workspace-drawer"
          aria-expanded={open}
          aria-label="Open workspace menu"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/60 bg-white/70 text-ink backdrop-blur-md transition-colors hover:bg-white"
          onClick={() => setOpen(true)}
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="18"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="18"
          >
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close workspace menu"
            className="absolute inset-0 h-full w-full animate-scrim-in bg-ink/35 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            tabIndex={-1}
          />
          <div
            aria-label="Workspace"
            aria-modal="true"
            className="sky-backdrop absolute inset-y-0 left-0 flex w-[86%] max-w-[320px] animate-sheet-in flex-col overflow-y-auto px-5 py-6 shadow-2xl"
            id="workspace-drawer"
            role="dialog"
          >
            <div className="mb-8 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <BrandMark />
              </span>
              <button
                aria-label="Close workspace menu"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/70 text-ink"
                onClick={() => setOpen(false)}
              >
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="16"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="16"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <nav className="flex flex-col gap-6">
              <NavLinks onNavigate={() => setOpen(false)} pathname={pathname} />
            </nav>

            <div className="mt-auto pt-8">
              <ProjectCard />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
