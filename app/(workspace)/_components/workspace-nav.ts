export type NavItem = { exact?: boolean; href: string; label: string };
export type NavGroup = { items: NavItem[]; label: string };

export const navGroups: NavGroup[] = [
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

export function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export function activeLabel(pathname: string) {
  if (pathname.startsWith("/workspace/runs/")) return "Run detail";
  const match = navGroups
    .flatMap((group) => group.items)
    .find((item) => isActive(pathname, item));
  return match?.label ?? "Workspace";
}
