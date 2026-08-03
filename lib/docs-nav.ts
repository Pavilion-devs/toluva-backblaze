export type DocPage = {
  slug: string;
  summary: string;
  title: string;
};

export type DocGroup = {
  items: DocPage[];
  title: string;
};

/** Sidebar structure. Drives the sidebar, ⌘K search, and prev/next footer. */
export const docsNav: DocGroup[] = [
  {
    title: "Getting started",
    items: [
      {
        slug: "/docs",
        summary:
          "What Toluva is: a governed lane from one approved source video to a verifiable localized edition.",
        title: "Overview",
      },
      {
        slug: "/docs/quickstart",
        summary:
          "Upload a clip, confirm rights and disclosure, and watch the run reach a German edition.",
        title: "Quickstart",
      },
      {
        slug: "/docs/setup",
        summary:
          "Node, Python and uv, FFmpeg, the B2 bucket key, and the isolated worker deployment.",
        title: "Installation & setup",
      },
    ],
  },
  {
    title: "Core concepts",
    items: [
      {
        slug: "/docs/how-it-works",
        summary:
          "Ingest, transcribe, translate, authorize, time-fit, master — the six stages end to end.",
        title: "How Toluva works",
      },
      {
        slug: "/docs/authorization",
        summary:
          "Voice authorization as an active generation control: scope, validity, and the evidence hash.",
        title: "Voice authorization",
      },
      {
        slug: "/docs/timing",
        summary:
          "Drift ratio, the green/amber/red bands, silence padding, and bounded tempo fit.",
        title: "Timing-drift QA",
      },
    ],
  },
  {
    title: "Pipeline",
    items: [
      {
        slug: "/docs/pipeline/stages",
        summary:
          "What each stage reads, what it writes, and which provider it calls.",
        title: "Stages",
      },
      {
        slug: "/docs/pipeline/correction",
        summary:
          "The measure, block, approve, regenerate loop that turns a red segment green.",
        title: "The correction loop",
      },
    ],
  },
  {
    title: "Evidence",
    items: [
      {
        slug: "/docs/evidence/storage",
        summary:
          "How a job is laid out in Backblaze B2 and why storage is the system of record.",
        title: "Backblaze B2 layout",
      },
      {
        slug: "/docs/evidence/manifests",
        summary:
          "Genblaze runs, canonical hashes, parent/child lineage, and what a manifest does not prove.",
        title: "Genblaze manifests",
      },
    ],
  },
  {
    title: "Reference",
    items: [
      {
        slug: "/docs/reference/intake",
        summary:
          "The intake contract: clip limits, required confirmations, and bounded public capacity.",
        title: "Intake contract & limits",
      },
      {
        slug: "/docs/reference/media-rights",
        summary:
          "Synthetic-voice disclosure, source-rights confirmation, and the media ledger.",
        title: "Media & rights",
      },
    ],
  },
  {
    title: "Resources",
    items: [
      {
        slug: "/docs/architecture",
        summary: "The full Toluva runtime topology, in one diagram.",
        title: "Architecture",
      },
    ],
  },
];

/** Flattened, ordered list for prev/next navigation and search. */
export const flatDocs = docsNav.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.title })),
);
