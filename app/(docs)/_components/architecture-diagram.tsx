/*
 * Toluva architecture diagram.
 *
 * A structural port of the reference diagram: same 1644 x 1010 artboard, same
 * region geometry (header, spine, left rail, storage window with four panels,
 * right rail with chevrons and outcome cards, bottom callouts, capability
 * strip, legend, pinned node badges), with Toluva's topology as the content.
 *
 * Authored inline rather than as a static `.svg` so it uses the self-hosted
 * font stack and reads the same theme tokens as the rest of the app. A file
 * loaded through <object> would need its own webfont import — a third-party
 * request this app does not make.
 */

const INK = "#1a1a1a";
const COBALT = "#2166a5";
const COBALT_SOFT = "#e9f1fa";
const COBALT_LINE = "#cddef0";
const SKY = "#17809b";
const SKY_SOFT = "#e6f4f7";
const SKY_LINE = "#b3dce6";
const SLATE = "#475569";
const SLATE_SOFT = "#f7f9fc";
const SLATE_LINE = "#cdd6e3";
const MUTED = "#94a3b8";
const FAINT = "#b8c2cf";
const HAIR = "#eef2f7";

/*
 * The drift bands are semantic product states, so they track the theme tokens.
 * The blues above are diagram-local structure and stay literal, which is what
 * keeps the layout reading the way it should.
 */
const GREEN = "var(--color-fit-green, #0f7a52)";
const AMBER = "var(--color-fit-amber, #9a5b09)";
const RED = "var(--color-fit-red, #b8362b)";

/* ── spine layout ──────────────────────────────────────────────────────────
 * Six stages instead of the reference's five, so positions are computed
 * rather than hardcoded. Widths are estimated from character count at the
 * label size; the group is then centred on the storage window.
 */
const STAGES = [
  "Ingest",
  "Transcribe",
  "Translate",
  "Authorize",
  "Time-fit QA",
  "Master",
];

const LABEL_OFFSET = 14;
const CHAR_W = 6.6;
const GAP = 20;
const R = 9;

function spineLayout() {
  const items: Array<{ cx: number; label: string; width: number }> = [];
  let cursor = 0;
  for (const label of STAGES) {
    const width = label.length * CHAR_W;
    items.push({ cx: cursor, label, width });
    cursor = cursor + LABEL_OFFSET + width + GAP + R;
  }
  // Span runs from the first circle's left edge to the last label's right edge.
  const last = items[items.length - 1];
  const span = last.cx + LABEL_OFFSET + last.width + R;
  const originX = 673 - span / 2 + R;
  return items.map((item) => ({ ...item, cx: item.cx + originX }));
}

const spine = spineLayout();

/* ── content ─────────────────────────────────────────────────────────────── */

const leftCards = [
  {
    accent: COBALT,
    body: ["Bring one approved clip and", "confirm rights up front."],
    border: COBALT_LINE,
    chipBorder: COBALT_LINE,
    chipFill: "#ffffff",
    chips: [
      { icon: "tv-ic-film", text: "1–30s MP4 · ≤ 8 MB" },
      { icon: "tv-ic-shield", text: "rights + disclosure" },
    ],
    eyebrow: "UPLOADERS",
    fill: "#f7fbff",
    height: 176,
    icon: "tv-ic-people",
    iconFill: COBALT_SOFT,
    y: 192,
  },
  {
    accent: SKY,
    body: ["Approve exact wording before", "another billable call."],
    border: SKY_LINE,
    chipBorder: "#a5d4e6",
    chipFill: SKY_SOFT,
    chips: [{ icon: "tv-ic-check-shield", text: "hash-bound revision" }],
    eyebrow: "REVIEWERS",
    fill: "#f3fcff",
    height: 140,
    icon: "tv-ic-pin",
    iconFill: "#d5eef4",
    y: 386,
  },
  {
    accent: SLATE,
    body: ["Run the worker and hold the", "provider budget."],
    border: SLATE_LINE,
    chipBorder: SLATE_LINE,
    chipFill: "#ffffff",
    chips: [
      { icon: "tv-ic-bolt", text: "toluva-worker.service" },
      { icon: "tv-ic-grid", text: "ENABLE_LIVE_INTAKE" },
    ],
    eyebrow: "OPERATORS",
    fill: SLATE_SOFT,
    height: 176,
    icon: "tv-ic-cpu",
    iconFill: "#e2e8f0",
    y: 536,
  },
];

const railArrows = [
  { label: "Source path", labelY: 272, y: 280 },
  { label: "Approval path", labelY: 444, y: 452 },
  { label: "Control path", labelY: 616, y: 624 },
];

const rightCards = [
  {
    border: SKY_LINE,
    height: 186,
    icon: "tv-ic-layers",
    iconColor: SKY,
    iconFill: "#d5eef4",
    rows: [
      { icon: "tv-ic-waveform", text: "faster-whisper base.en" },
      { icon: "tv-ic-globe", text: "argos translate en_de 1.3" },
      { icon: "tv-ic-mic", text: "eleven_flash_v2_5 stock" },
      { icon: "tv-ic-layers", text: "ffmpeg segment audio fan-in" },
      { icon: "tv-ic-film", text: "ffmpeg captioned mp4" },
    ],
    subtitle: "transcription · translation · speech",
    title: "Providers",
    y: 182,
  },
  {
    border: COBALT_LINE,
    height: 170,
    icon: "tv-ic-target",
    iconColor: COBALT,
    iconFill: COBALT_SOFT,
    rows: [
      { icon: "tv-ic-doc", text: "transcript confidence" },
      { icon: "tv-ic-gauge", text: "drift bands · green/amber/red" },
      { icon: "tv-ic-pin", text: "protected term preservation" },
      { icon: "tv-ic-shield", text: "authorization scope" },
    ],
    subtitle: "measured, then enforced",
    title: "Quality gates",
    y: 386,
  },
  {
    border: SLATE_LINE,
    height: 160,
    icon: "tv-ic-bolt",
    iconColor: SLATE,
    iconFill: "#e2e8f0",
    rows: [
      { icon: "tv-ic-cpu", text: "one replica claims a job" },
      { icon: "tv-ic-gauge", text: "4 TTS calls · 400 chars" },
      { icon: "tv-ic-clock", text: "3 admission slots / UTC day" },
      { icon: "tv-ic-list", text: "resumes from checkpoints" },
    ],
    subtitle: "one replica, bounded spend",
    title: "Worker",
    y: 574,
  },
];

const chevrons = [
  { color: SKY, label: "Generated media", labelY: 238, y: 258 },
  { color: COBALT, label: "Measured findings", labelY: 434, y: 454 },
  { color: SLATE, label: "Claim → spend", labelY: 617, y: 637 },
];

const outcomes = [
  {
    arrowY: 275,
    icon: "tv-ic-film",
    iconColor: SKY,
    lines: ["German", "edition"],
    y: 238,
  },
  {
    arrowY: 471,
    icon: "tv-ic-doc",
    iconColor: COBALT,
    lines: ["Caption", "sidecar"],
    y: 434,
  },
  {
    arrowY: 654,
    icon: "tv-ic-link",
    iconColor: SLATE,
    lines: ["Correction", "archive"],
    y: 617,
  },
];

const callouts = [
  {
    body: ["Every stage writes to B2", "before the next one runs."],
    icon: "tv-ic-db",
    iconColor: COBALT,
    iconFill: COBALT_SOFT,
    title: "Storage is the record",
    x: 380,
  },
  {
    body: ["A red segment blocks the", "next billable call."],
    icon: "tv-ic-link",
    iconColor: SKY,
    iconFill: SKY_SOFT,
    title: "Correction is bounded",
    x: 586,
  },
  {
    body: ["Lineage and integrity, not", "legal compliance."],
    icon: "tv-ic-radar",
    iconColor: SLATE,
    iconFill: SLATE_SOFT,
    title: "Claims stay narrow",
    x: 792,
  },
];

const capabilities: Array<{
  accent: string;
  fill: string;
  icon: string;
  lines: [string, string];
}> = [
  { accent: COBALT, fill: COBALT_SOFT, icon: "tv-ic-film", lines: ["Source", "intake"] },
  { accent: COBALT, fill: COBALT_SOFT, icon: "tv-ic-shield", lines: ["Rights", "confirmation"] },
  { accent: COBALT, fill: COBALT_SOFT, icon: "tv-ic-waveform", lines: ["Segment", "transcription"] },
  { accent: COBALT, fill: COBALT_SOFT, icon: "tv-ic-pin", lines: ["Protected", "terms"] },
  { accent: COBALT, fill: COBALT_SOFT, icon: "tv-ic-target", lines: ["Authorization", "gate"] },
  { accent: COBALT, fill: COBALT_SOFT, icon: "tv-ic-gauge", lines: ["Drift", "measurement"] },
  { accent: COBALT, fill: COBALT_SOFT, icon: "tv-ic-clock", lines: ["Bounded", "retries"] },
  { accent: COBALT, fill: COBALT_SOFT, icon: "tv-ic-layers", lines: ["Silence", "padding"] },
  { accent: SKY, fill: SKY_SOFT, icon: "tv-ic-radar", lines: ["Tempo", "fit"] },
  { accent: SKY, fill: SKY_SOFT, icon: "tv-ic-doc", lines: ["Caption", "sidecar"] },
  { accent: SKY, fill: SKY_SOFT, icon: "tv-ic-link", lines: ["Hash", "verification"] },
];

/** Node badges pin each spine stage to the region where its evidence lands. */
const nodeBadges = [
  { cx: 44, cy: 196, n: 1 },
  { cx: 398, cy: 226, n: 2 },
  { cx: 688, cy: 226, n: 3 },
  { cx: 688, cy: 438, n: 4 },
  { cx: 398, cy: 438, n: 5 },
  { cx: 792, cy: 678, n: 6 },
];

export function ArchitectureDiagram({
  className = "",
  framed = false,
}: {
  className?: string;
  /** Wrap in a light card (useful when placed on a tinted background). */
  framed?: boolean;
}) {
  return (
    <div
      className={[
        "w-full overflow-hidden",
        framed ? "rounded-2xl border border-slate-200 bg-white shadow-xl" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <svg
        className="block h-auto w-full"
        role="img"
        style={{ fontFamily: "var(--font-sans)" }}
        viewBox="0 0 1644 1010"
        xmlns="http://www.w3.org/2000/svg"
      >
        <desc>
          Toluva architecture. Uploaders, reviewers and operators on the left;
          Backblaze B2 in the centre holding source lineage, manifests, the
          timing verdict and the authorization record; providers, quality gates
          and the worker on the right. A six-stage spine runs across the top:
          ingest, transcribe, translate, authorize, time-fit QA, master.
        </desc>

        <defs>
          <linearGradient id="tv-bg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#f7f6f2" />
          </linearGradient>
          <pattern height="34" id="tv-grid" patternUnits="userSpaceOnUse" width="34">
            <path d="M34 0 H0 V34" fill="none" stroke="#ecefe9" strokeWidth="1" />
          </pattern>
          <filter height="200%" id="tv-blur" width="200%" x="-50%" y="-50%">
            <feGaussianBlur stdDeviation="46" />
          </filter>
          <filter height="160%" id="tv-soft" width="160%" x="-30%" y="-30%">
            <feDropShadow dy="7" floodColor="#1e293b" floodOpacity="0.10" stdDeviation="13" />
          </filter>
          <filter height="180%" id="tv-softsm" width="180%" x="-40%" y="-40%">
            <feDropShadow dy="3" floodColor="#1e293b" floodOpacity="0.08" stdDeviation="6" />
          </filter>

          <marker id="tv-arr-slate" markerHeight="9" markerWidth="9" orient="auto" refX="6.5" refY="3">
            <path d="M0 0 L6.5 3 L0 6 Z" fill={SLATE} />
          </marker>
          <marker id="tv-arr-gray" markerHeight="8" markerWidth="8" orient="auto" refX="6" refY="3">
            <path d="M0 0 L6 3 L0 6 Z" fill="#cbd5e1" />
          </marker>
          <marker id="tv-arr-sky" markerHeight="8" markerWidth="8" orient="auto" refX="6" refY="3">
            <path d="M0 0 L6 3 L0 6 Z" fill={SKY} />
          </marker>
          <marker id="tv-arr-green" markerHeight="8" markerWidth="8" orient="auto" refX="6" refY="3">
            <path d="M0 0 L6 3 L0 6 Z" fill={GREEN} />
          </marker>

          {/* Toluva mark: an aperture with the localized track passing through. */}
          <symbol id="tv-logo-mark" viewBox="0 0 122 122">
            <rect fill="#141920" height="122" rx="28" width="122" x="0" y="0" />
            <rect
              fill="none"
              height="52"
              rx="14"
              stroke="#ffffff"
              strokeWidth="9"
              width="52"
              x="35"
              y="35"
            />
          </symbol>

          {/* micro icon library (24x24, stroke inherits currentColor) */}
          <symbol fill="none" id="tv-ic-people" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="9" cy="8" r="3" />
            <path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" />
            <circle cx="17.5" cy="8" r="2.4" />
            <path d="M15.5 15c3 0 5 1.7 5 5" />
          </symbol>
          <symbol fill="none" id="tv-ic-shield" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M12 3l7 3v5c0 5-3.5 7-7 8-3.5-1-7-3-7-8V6z" />
          </symbol>
          <symbol fill="none" id="tv-ic-check-shield" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M12 3l7 3v5c0 5-3.5 7-7 8-3.5-1-7-3-7-8V6z" />
            <path d="M9 12l2 2 4-4" />
          </symbol>
          <symbol fill="none" id="tv-ic-db" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <ellipse cx="12" cy="6" rx="7" ry="3" />
            <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
            <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
          </symbol>
          <symbol fill="none" id="tv-ic-cpu" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <rect height="12" rx="2" width="12" x="6" y="6" />
            <rect height="4" width="4" x="10" y="10" />
            <path d="M10 3v3M14 3v3M10 18v3M14 18v3M3 10h3M3 14h3M18 10h3M18 14h3" />
          </symbol>
          <symbol fill="none" id="tv-ic-bolt" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M13 3 4 14h6l-1 7 9-11h-6z" />
          </symbol>
          <symbol fill="none" id="tv-ic-grid" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <rect height="7" rx="1.5" width="7" x="4" y="4" />
            <rect height="7" rx="1.5" width="7" x="13" y="4" />
            <rect height="7" rx="1.5" width="7" x="4" y="13" />
            <rect height="7" rx="1.5" width="7" x="13" y="13" />
          </symbol>
          <symbol fill="none" id="tv-ic-layers" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M12 3l9 5-9 5-9-5z" />
            <path d="M3 13l9 5 9-5" />
          </symbol>
          <symbol fill="none" id="tv-ic-target" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8" />
            <circle cx="12" cy="12" r="4.3" />
            <circle cx="12" cy="12" fill="currentColor" r="1.3" stroke="none" />
          </symbol>
          <symbol fill="none" id="tv-ic-globe" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8" />
            <path d="M4 12h16M12 4c3 4 3 12 0 16M12 4c-3 4-3 12 0 16" />
          </symbol>
          <symbol fill="none" id="tv-ic-pin" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z" />
            <circle cx="12" cy="10" r="2.5" />
          </symbol>
          <symbol fill="none" id="tv-ic-radar" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8" />
            <circle cx="12" cy="12" r="3.6" />
            <path d="M12 12l6-6" />
          </symbol>
          <symbol fill="none" id="tv-ic-link" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M9 15l6-6" />
            <path d="M10.5 6l1-1a4 4 0 0 1 6 6l-1 1" />
            <path d="M13.5 18l-1 1a4 4 0 0 1-6-6l1-1" />
          </symbol>
          <symbol fill="none" id="tv-ic-list" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M4 6h12M4 12h12M4 18h7" />
          </symbol>
          <symbol fill="none" id="tv-ic-clock" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v4l3 2" />
          </symbol>
          <symbol fill="none" id="tv-ic-gauge" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M5 18a7 7 0 1 1 14 0" />
            <path d="M12 18l4-4" />
          </symbol>
          <symbol fill="none" id="tv-ic-doc" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M7 3h7l5 5v13H7z" />
            <path d="M14 3v5h5" />
            <path d="M10 13h6M10 17h6" />
          </symbol>
          <symbol fill="none" id="tv-ic-film" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <rect height="16" rx="2" width="18" x="3" y="4" />
            <path d="M7 4v16M17 4v16M3 12h18" />
          </symbol>
          <symbol fill="none" id="tv-ic-waveform" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M3 12h2.5l2.5-7 3.5 15 3-11 2 3h4.5" />
          </symbol>
          <symbol fill="none" id="tv-ic-mic" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <rect height="12" rx="3.2" width="6.4" x="8.8" y="2.6" />
            <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.4" />
          </symbol>
        </defs>

        {/* ===================== BACKGROUND ===================== */}
        <rect fill="url(#tv-bg)" height="1010" width="1644" x="0" y="0" />
        <rect fill="url(#tv-grid)" height="1010" opacity="0.75" width="1644" x="0" y="0" />
        <g opacity="0.9">
          <ellipse cx="380" cy="980" fill="#dbe9f6" filter="url(#tv-blur)" opacity="0.42" rx="420" ry="150" />
          <ellipse cx="1300" cy="1000" fill="#e2f1f5" filter="url(#tv-blur)" opacity="0.38" rx="470" ry="160" />
          <ellipse cx="800" cy="1030" fill="#efe8dc" filter="url(#tv-blur)" opacity="0.34" rx="340" ry="120" />
        </g>

        {/* ===================== HEADER ===================== */}
        <use height="44" href="#tv-logo-mark" width="44" x="48" y="40" />
        <text fill={INK} fontSize="40" fontWeight="800" letterSpacing="-1" x="104" y="68">
          Toluva
        </text>
        <text fill="#64748b" fontSize="15" fontWeight="600" x="106" y="92">
          Governed video localization on Backblaze B2
        </text>
        <text fill={MUTED} fontSize="13.5" fontWeight="500" x="48" y="132">
          Approved at intake.&#160;&#160;Measured at every segment.&#160;&#160;Verifiable at rest.
        </text>

        {/* Backblaze partner lockup, far right of header */}
        <rect fill={INK} height="40" rx="11" width="40" x="1448" y="44" />
        <text fill="#ffffff" fontSize="16" fontWeight="800" textAnchor="middle" x="1468" y="70">
          B2
        </text>
        <text fill={INK} fontSize="24" fontWeight="800" letterSpacing="-0.6" x="1498" y="69">
          Backblaze
        </text>
        <text fill={MUTED} fontSize="10" fontWeight="600" textAnchor="end" x="1604" y="85">
          system of record
        </text>

        {/* ===================== LEFT RAIL ===================== */}
        {leftCards.map((card) => (
          <g key={card.eyebrow}>
            <g filter="url(#tv-softsm)">
              <rect
                fill={card.fill}
                height={card.height}
                rx="16"
                stroke={card.border}
                width="218"
                x="40"
                y={card.y}
              />
            </g>
            <rect fill={card.iconFill} height="34" rx="9" width="34" x="58" y={card.y + 14} />
            <use color={card.accent} height="22" href={`#${card.icon}`} width="22" x="64" y={card.y + 20} />
            <text
              fill={card.accent}
              fontSize="12.5"
              fontWeight="700"
              letterSpacing="1.2"
              x="100"
              y={card.y + 34}
            >
              {card.eyebrow}
            </text>
            {card.body.map((line, i) => (
              <text fill={SLATE} fontSize="12.5" fontWeight="500" key={line} x="60" y={card.y + 70 + i * 18}>
                {line}
              </text>
            ))}
            {card.chips.map((chip, i) => (
              <g key={chip.text}>
                <rect
                  fill={card.chipFill}
                  height="30"
                  rx="8"
                  stroke={card.chipBorder}
                  width="184"
                  x="58"
                  y={card.y + 100 + i * 36}
                />
                <use
                  color={card.accent}
                  height="15"
                  href={`#${chip.icon}`}
                  width="15"
                  x="68"
                  y={card.y + 107 + i * 36}
                />
                <text
                  className="tv-mono"
                  fill={card.accent}
                  fontSize="10.5"
                  fontWeight="600"
                  x="90"
                  y={card.y + 119 + i * 36}
                >
                  {chip.text}
                </text>
              </g>
            ))}
          </g>
        ))}

        {/* left rail arrows into the storage window */}
        {railArrows.map((arrow) => (
          <g key={arrow.label}>
            <text fill={SLATE} fontSize="10.5" fontWeight="600" textAnchor="middle" x="316" y={arrow.labelY}>
              {arrow.label}
            </text>
            <path
              d={`M260 ${arrow.y} H372`}
              fill="none"
              markerEnd="url(#tv-arr-slate)"
              stroke={SLATE}
              strokeWidth="1.8"
            />
          </g>
        ))}

        {/* ===================== CENTRE: BACKBLAZE B2 ===================== */}
        <g filter="url(#tv-soft)">
          <rect fill="#ffffff" height="474" rx="16" stroke="#e2e8f0" width="600" x="380" y="176" />
        </g>
        {/* chrome bar */}
        <path d="M380 192 a16 16 0 0 1 16 -16 h568 a16 16 0 0 1 16 16 v22 H380 Z" fill="#f8fafc" />
        <line stroke={HAIR} x1="380" x2="980" y1="214" y2="214" />
        <circle cx="402" cy="195" fill="#ff5f57" r="5" />
        <circle cx="420" cy="195" fill="#febc2e" r="5" />
        <circle cx="438" cy="195" fill="#28c840" r="5" />
        <rect fill="#ffffff" height="22" rx="11" stroke="#e8edf3" width="430" x="476" y="184" />
        <path d="M490 199 v-4 a3 3 0 0 1 6 0 v4 Z M488 199 h10 v5 h-10 Z" fill={MUTED} />
        <text fill="#64748b" fontSize="11" fontWeight="500" x="505" y="199">
          b2://toluva/intake-57f5ca73/localize-c33715df
        </text>
        <path d="M872 190 h14 M872 195 h14 M872 200 h14" stroke="#cbd5e1" strokeLinecap="round" strokeWidth="1.6" />

        {/* Panel TL: source lineage */}
        <rect fill="#ffffff" height="200" rx="10" stroke={HAIR} width="274" x="398" y="226" />
        <text fill="#1e293b" fontSize="13" fontWeight="700" x="414" y="252">
          Source lineage
        </text>
        <text fill={MUTED} fontSize="10.5" fontWeight="500" x="414" y="269">
          append-only job records
        </text>
        <rect fill={COBALT_SOFT} height="19" rx="6" stroke={COBALT_LINE} width="150" x="414" y="280" />
        <use color={COBALT} height="13" href="#tv-ic-film" width="13" x="419" y="283" />
        <text className="tv-mono" fill={COBALT} fontSize="9.5" fontWeight="600" x="436" y="293">
          source-1cf1052f….mp4
        </text>
        {[
          { c: COBALT, w: 214, y: 318 },
          { c: "#cbd5e1", w: 178, y: 336 },
          { c: "#cbd5e1", w: 200, y: 354 },
          { c: GREEN, w: 150, y: 372 },
        ].map((row) => (
          <g key={row.y}>
            <circle cx="418" cy={row.y} fill={row.c} r="3" />
            <rect fill={HAIR} height="7" rx="3.5" width={row.w} x="428" y={row.y - 3.5} />
          </g>
        ))}
        <rect fill="#eefaf3" height="20" rx="6" stroke="#bfe3d2" width="176" x="414" y="386" />
        <path d="M424 396 l3 3 5.5-6" fill="none" stroke={GREEN} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <text fill={GREEN} fontSize="9.5" fontWeight="600" x="440" y="400">
          60 job-scoped objects written
        </text>
        <text fill={FAINT} fontSize="9.5" fontWeight="500" x="414" y="419">
          job_id · project_id on every record
        </text>

        {/* Panel TR: manifests */}
        <rect fill="#ffffff" height="200" rx="10" stroke={HAIR} width="274" x="688" y="226" />
        <text fill="#1e293b" fontSize="13" fontWeight="700" x="704" y="252">
          Manifests &amp; lineage
        </text>
        <text fill={MUTED} fontSize="10.5" fontWeight="500" x="704" y="269">
          Genblaze runs · canonical hashes
        </text>
        <rect fill="#f8fafc" height="68" rx="8" stroke={HAIR} width="242" x="704" y="278" />
        <text className="tv-mono" fontSize="10.5" x="716" y="298">
          <tspan fill={COBALT}>run.provider</tspan>
          <tspan fill="#64748b">=elevenlabs-tts</tspan>
        </text>
        <text className="tv-mono" fontSize="10.5" x="716" y="316">
          <tspan fill={SKY}>run.model</tspan>
          <tspan fill="#64748b">=eleven_flash_v2_5</tspan>
        </text>
        <text className="tv-mono" fontSize="10.5" x="716" y="334">
          <tspan fill={MUTED}>parent_</tspan>
          <tspan fill={SKY}>run_id</tspan>
          <tspan fill="#64748b">=a9cc6c70…</tspan>
        </text>
        <path d="M706 362 l3 3 5-6" fill="none" stroke={GREEN} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <text fill="#334155" fontSize="10.5" fontWeight="600" x="720" y="366">
          9 / 9 canonical manifests valid
        </text>
        <path d="M707 380 l6 6 M713 380 l-6 6" fill="none" stroke="#cbd5e1" strokeLinecap="round" strokeWidth="2" />
        <text fill={MUTED} fontSize="10.5" fontWeight="500" x="720" y="389">
          no unverified stored bytes
        </text>
        <text fill={FAINT} fontSize="9.5" fontWeight="500" x="704" y="416">
          hash re-checked before display
        </text>

        {/* Panel BL: timing verdict */}
        <rect fill="#ffffff" height="198" rx="10" stroke={HAIR} width="274" x="398" y="438" />
        <text fill="#1e293b" fontSize="13" fontWeight="700" x="414" y="464">
          Timing verdict
        </text>
        <rect fill="#fdeeec" height="20" rx="6" stroke="#f3ccc7" width="124" x="414" y="474" />
        <text fill={RED} fontSize="10" fontWeight="700" textAnchor="middle" x="476" y="488">
          SEGMENT DRIFT
        </text>
        <rect fill="#eefaf3" height="20" rx="6" stroke="#bfe3d2" width="60" x="544" y="474" />
        <text fill={GREEN} fontSize="10" fontWeight="700" textAnchor="middle" x="574" y="488">
          FIXED
        </text>
        <text fill="#64748b" fontSize="10" fontWeight="600" x="414" y="516">
          attempt timeline
        </text>
        <line stroke="#dbe3ee" strokeWidth="2" x1="418" x2="540" y1="538" y2="538" />
        <circle cx="420" cy="538" fill={RED} r="4" />
        <circle cx="460" cy="538" fill={AMBER} r="4" />
        <circle cx="500" cy="538" fill={GREEN} r="4" />
        <circle cx="538" cy="538" fill={GREEN} r="4" />
        <rect fill="#f1f5f9" height="18" rx="5" width="132" x="414" y="556" />
        <text className="tv-mono" fill={SLATE} fontSize="9.5" fontWeight="600" x="423" y="568">
          8.127s → 3.576s
        </text>
        <rect fill="#f1f5f9" height="18" rx="5" width="88" x="414" y="580" />
        <text className="tv-mono" fill={SLATE} fontSize="9.5" fontWeight="600" x="423" y="592">
          3.800s slot
        </text>
        <text fill={FAINT} fontSize="9.5" fontWeight="500" x="414" y="620">
          approved by a human, not guessed
        </text>
        {/* drift donut */}
        <circle cx="616" cy="540" fill="none" r="30" stroke={HAIR} strokeWidth="8" />
        <circle
          cx="616"
          cy="540"
          fill="none"
          r="30"
          stroke={GREEN}
          strokeDasharray="166 188"
          strokeLinecap="round"
          strokeWidth="8"
          transform="rotate(-90 616 540)"
        />
        <text fill={INK} fontSize="17" fontWeight="800" textAnchor="middle" x="616" y="545">
          −5.9%
        </text>
        <text fill={MUTED} fontSize="9.5" fontWeight="600" textAnchor="middle" x="616" y="588">
          drift vs slot
        </text>

        {/* Panel BR: authorization */}
        <rect fill="#ffffff" height="198" rx="10" stroke={HAIR} width="274" x="688" y="438" />
        <text fill="#1e293b" fontSize="13" fontWeight="700" x="704" y="464">
          Authorization record
        </text>
        <text fill={MUTED} fontSize="10.5" fontWeight="500" x="704" y="481">
          evaluated before any provider call
        </text>
        <use color={SLATE} height="16" href="#tv-ic-globe" width="16" x="704" y="497" />
        <text fill="#334155" fontSize="11.5" fontWeight="600" x="726" y="509">
          Language in scope
        </text>
        <rect fill="#eefaf3" height="18" rx="9" stroke="#bfe3d2" width="62" x="884" y="498" />
        <text fill={GREEN} fontSize="9.5" fontWeight="700" textAnchor="middle" x="915" y="511">
          allowed
        </text>
        <use color={SLATE} height="16" href="#tv-ic-check-shield" width="16" x="704" y="525" />
        <text fill="#334155" fontSize="11.5" fontWeight="600" x="726" y="537">
          Evidence hash
        </text>
        <path d="M920 533 l4 4 8-8" fill="none" stroke={GREEN} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
        <use color={SLATE} height="16" href="#tv-ic-target" width="16" x="704" y="553" />
        <text fill="#334155" fontSize="11.5" fontWeight="600" x="726" y="565">
          Outside scope
        </text>
        <rect fill="#fdeeec" height="18" rx="9" stroke="#f3ccc7" width="62" x="884" y="554" />
        <text fill={RED} fontSize="9.5" fontWeight="700" textAnchor="middle" x="915" y="567">
          blocked
        </text>
        <rect fill="#fdf7ee" height="26" rx="7" stroke="#f0e0c4" width="242" x="704" y="586" />
        <circle cx="720" cy="599" fill={AMBER} r="4" />
        <text fill={AMBER} fontSize="11" fontWeight="700" x="734" y="603">
          origin = policy
        </text>
        <text fill="#a98246" fontSize="10" fontWeight="500" x="836" y="603">
          no provider was called
        </text>

        {/* dashed arrows down to bottom callouts */}
        {[474, 680, 886].map((x) => (
          <path
            d={`M${x} 652 V676`}
            fill="none"
            key={x}
            markerEnd="url(#tv-arr-gray)"
            stroke="#cbd5e1"
            strokeDasharray="3 4"
            strokeWidth="1.6"
          />
        ))}

        {/* ===================== RIGHT RAIL ===================== */}
        <g transform="translate(22,0)">
          {chevrons.map((chev) => (
            <g key={chev.label}>
              <text fill={chev.color} fontSize="10.5" fontWeight="600" textAnchor="middle" x="1023" y={chev.labelY}>
                {chev.label}
              </text>
              <path
                d={`M1000 ${chev.y} L1018 ${chev.y + 17} L1000 ${chev.y + 34} L1010 ${chev.y + 34} L1028 ${chev.y + 17} L1010 ${chev.y} Z`}
                fill={chev.color}
                strokeLinejoin="round"
              />
            </g>
          ))}
        </g>

        <g transform="translate(56,0)">
          {rightCards.map((card) => (
            <g key={card.title}>
              <g filter="url(#tv-softsm)">
                <rect
                  fill="#ffffff"
                  height={card.height}
                  rx="14"
                  stroke={card.border}
                  width="300"
                  x="1066"
                  y={card.y}
                />
              </g>
              <rect fill={card.iconFill} height="34" rx="9" width="34" x="1086" y={card.y + 16} />
              <use color={card.iconColor} height="22" href={`#${card.icon}`} width="22" x="1092" y={card.y + 22} />
              <text fill="#1e293b" fontSize="15" fontWeight="700" x="1130" y={card.y + 32}>
                {card.title}
              </text>
              <text fill={MUTED} fontSize="10.5" fontWeight="500" x="1130" y={card.y + 48}>
                {card.subtitle}
              </text>
              {card.rows.map((row, i) => (
                <g key={row.text}>
                  <use
                    color={card.iconColor}
                    height="15"
                    href={`#${row.icon}`}
                    width="15"
                    x="1086"
                    y={card.y + 66 + i * 23}
                  />
                  <text fill={SLATE} fontSize="11.5" fontWeight="500" x="1108" y={card.y + 77 + i * 23}>
                    {row.text}
                  </text>
                </g>
              ))}
            </g>
          ))}

          {/* dashed outcome cards + thin out-arrows */}
          {outcomes.map((out) => (
            <g key={out.lines.join("-")}>
              <path
                d={`M1366 ${out.arrowY} H1402`}
                fill="none"
                markerEnd="url(#tv-arr-gray)"
                stroke={MUTED}
                strokeWidth="1.4"
              />
              <rect
                fill="#f8fafc"
                height="74"
                rx="12"
                stroke="#cbd5e1"
                strokeDasharray="5 4"
                width="150"
                x="1406"
                y={out.y}
              />
              <use color={out.iconColor} height="22" href={`#${out.icon}`} width="22" x="1422" y={out.y + 18} />
              <text fill="#334155" fontSize="11.5" fontWeight="700" x="1452" y={out.y + 33}>
                {out.lines[0]}
              </text>
              <text fill="#334155" fontSize="11.5" fontWeight="700" x="1452" y={out.y + 49}>
                {out.lines[1]}
              </text>
            </g>
          ))}
        </g>

        {/* ===================== BOTTOM CALLOUTS ===================== */}
        {callouts.map((callout) => (
          <g key={callout.title}>
            <g filter="url(#tv-softsm)">
              <rect fill="#ffffff" height="104" rx="13" stroke="#e2e8f0" width="188" x={callout.x} y="678" />
            </g>
            <rect fill={callout.iconFill} height="30" rx="8" width="30" x={callout.x + 16} y="694" />
            <use color={callout.iconColor} height="20" href={`#${callout.icon}`} width="20" x={callout.x + 21} y="699" />
            <text fill="#1e293b" fontSize="12.5" fontWeight="700" x={callout.x + 56} y="712">
              {callout.title}
            </text>
            {callout.body.map((line, i) => (
              <text fill="#64748b" fontSize="10.5" fontWeight="500" key={line} x={callout.x + 16} y={744 + i * 16}>
                {line}
              </text>
            ))}
          </g>
        ))}

        {/* ===================== CAPABILITY STRIP ===================== */}
        <g filter="url(#tv-soft)">
          <rect fill="#ffffff" height="126" rx="16" stroke={HAIR} width="1564" x="40" y="806" />
        </g>
        <text fill="#1e293b" fontSize="15" fontWeight="700" x="66" y="862">
          Toluva capabilities
        </text>
        <text fill={MUTED} fontSize="11" fontWeight="500" x="66" y="882">
          One governed lane · evidence-ready
        </text>
        <line stroke={HAIR} x1="290" x2="290" y1="828" y2="910" />
        {capabilities.map((cap, i) => {
          const x = 316 + i * 112;
          return (
            <g key={cap.lines.join("-")}>
              <rect fill={cap.fill} height="32" rx="9" width="32" x={x} y="836" />
              <use color={cap.accent} height="22" href={`#${cap.icon}`} width="22" x={x + 5} y="841" />
              <text fill={SLATE} fontSize="9.5" fontWeight="600" textAnchor="middle" x={x + 16} y="894">
                {cap.lines[0]}
              </text>
              <text fill={SLATE} fontSize="9.5" fontWeight="600" textAnchor="middle" x={x + 16} y="906">
                {cap.lines[1]}
              </text>
            </g>
          );
        })}
        <line stroke={HAIR} x1="1182" x2="1182" y1="828" y2="910" />

        {/* ===================== LEGEND ===================== */}
        <line markerEnd="url(#tv-arr-sky)" stroke={SKY} strokeWidth="2.4" x1="66" x2="98" y1="956" y2="956" />
        <text fill={SLATE} fontSize="11.5" fontWeight="600" x="108" y="960">
          Media path — source, speech, final render
        </text>
        <line markerEnd="url(#tv-arr-gray)" stroke="#cbd5e1" strokeDasharray="4 4" strokeWidth="2.4" x1="416" x2="448" y1="956" y2="956" />
        <text fill={SLATE} fontSize="11.5" fontWeight="600" x="458" y="960">
          Evidence path — records · manifests · hashes
        </text>
        <line markerEnd="url(#tv-arr-green)" stroke={GREEN} strokeWidth="2.4" x1="812" x2="844" y1="956" y2="956" />
        <text fill={SLATE} fontSize="11.5" fontWeight="600" x="854" y="960">
          Approval path — block → approve → resume
        </text>
        <text fill={MUTED} fontSize="11" fontWeight="500" textAnchor="end" x="1604" y="950">
          Toluva measures generated audio; it never estimates duration from characters.
        </text>
        <text fill={MUTED} fontSize="11" fontWeight="500" textAnchor="end" x="1604" y="966">
          A manifest proves lineage and integrity, not regulatory compliance.
        </text>

        {/* ===================== SPINE (overlay) ===================== */}
        <text fill={MUTED} fontSize="9.5" fontWeight="700" letterSpacing="1.6" textAnchor="middle" x="673" y="146">
          HOW TOLUVA WORKS
        </text>
        <g fill="#1e293b" fontSize="11.5" fontWeight="600">
          {spine.map((item, i) => (
            <g key={item.label}>
              <circle cx={item.cx} cy="162" fill={INK} r="9" />
              <text fill="#ffffff" fontSize="11" fontWeight="800" textAnchor="middle" x={item.cx} y="166">
                {i + 1}
              </text>
              <text x={item.cx + LABEL_OFFSET} y="166">
                {item.label}
              </text>
              {i < spine.length - 1 && (
                <text
                  fill="#cbd5e1"
                  fontSize="12"
                  textAnchor="middle"
                  x={(item.cx + LABEL_OFFSET + item.width + spine[i + 1].cx - R) / 2}
                  y="166"
                >
                  →
                </text>
              )}
            </g>
          ))}
        </g>

        {/* node badges pinning each stage to the layout */}
        {nodeBadges.map((badge) => (
          <g key={badge.n}>
            <circle cx={badge.cx} cy={badge.cy} fill={INK} r="14" stroke="#ffffff" strokeWidth="2.5" />
            <text fill="#ffffff" fontSize="15" fontWeight="800" textAnchor="middle" x={badge.cx} y={badge.cy + 5}>
              {badge.n}
            </text>
          </g>
        ))}

        <style>{`.tv-mono { font-family: var(--font-mono, ui-monospace, monospace); }`}</style>
      </svg>
    </div>
  );
}

export default ArchitectureDiagram;
