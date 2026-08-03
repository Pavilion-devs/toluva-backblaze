"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type Heading = { id: string; level: number; text: string };

/** Builds the "On this page" rail from the rendered article headings. */
export function Toc() {
  const pathname = usePathname();
  const [items, setItems] = useState<Heading[]>([]);
  const [active, setActive] = useState("");

  useEffect(() => {
    let obs: IntersectionObserver | undefined;

    // Deferred to the next frame so the headings are laid out before they are
    // read, and so the scan is not a synchronous setState inside the effect.
    const frame = requestAnimationFrame(() => {
      const article = document.getElementById("doc-article");
      if (!article) return;
      const els = Array.from(
        article.querySelectorAll<HTMLElement>("h2, h3"),
      ).filter((e) => e.id);

      setItems(
        els.map((e) => ({
          id: e.id,
          level: e.tagName === "H3" ? 3 : 2,
          text: e.innerText,
        })),
      );

      obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting) setActive((en.target as HTMLElement).id);
          });
        },
        { rootMargin: "-80px 0px -70% 0px" },
      );
      els.forEach((e) => obs?.observe(e));
    });

    return () => {
      cancelAnimationFrame(frame);
      obs?.disconnect();
    };
    // Re-scan on navigation: the article subtree is replaced, not remounted.
  }, [pathname]);

  if (items.length === 0) return null;

  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-56 shrink-0 overflow-y-auto py-10 pr-6 xl:block">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
        On this page
      </p>
      <ul className="space-y-1.5">
        {items.map((h) => (
          <li className={h.level === 3 ? "ml-3" : ""} key={h.id}>
            <a
              className={`block border-l-2 pl-3 text-[13px] leading-snug transition-colors ${
                active === h.id
                  ? "border-ink font-medium text-ink"
                  : "border-transparent text-slate-500 hover:text-ink"
              }`}
              href={`#${h.id}`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default Toc;
