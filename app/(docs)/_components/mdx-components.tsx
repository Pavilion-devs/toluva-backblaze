import Link from "next/link";
import type { AnchorHTMLAttributes, HTMLAttributes } from "react";
import { ArchitectureDiagram } from "./architecture-diagram";
import { Callout } from "./callout";
import { Card, CardGroup } from "./card";
import { CodeBlock } from "./code-block";
import { CodeGroup } from "./code-group";
import { Step, Steps } from "./steps";

/**
 * MDX component map.
 *
 * Deliberately a plain function, not a React context provider.
 * `@mdx-js/react` builds its provider on `createContext`, which does not exist
 * in the React Server Components runtime, so pointing `providerImportSource`
 * at it crashes the server build. MDX only requires the module to export
 * `useMDXComponents`; Next's own `mdx-components.tsx` convention works the
 * same way.
 *
 * Registered as `#mdx-components` via `providerImportSource` in vite.config.ts.
 */

const linkClass =
  "font-medium text-ink underline decoration-slate-400 underline-offset-2 transition-colors hover:decoration-ink";

export function useMDXComponents(components?: Record<string, unknown>) {
  return {
    a: ({ href = "", ...p }: AnchorHTMLAttributes<HTMLAnchorElement>) => {
      const internal = href.startsWith("/") || href.startsWith("#");
      return internal ? (
        <Link className={linkClass} href={href} {...p} />
      ) : (
        <a
          className={linkClass}
          href={href}
          rel="noreferrer"
          target="_blank"
          {...p}
        />
      );
    },
    blockquote: (p: HTMLAttributes<HTMLQuoteElement>) => (
      <blockquote
        className="my-5 border-l-2 border-slate-300 pl-4 italic text-slate-600"
        {...p}
      />
    ),
    code: ({ className, ...p }: HTMLAttributes<HTMLElement>) =>
      className?.includes("language-") ? (
        <code className={className} {...p} />
      ) : (
        <code
          className="rounded-md border border-slate-200 bg-cream px-1.5 py-0.5 font-mono text-[13px] text-ink"
          {...p}
        />
      ),
    h1: (p: HTMLAttributes<HTMLHeadingElement>) => (
      <h1
        className="scroll-mt-24 text-[30px] font-semibold tracking-tight text-ink md:text-[34px]"
        {...p}
      />
    ),
    h2: (p: HTMLAttributes<HTMLHeadingElement>) => (
      <h2
        className="mb-4 mt-12 scroll-mt-24 border-t border-slate-200 pt-8 text-[22px] font-semibold tracking-tight text-ink"
        {...p}
      />
    ),
    h3: (p: HTMLAttributes<HTMLHeadingElement>) => (
      <h3
        className="mb-3 mt-8 scroll-mt-24 text-lg font-semibold tracking-tight text-ink"
        {...p}
      />
    ),
    hr: (p: HTMLAttributes<HTMLHRElement>) => (
      <hr className="my-10 border-slate-200" {...p} />
    ),
    li: (p: HTMLAttributes<HTMLLIElement>) => (
      <li className="pl-1.5 [&>ol]:my-2 [&>p]:my-0 [&>ul]:my-2" {...p} />
    ),
    ol: (p: HTMLAttributes<HTMLOListElement>) => (
      <ol
        className="my-4 list-decimal space-y-2 pl-5 text-[15px] leading-7 text-slate-600 marker:text-slate-400"
        {...p}
      />
    ),
    p: (p: HTMLAttributes<HTMLParagraphElement>) => (
      <p className="my-4 text-[15px] leading-7 text-slate-600" {...p} />
    ),
    pre: (p: HTMLAttributes<HTMLPreElement>) => <CodeBlock {...p} />,
    strong: (p: HTMLAttributes<HTMLElement>) => (
      <strong className="font-semibold text-ink" {...p} />
    ),
    table: (p: HTMLAttributes<HTMLTableElement>) => (
      <div className="scroll-x my-6">
        <table className="w-full text-left text-sm" {...p} />
      </div>
    ),
    td: (p: HTMLAttributes<HTMLTableCellElement>) => (
      <td
        className="border-b border-slate-200 px-3 py-2 align-top text-slate-600"
        {...p}
      />
    ),
    th: (p: HTMLAttributes<HTMLTableCellElement>) => (
      <th className="px-3 py-2 font-semibold text-ink" {...p} />
    ),
    thead: (p: HTMLAttributes<HTMLTableSectionElement>) => (
      <thead className="border-b border-slate-300" {...p} />
    ),
    ul: (p: HTMLAttributes<HTMLUListElement>) => (
      <ul
        className="my-4 list-disc space-y-2 pl-5 text-[15px] leading-7 text-slate-600 marker:text-slate-400"
        {...p}
      />
    ),

    // Components available inside MDX:
    Eyebrow: (p: HTMLAttributes<HTMLParagraphElement>) => (
      <p
        className="mb-2 text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500"
        {...p}
      />
    ),
    Lede: (p: HTMLAttributes<HTMLDivElement>) => (
      <div
        className="mb-8 mt-3 text-[17px] leading-8 text-slate-500 [&>p]:m-0 [&>p]:text-[length:inherit] [&>p]:leading-[inherit] [&>p]:text-[color:inherit]"
        {...p}
      />
    ),
    ArchitectureDiagram,
    Callout,
    Card,
    CardGroup,
    CodeGroup,
    Step,
    Steps,
    ...components,
  };
}
