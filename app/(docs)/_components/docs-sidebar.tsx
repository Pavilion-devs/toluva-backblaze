"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { docsNav } from "../../../lib/docs-nav";

export function DocsNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-7">
      {docsNav.map((group) => (
        <div key={group.title}>
          <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.slug;
              return (
                <li key={item.slug}>
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-lg px-3 py-1.5 text-[14px] transition-colors ${
                      active
                        ? "bg-ink font-medium text-white"
                        : "text-slate-600 hover:bg-cream hover:text-ink"
                    }`}
                    href={item.slug}
                    onClick={onNavigate}
                  >
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function DocsSidebar() {
  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-slate-200 px-4 py-8 lg:block">
      <DocsNavLinks />
    </aside>
  );
}

export default DocsSidebar;
