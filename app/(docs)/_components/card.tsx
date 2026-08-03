import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

/**
 * Icon card. Becomes a link when `href` is given, a plain panel otherwise, so
 * the same component works for "go here next" grids and static feature grids.
 */
export function Card({
  children,
  href,
  icon,
  title,
}: {
  children?: ReactNode;
  href?: string;
  icon?: IconName;
  title: string;
}) {
  const inner = (
    <>
      {icon && (
        <span className="mb-3 grid h-9 w-9 place-items-center rounded-xl border border-slate-100 bg-cream text-slate-700">
          <Icon className="h-[18px] w-[18px]" name={icon} />
        </span>
      )}
      <p className="m-0 text-[15px] font-bold tracking-tight text-ink">
        {title}
      </p>
      {children && (
        <div className="mt-1.5 text-[13.5px] leading-6 text-slate-600 [&>p]:m-0">
          {children}
        </div>
      )}
    </>
  );

  const base =
    "flex flex-col rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm";

  if (!href) return <div className={base}>{inner}</div>;

  const internal = href.startsWith("/") || href.startsWith("#");
  const cls = `${base} transition-colors hover:border-slate-300 hover:bg-cream/60`;

  return internal ? (
    <Link className={cls} href={href}>
      {inner}
    </Link>
  ) : (
    <a className={cls} href={href} rel="noreferrer" target="_blank">
      {inner}
    </a>
  );
}

/** Responsive grid wrapper. `cols` is the desktop column count. */
export function CardGroup({
  children,
  cols = 2,
}: {
  children: ReactNode;
  cols?: 1 | 2 | 3;
}) {
  const grid =
    cols === 1
      ? "sm:grid-cols-1"
      : cols === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : "sm:grid-cols-2";
  return <div className={`my-6 grid grid-cols-1 gap-4 ${grid}`}>{children}</div>;
}

export default Card;
