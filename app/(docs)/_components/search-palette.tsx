"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { flatDocs } from "../../../lib/docs-nav";
import { Icon } from "./icon";

export const OPEN_SEARCH_EVENT = "toluva:open-search";

/**
 * The palette body. Split out so query and cursor reset by unmounting rather
 * than by a state-clearing effect when the dialog reopens.
 */
function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flatDocs;
    return flatDocs.filter((d) =>
      `${d.title} ${d.summary} ${d.group}`.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    // Focus after paint, or the input is not in the DOM yet.
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  const go = (slug: string) => {
    onClose();
    router.push(slug);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && results[cursor]) {
      e.preventDefault();
      go(results[cursor].slug);
    }
  };

  return (
    <div
      aria-label="Search the docs"
      aria-modal="true"
      className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
    >
      <div className="flex items-center gap-3 border-b border-slate-200 px-4">
        <Icon className="h-[18px] w-[18px] text-slate-400" name="search" />
        <input
          className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-slate-400"
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search the docs…"
          ref={inputRef}
          value={query}
        />
        <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400">
          ESC
        </kbd>
      </div>

      <ul className="max-h-[52vh] overflow-y-auto p-2">
        {results.length === 0 && (
          <li className="px-3 py-8 text-center text-[14px] text-slate-400">
            No pages match “{query}”.
          </li>
        )}
        {results.map((d, i) => (
          <li key={d.slug}>
            <button
              className={`flex w-full flex-col items-start rounded-lg px-3 py-2.5 text-left transition-colors ${
                i === cursor ? "bg-cream" : "hover:bg-cream/60"
              }`}
              onClick={() => go(d.slug)}
              onMouseEnter={() => setCursor(i)}
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                {d.group}
              </span>
              <span className="text-[14px] font-semibold text-ink">
                {d.title}
              </span>
              <span className="mt-0.5 line-clamp-1 text-[12.5px] text-slate-500">
                {d.summary}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * ⌘K palette over the same `flatDocs` array the sidebar and prev/next use, so
 * a page can never be reachable by one and invisible to the others.
 */
export function SearchPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-ink/35 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <Palette onClose={() => setOpen(false)} />
    </div>
  );
}

export default SearchPalette;
