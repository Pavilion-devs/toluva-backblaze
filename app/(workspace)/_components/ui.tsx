import type { ReactNode } from "react";

/** Band colouring is semantic — see the drift thresholds in AGENTS.md. */
export const bandChip: Record<"green" | "amber" | "red", string> = {
  amber: "bg-fit-amber-soft border-fit-amber/25 text-fit-amber",
  green: "bg-fit-green-soft border-fit-green/25 text-fit-green",
  red: "bg-fit-red-soft border-fit-red/25 text-fit-red",
};

export const bandDot: Record<"green" | "amber" | "red", string> = {
  amber: "bg-fit-amber",
  green: "bg-fit-green",
  red: "bg-fit-red",
};

export function Panel({
  actions,
  children,
  className = "",
  eyebrow,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  eyebrow?: string;
  title?: string;
}) {
  return (
    <section
      className={`rounded-card border border-slate-200/70 bg-white shadow-sm ${className}`}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 md:px-8">
          <div>
            {eyebrow && <MetaLabel>{eyebrow}</MetaLabel>}
            {title && (
              <h2 className="font-display text-xl font-bold text-ink">
                {title}
              </h2>
            )}
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>
      )}
      <div className="px-6 py-6 md:px-8">{children}</div>
    </section>
  );
}

export function MetaLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
      {children}
    </span>
  );
}

export function PageHeader({
  actions,
  description,
  eyebrow,
  title,
}: {
  actions?: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6">
      <div className="max-w-2xl">
        <MetaLabel>{eyebrow}</MetaLabel>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-[40px] md:leading-[1.1]">
          {title}
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-slate-600">
          {description}
        </p>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-3">{actions}</div>
      )}
    </header>
  );
}

export function Hash({ value }: { value: string }) {
  return (
    <span
      className="font-mono text-[12px] text-slate-600 break-all"
      title={value}
    >
      {value}
    </span>
  );
}

export function StatusMark({
  status,
}: {
  status: "ready" | "pending" | "blocked";
}) {
  const style =
    status === "ready"
      ? bandChip.green
      : status === "blocked"
        ? bandChip.red
        : "bg-slate-100 border-slate-200 text-slate-500";
  const dot =
    status === "ready"
      ? bandDot.green
      : status === "blocked"
        ? bandDot.red
        : "bg-slate-400";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${style}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status === "ready" ? "Verified" : status === "pending" ? "Not run" : "Blocked"}
    </span>
  );
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  const style =
    tone === "neutral"
      ? "bg-slate-100 border-slate-200 text-slate-600"
      : bandChip[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${style}`}
    >
      {children}
    </span>
  );
}

export function buttonClass(
  variant: "primary" | "secondary" | "quiet" = "primary",
) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50";
  if (variant === "primary") {
    return `${base} bg-ink text-white shadow-lg hover:bg-black hover:shadow-xl hover:-translate-y-0.5 disabled:hover:translate-y-0 disabled:hover:shadow-lg`;
  }
  if (variant === "secondary") {
    return `${base} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
  }
  return `${base} text-slate-600 hover:text-ink`;
}

export function EmptyState({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-slate-200 bg-cream/60 px-8 py-14 text-center">
      <strong className="font-display text-lg text-ink">{title}</strong>
      <p className="max-w-md text-[14px] leading-relaxed text-slate-600">
        {description}
      </p>
      {action}
    </div>
  );
}
