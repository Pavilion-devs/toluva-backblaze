/**
 * Inline icon set.
 *
 * The template this section is modelled on used `@iconify/react` with named
 * icons, which fetches icon data from the Iconify API at runtime. Every
 * third-party request was deliberately removed from this app and a test
 * asserts they stay gone, so the handful of glyphs actually used are inlined
 * here instead.
 */
export type IconName =
  | "search"
  | "copy"
  | "check"
  | "arrow-left"
  | "arrow-right"
  | "info"
  | "bulb"
  | "warning"
  | "shield"
  | "book"
  | "rocket"
  | "settings"
  | "waveform"
  | "clock"
  | "database"
  | "document"
  | "diagram"
  | "layers"
  | "users"
  | "gallery"
  | "menu"
  | "close";

const paths: Record<IconName, React.ReactNode> = {
  "arrow-left": <path d="M19 12H5m0 0 6-6m-6 6 6 6" />,
  "arrow-right": <path d="M5 12h14m0 0-6-6m6 6-6 6" />,
  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  close: <path d="M18 6 6 18M6 6l12 12" />,
  copy: (
    <>
      <rect height="13" rx="2" width="13" x="9" y="9" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14a9 3 0 0 0 18 0V5" />
      <path d="M3 12a9 3 0 0 0 18 0" />
    </>
  ),
  diagram: (
    <>
      <rect height="6" rx="1" width="7" x="3" y="3" />
      <rect height="6" rx="1" width="7" x="14" y="15" />
      <path d="M6.5 9v6a2 2 0 0 0 2 2H14" />
    </>
  ),
  document: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M9 15h6" />
    </>
  ),
  gallery: (
    <>
      <rect height="18" rx="2" width="18" x="3" y="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  layers: (
    <>
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
    </>
  ),
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  rocket: (
    <>
      <path d="M5 13c-1.5 1.5-2 5-2 5s3.5-.5 5-2" />
      <path d="M14.5 3.5C17 3 21 3 21 3s0 4-.5 6.5C19.5 15 15 18 11 19l-6-6c1-4 4-8.5 9.5-9.5Z" />
      <circle cx="15" cy="9" r="1.6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4Z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  users: (
    <>
      <path d="M14 19a6 6 0 0 0-12 0" />
      <circle cx="8" cy="9" r="4" />
      <path d="M22 19a6 6 0 0 0-6-6 4 4 0 1 0 0-8" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  waveform: <path d="M3 12h2l2-6 3 14 3-11 2 5h6" />,
};

export function Icon({
  className = "",
  name,
}: {
  className?: string;
  name: IconName;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {paths[name]}
    </svg>
  );
}
