"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DocsNavLinks } from "./docs-sidebar";
import { Icon } from "./icon";
import { OPEN_SEARCH_EVENT, SearchPalette } from "./search-palette";

const openSearch = () => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));

export function DocsTopbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-cream/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 lg:px-6">
        <button
          aria-controls="docs-drawer"
          aria-expanded={menuOpen}
          aria-label="Open docs menu"
          className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-ink lg:hidden"
          onClick={() => setMenuOpen(true)}
        >
          <Icon className="h-[18px] w-[18px]" name="menu" />
        </button>

        <Link className="flex items-center gap-2.5" href="/docs">
          <span className="h-7 w-7 rounded-tr-lg rounded-bl-lg bg-ink" />
          <span className="text-[15px] font-bold tracking-tight text-ink">
            Toluva <span className="text-slate-400">Docs</span>
          </span>
        </Link>

        <div className="flex-1" />

        <button
          className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-400 transition-colors hover:border-slate-300 sm:flex"
          onClick={openSearch}
        >
          <Icon className="h-4 w-4" name="search" />
          Search
          <kbd className="ml-6 rounded border border-slate-200 px-1.5 text-[10px]">
            ⌘K
          </kbd>
        </button>
        <button
          aria-label="Search"
          className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-white sm:hidden"
          onClick={openSearch}
        >
          <Icon className="h-[18px] w-[18px]" name="search" />
        </button>

        <Link
          className="hidden text-[14px] font-medium text-slate-600 transition-colors hover:text-ink md:block"
          href="/docs/architecture"
        >
          Architecture
        </Link>

        <Link
          className="rounded-full bg-ink px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-black"
          href="/workspace/new"
        >
          Start localizing
        </Link>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close docs menu"
            className="absolute inset-0 h-full w-full animate-scrim-in bg-ink/35 backdrop-blur-[2px]"
            onClick={() => setMenuOpen(false)}
            tabIndex={-1}
          />
          <div
            aria-label="Docs"
            aria-modal="true"
            className="absolute inset-y-0 left-0 flex w-[86%] max-w-[320px] animate-sheet-in flex-col overflow-y-auto bg-white px-5 py-6 shadow-2xl"
            id="docs-drawer"
            role="dialog"
          >
            <div className="mb-8 flex items-center justify-between">
              <span className="flex items-center gap-2.5">
                <span className="h-7 w-7 rounded-tr-lg rounded-bl-lg bg-ink" />
                <span className="text-[15px] font-bold tracking-tight text-ink">
                  Toluva <span className="text-slate-400">Docs</span>
                </span>
              </span>
              <button
                aria-label="Close docs menu"
                className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-ink"
                onClick={() => setMenuOpen(false)}
              >
                <Icon className="h-4 w-4" name="close" />
              </button>
            </div>
            <DocsNavLinks onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      <SearchPalette />
    </header>
  );
}

export default DocsTopbar;
