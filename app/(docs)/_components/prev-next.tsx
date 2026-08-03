"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { flatDocs } from "../../../lib/docs-nav";
import { Icon } from "./icon";

export function PrevNext() {
  const pathname = usePathname();
  const idx = flatDocs.findIndex((d) => d.slug === pathname);
  if (idx === -1) return null;
  const prev = idx > 0 ? flatDocs[idx - 1] : null;
  const next = idx < flatDocs.length - 1 ? flatDocs[idx + 1] : null;

  return (
    <nav className="mt-16 grid grid-cols-1 gap-4 border-t border-slate-200 pt-8 sm:grid-cols-2">
      <div>
        {prev && (
          <Link
            className="flex flex-col rounded-2xl border border-slate-200 p-4 transition-colors hover:border-slate-300 hover:bg-cream/60"
            href={prev.slug}
          >
            <span className="flex items-center gap-1 text-[12px] text-slate-400">
              <Icon className="h-3.5 w-3.5" name="arrow-left" /> Previous
            </span>
            <span className="mt-1 text-[14px] font-semibold text-ink">
              {prev.title}
            </span>
          </Link>
        )}
      </div>
      <div>
        {next && (
          <Link
            className="flex flex-col rounded-2xl border border-slate-200 p-4 text-right transition-colors hover:border-slate-300 hover:bg-cream/60 sm:items-end"
            href={next.slug}
          >
            <span className="flex items-center gap-1 text-[12px] text-slate-400">
              Next <Icon className="h-3.5 w-3.5" name="arrow-right" />
            </span>
            <span className="mt-1 text-[14px] font-semibold text-ink">
              {next.title}
            </span>
          </Link>
        )}
      </div>
    </nav>
  );
}

export default PrevNext;
