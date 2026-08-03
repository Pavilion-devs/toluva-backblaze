import type { ReactNode } from "react";

/** Band colouring is semantic because each colour represents a QA decision. */
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
  footer,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  eyebrow?: string;
  footer?: ReactNode;
  title?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-card border border-slate-200/70 bg-white shadow-sm ${className}`}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-slate-100 px-5 py-4 sm:px-6 sm:py-5 md:px-8">
          <div className="min-w-0">
            {eyebrow && <MetaLabel>{eyebrow}</MetaLabel>}
            {title && (
              <h2 className="text-lg font-bold leading-snug text-ink sm:text-xl">
                {title}
              </h2>
            )}
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>
      )}
      <div className="px-5 py-5 sm:px-6 sm:py-6 md:px-8">{children}</div>
      {footer && (
        <div className="border-t border-slate-100 bg-cream/50 px-5 py-4 sm:px-6 md:px-8">
          {footer}
        </div>
      )}
    </section>
  );
}

export function MetaLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1.5 block text-label font-bold uppercase tracking-[0.14em] text-slate-500">
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
    <header className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-6">
      <div className="max-w-2xl">
        <MetaLabel>{eyebrow}</MetaLabel>
        <h1 className="text-[26px] font-semibold leading-[1.15] tracking-tight text-ink sm:text-3xl md:text-[38px] md:leading-[1.1]">
          {title}
        </h1>
        <p className="mt-3 text-lead text-slate-600 md:mt-4">{description}</p>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {actions}
        </div>
      )}
    </header>
  );
}

export function Hash({ value }: { value: string }) {
  return (
    <span className="break-all font-mono text-caption text-slate-600" title={value}>
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-micro font-bold ${style}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status === "ready"
        ? "Verified"
        : status === "pending"
          ? "Not run"
          : "Blocked"}
    </span>
  );
}

export function Chip({
  children,
  pulse = false,
  tone = "neutral",
}: {
  children: ReactNode;
  pulse?: boolean;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  const style =
    tone === "neutral"
      ? "bg-slate-100 border-slate-200 text-slate-600"
      : bandChip[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-micro font-bold uppercase tracking-[0.08em] ${style}`}
    >
      {pulse && (
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-current" />
      )}
      {children}
    </span>
  );
}

/*
 * Applied to both <button> and <Link>. Hover is gated on `:not(:disabled)`
 * rather than `enabled:`, because `:enabled` only matches form controls and
 * would silently drop hover on every anchor CTA. Class strings are written out
 * in full — Tailwind scans source text, so an interpolated variant prefix
 * would generate no CSS at all.
 */
export function buttonClass(
  variant: "primary" | "secondary" | "quiet" | "danger" = "primary",
) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-[background-color,border-color,box-shadow,transform,color] duration-200 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none";
  if (variant === "primary") {
    return `${base} bg-ink text-white shadow-lg [&:not(:disabled)]:hover:bg-black [&:not(:disabled)]:hover:shadow-xl [&:not(:disabled)]:hover:-translate-y-0.5 active:translate-y-0`;
  }
  if (variant === "secondary") {
    return `${base} border border-slate-200 bg-white text-slate-700 [&:not(:disabled)]:hover:border-slate-300 [&:not(:disabled)]:hover:bg-slate-50 [&:not(:disabled)]:hover:text-ink`;
  }
  if (variant === "danger") {
    return `${base} border border-fit-red/25 bg-fit-red-soft text-fit-red [&:not(:disabled)]:hover:bg-fit-red [&:not(:disabled)]:hover:text-white`;
  }
  return `${base} text-slate-600 [&:not(:disabled)]:hover:text-ink`;
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
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-slate-200 bg-cream/60 px-6 py-12 text-center sm:px-8 sm:py-14">
      <strong className="text-lg font-bold text-ink">{title}</strong>
      <p className="max-w-md text-body text-slate-600">{description}</p>
      {action}
    </div>
  );
}

/**
 * Checkbox with a real hit target and a visible focus ring. The native control
 * stays in the tree for form semantics and keyboard behaviour; only the box is
 * drawn by us.
 */
export function Checkbox({
  checked,
  children,
  disabled = false,
  onChange,
}: {
  checked: boolean;
  children: ReactNode;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={`group flex items-start gap-3 rounded-2xl border p-3.5 transition-colors ${
        disabled
          ? "cursor-not-allowed border-slate-100 bg-slate-50/60 opacity-60"
          : checked
            ? "cursor-pointer border-ink/15 bg-cream"
            : "cursor-pointer border-slate-200 bg-white hover:border-slate-300 hover:bg-cream/50"
      }`}
    >
      <span className="relative mt-px flex h-5 w-5 shrink-0 items-center justify-center">
        <input
          checked={checked}
          className="peer absolute inset-0 h-full w-full cursor-[inherit] opacity-0"
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 items-center justify-center rounded-[7px] border-2 transition-all peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${
            checked
              ? "border-ink bg-ink text-white"
              : "border-slate-300 bg-white group-hover:border-slate-400"
          }`}
        >
          <svg
            className={`h-3 w-3 transition-opacity ${checked ? "opacity-100" : "opacity-0"}`}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3.2"
            viewBox="0 0 24 24"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
      </span>
      <span className="text-body text-slate-600">{children}</span>
    </label>
  );
}

export function ProgressBar({
  indeterminate = false,
  label,
  value = 0,
}: {
  indeterminate?: boolean;
  label?: string;
  value?: number;
}) {
  return (
    <div>
      {label && (
        <div className="mb-2 flex items-center justify-between gap-3 text-caption font-medium text-slate-600">
          <span>{label}</span>
          {!indeterminate && (
            <span className="font-mono">{Math.round(value)}%</span>
          )}
        </div>
      )}
      <div
        aria-label={label ?? "Progress"}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={indeterminate ? undefined : Math.round(value)}
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
      >
        {indeterminate ? (
          <span className="absolute inset-y-0 left-0 w-1/3 animate-indeterminate rounded-full bg-ink" />
        ) : (
          <span
            className="block h-full rounded-full bg-ink transition-[width] duration-500"
            style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
          />
        )}
      </div>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`animate-spin ${className}`}
      fill="none"
      height="16"
      viewBox="0 0 24 24"
      width="16"
    >
      <circle
        cx="12"
        cy="12"
        opacity="0.25"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}

/** Horizontally scrollable container for wide evidence tables. */
export function ScrollArea({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`scroll-x ${className}`}>{children}</div>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-lg bg-slate-200/70 ${className}`}
    />
  );
}

export function DataList({
  items,
}: {
  items: Array<[string, ReactNode]>;
}) {
  return (
    <dl className="flex flex-col divide-y divide-slate-100">
      {items.map(([term, value]) => (
        <div
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
          key={term}
        >
          <dt className="shrink-0 text-caption text-slate-500">{term}</dt>
          <dd className="text-right font-mono text-caption font-medium text-ink">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
