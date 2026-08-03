"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

type BlockProps = {
  children?: ReactElement<{ className?: string; title?: string }>;
  title?: string;
};

/**
 * Tabbed set of code blocks. Each child is one fenced block; its tab label
 * comes from the `title` set on the fence (```bash title="Shell"). Falls back
 * to the language, then to a positional label.
 */
export function CodeGroup({ children }: { children: ReactNode }) {
  const blocks = Children.toArray(children).filter(
    isValidElement,
  ) as ReactElement<BlockProps>[];
  const [active, setActive] = useState(0);

  if (blocks.length === 0) return null;

  const labelFor = (block: ReactElement<BlockProps>, i: number): string => {
    const codeChild = block.props?.children;
    // `title` lands on the inner <code>, because that is the element
    // mdast-util-to-hast applies fence hProperties to.
    const title = block.props?.title ?? codeChild?.props?.title;
    if (typeof title === "string" && title) return title;
    const cls = codeChild?.props?.className ?? "";
    const m = /language-([\w-]+)/.exec(cls);
    return m ? m[1] : `Option ${i + 1}`;
  };

  return (
    <div className="my-5 overflow-hidden rounded-2xl border border-slate-200/70">
      <div className="scroll-x flex gap-1 border-b border-slate-200/70 bg-cream px-2 py-1.5">
        {blocks.map((b, i) => (
          <button
            className={`shrink-0 rounded-lg px-3 py-1 text-[12.5px] font-semibold transition-colors ${
              i === active
                ? "bg-white text-ink shadow-sm"
                : "text-slate-500 hover:text-ink"
            }`}
            key={i}
            onClick={() => setActive(i)}
          >
            {labelFor(b, i)}
          </button>
        ))}
      </div>
      {/* Strip the child's own border/rounding so it sits flush inside the frame. */}
      <div className="[&>div]:my-0 [&>div]:rounded-none [&>div]:border-0 [&>div>div]:border-t-0">
        {cloneElement(blocks[active] as ReactElement<{ inGroup?: boolean }>, {
          inGroup: true,
        })}
      </div>
    </div>
  );
}

export default CodeGroup;
