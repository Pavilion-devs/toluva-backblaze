"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkspace } from "./workspace-data";

type NavItem = { exact?: boolean; href: string; label: string };
type NavGroup = { items: NavItem[]; label: string };

const groups: NavGroup[] = [
  {
    label: "Overview",
    items: [{ exact: true, href: "/workspace", label: "Example project" }],
  },
  {
    label: "Localize",
    items: [
      { href: "/workspace/new", label: "New localization" },
      { href: "/workspace/runs", label: "Runs" },
    ],
  },
  {
    label: "Editions",
    items: [{ href: "/workspace/editions", label: "Language editions" }],
  },
  {
    label: "Evidence",
    items: [
      { href: "/workspace/timing", label: "Timing QA" },
      { href: "/workspace/voice", label: "Voice authorization" },
      { href: "/workspace/assets", label: "B2 assets" },
      { href: "/workspace/provenance", label: "Provenance" },
    ],
  },
];

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export function WorkspaceSidebar() {
  const pathname = usePathname();
  const { run } = useWorkspace();

  return (
    <aside className="sky-backdrop sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col overflow-y-auto border-r border-white/50 px-5 py-6 lg:flex">
      <Link className="mb-8 flex items-center gap-2" href="/">
        <span className="h-6 w-6 rounded-tr-lg rounded-bl-lg bg-ink" />
        <span className="font-display text-xl font-bold tracking-tight text-ink">
          Toluva
        </span>
      </Link>

      <nav aria-label="Workspace" className="flex flex-col gap-6">
        {groups.map((group) => (
          <div key={group.label}>
            <span className="mb-2 block px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {group.label}
            </span>
            <div className="flex flex-col gap-1">
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={`rounded-full px-3 py-2 text-[14px] font-medium transition-colors ${
                      active
                        ? "bg-ink text-white shadow-sm"
                        : "text-slate-700 hover:bg-white/60 hover:text-ink"
                    }`}
                    href={item.href}
                    key={item.href}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto pt-8">
        <div className="rounded-2xl border border-white/60 bg-white/60 p-4 backdrop-blur-md">
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Example project
          </span>
          <strong className="block font-display text-[15px] leading-tight text-ink">
            {run.project.title}
          </strong>
          <small className="mt-1 block text-[12px] text-slate-600">
            English → German
          </small>
          <div className="mt-3 border-t border-slate-900/5 pt-3 text-[12px] font-medium text-slate-600">
            Completed reference run
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Horizontal fallback for viewports too narrow for the rail. */
export function WorkspaceMobileNav() {
  const pathname = usePathname();
  const items = groups.flatMap((group) => group.items);

  return (
    <nav
      aria-label="Workspace"
      className="sky-backdrop flex gap-2 overflow-x-auto border-b border-white/50 px-4 py-3 lg:hidden"
    >
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              active
                ? "bg-ink text-white"
                : "bg-white/60 text-slate-700 hover:text-ink"
            }`}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
