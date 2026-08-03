import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

type CalloutType = "note" | "tip" | "warning" | "danger";

const VARIANTS: Record<
  CalloutType,
  { icon: IconName; mark: string; ring: string; tint: string }
> = {
  danger: {
    icon: "shield",
    mark: "text-fit-red",
    ring: "border-fit-red/30",
    tint: "bg-fit-red-soft/60",
  },
  note: {
    icon: "info",
    mark: "text-slate-600",
    ring: "border-slate-300/70",
    tint: "bg-cream",
  },
  tip: {
    icon: "bulb",
    mark: "text-fit-green",
    ring: "border-fit-green/30",
    tint: "bg-fit-green-soft/60",
  },
  warning: {
    icon: "warning",
    mark: "text-fit-amber",
    ring: "border-fit-amber/30",
    tint: "bg-fit-amber-soft/60",
  },
};

export function Callout({
  children,
  title,
  type = "note",
}: {
  children: ReactNode;
  title?: string;
  type?: CalloutType;
}) {
  const v = VARIANTS[type];
  return (
    <div className={`my-6 flex gap-3 rounded-2xl border p-4 ${v.ring} ${v.tint}`}>
      <span className={`mt-0.5 shrink-0 ${v.mark}`}>
        <Icon className="h-[18px] w-[18px]" name={v.icon} />
      </span>
      <div className="min-w-0">
        {title && (
          <p className="m-0 text-[14px] font-bold text-ink">{title}</p>
        )}
        <div
          className={`text-[14px] leading-6 text-slate-600 [&>p]:my-0 [&>p+p]:mt-2 [&>ul]:my-2 ${
            title ? "mt-1" : ""
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default Callout;
