"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const links = [
  { href: "#how", label: "How it works" },
  { href: "#evidence", label: "Evidence" },
  { href: "#features", label: "Features" },
  {
    external: true,
    href: "https://github.com/Pavilion-devs/toluva-backblaze",
    label: "Source",
  },
];

export function MarketingNav() {
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
    <nav className="mx-auto flex w-full max-w-7xl animate-fade-in items-center justify-between px-5 py-5 sm:px-6 sm:py-6 md:px-12">
      <Link className="flex items-center gap-2" href="/">
        <span className="h-6 w-6 rounded-tr-lg rounded-bl-lg bg-black" />
        <span className="text-xl font-bold tracking-tight text-slate-900">
          Toluva
        </span>
      </Link>

      <div className="hidden items-center gap-8 text-[15px] font-medium text-slate-700 md:flex">
        {links.map((link) => (
          <a
            className="transition-colors hover:text-black"
            href={link.href}
            key={link.href}
            {...(link.external
              ? { rel: "noreferrer", target: "_blank" }
              : null)}
          >
            {link.label}
          </a>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Link
          className="rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-black hover:shadow-xl sm:text-[15px] sm:px-6"
          href="/workspace/new"
        >
          Get started
        </Link>
        <button
          aria-expanded={open}
          aria-label="Open menu"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/60 bg-white/60 text-ink backdrop-blur-md transition-colors hover:bg-white md:hidden"
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
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 h-full w-full animate-scrim-in bg-ink/35 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            tabIndex={-1}
          />
          <div
            aria-label="Menu"
            aria-modal="true"
            className="absolute inset-x-3 top-3 animate-sheet-in rounded-card border border-white/60 bg-cream p-5 shadow-2xl"
            role="dialog"
          >
            <div className="mb-5 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-tr-lg rounded-bl-lg bg-black" />
                <span className="text-xl font-bold tracking-tight text-slate-900">
                  Toluva
                </span>
              </span>
              <button
                aria-label="Close menu"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-ink"
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
            <div className="flex flex-col">
              {links.map((link) => (
                <a
                  className="border-b border-slate-200/70 py-3 text-[15px] font-medium text-slate-700 last:border-b-0 hover:text-black"
                  href={link.href}
                  key={link.href}
                  onClick={() => setOpen(false)}
                  {...(link.external
                    ? { rel: "noreferrer", target: "_blank" }
                    : null)}
                >
                  {link.label}
                </a>
              ))}
            </div>
            <Link
              className="mt-5 block rounded-full bg-ink px-6 py-3 text-center text-[15px] font-medium text-white"
              href="/workspace/new"
              onClick={() => setOpen(false)}
            >
              Get started
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
