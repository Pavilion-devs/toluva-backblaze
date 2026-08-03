import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render(path = "/", init = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(new URL(path, "http://localhost/"), {
      ...init,
      headers: {
        accept: "text/html",
        ...init.headers,
      },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the marketing landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Toluva — Governed video localization<\/title>/i);
  assert.match(html, /Localize the message/);
  assert.match(html, /Keep control of the voice/);
  assert.match(html, /Toluva turns one approved source video/);
  assert.match(html, /Backblaze B2/);
  assert.match(html, /Genblaze/);
  assert.match(html, /Correction proof/);

  // The primary product action must start a real localization flow.
  assert.match(html, /href="\/workspace\/new"/);
  assert.match(html, /Start localizing/);
  assert.doesNotMatch(html, /Open the verified run/i);

  // The marketing hero uses the entrant-recorded product walkthrough. The
  // controlled proof remains available only inside the example workspace.
  assert.match(html, /toluva-product-walkthrough\.mp4/);
  assert.match(html, /toluva-product-walkthrough-cover\.jpg/);
  assert.doesNotMatch(html, /judge-source-muted\.mp4/);
  assert.doesNotMatch(html, /Compare editions/);

  // Positioning guard: Toluva is a governed localization workflow, not the
  // general-purpose AI video editor sold by the original page template.
  assert.doesNotMatch(html, /AI video editor/i);
  assert.doesNotMatch(html, /podcasters/i);
  assert.doesNotMatch(html, /auto-captions/i);
  assert.doesNotMatch(html, /Premiere|DaVinci|CapCut|Filmora/);
  assert.doesNotMatch(html, /Sergio Walker|Jane Jay Jay|Marcus Reid|Elena Fisher/);
});

test("the landing page loads no third-party assets or runtime scripts", async () => {
  const html = await (await render()).text();

  // The export shipped a Tailwind Play CDN tag, an unpinned lucide bundle, ~25
  // unused Google Font links, and images hotlinked from a Supabase bucket we
  // do not own. None of those may return.
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com/);
  assert.doesNotMatch(html, /unpkg\.com/);
  assert.doesNotMatch(html, /supabase\.co/);
  assert.doesNotMatch(html, /images\.unsplash\.com/);
  assert.doesNotMatch(html, /aura-supabase-token-firewall/);
  assert.doesNotMatch(html, /data-img-fallback-handler/);
});

test("server-renders the product workspace", async () => {
  const response = await render("/workspace");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /One governed German edition/);
  assert.match(html, /Controlled engine sample/);
  assert.match(html, /Voice control/);
  assert.match(html, /Localization pipeline/);
  assert.match(html, /Evidence for this project/);
  assert.match(html, /Manifests/);
  assert.match(html, /1 bounded tempo-fit/);
  assert.match(html, /New localization/);
  assert.match(html, /Example project/);
  assert.match(html, /Backblaze B2/);
  assert.match(html, /Genblaze/);
  assert.doesNotMatch(html, /Leadership onboarding/);
  assert.doesNotMatch(html, /DEVELOPMENT SAMPLE/);
  assert.doesNotMatch(html, /prepared demonstration data/i);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /Your site is taking shape/);
  assert.doesNotMatch(html, /judge mode/i);

  // The reference run is one project among the user's own, not the headline.
  assert.doesNotMatch(html, /Verified engine run/);
  assert.doesNotMatch(html, /Verified run workbench/);
  assert.doesNotMatch(html, /Inspect the proof/);
});

test("server-renders the timing correction archive on its own route", async () => {
  const response = await render("/workspace/timing");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Correction archive/);
  assert.match(html, /Measured red → approved rewrite → verified green/);
  assert.match(html, /3 measured segments/);
  assert.match(html, /Ein Video kann jedes Team erreichen/);
});

test("workspace navigation stays grouped on small screens", async () => {
  const html = await (await render("/workspace")).text();

  // The drawer replaced a flat eight-pill scroller that dropped the grouping.
  // Its panel mounts on open, so only the trigger is server-rendered.
  assert.match(html, /aria-label="Open workspace menu"/);
  assert.match(html, /aria-controls="workspace-drawer"/);
  for (const group of ["Overview", "Localize", "Editions", "Evidence"]) {
    assert.match(html, new RegExp(group), `${group} group missing from nav`);
  }
});

test("every workspace route server-renders", async () => {
  const routes = [
    "/workspace",
    "/workspace/new",
    "/workspace/runs",
    "/workspace/editions",
    "/workspace/timing",
    "/workspace/voice",
    "/workspace/assets",
    "/workspace/provenance",
  ];

  for (const route of routes) {
    const response = await render(route);
    assert.equal(response.status, 200, `${route} did not render`);
    const html = await response.text();
    assert.doesNotMatch(html, /Application error/i, `${route} rendered an error`);
  }
});

test("new localization renders the real bounded upload workflow", async () => {
  const html = await (await render("/workspace/new")).text();
  assert.match(html, /Drop an MP4 here/i);
  assert.match(html, /Queue in Backblaze B2/);
  assert.match(html, /I have the right to upload this clip/i);
  assert.match(html, /disclosed ElevenLabs stock synthetic voice/i);
  assert.match(html, /Bounded public capacity/i);
  assert.match(html, /generated characters per job/i);
  assert.match(html, /8\.00/);
  assert.doesNotMatch(html, /judge mode/i);
});

const docsRoutes = [
  "/docs",
  "/docs/quickstart",
  "/docs/setup",
  "/docs/how-it-works",
  "/docs/authorization",
  "/docs/timing",
  "/docs/pipeline/stages",
  "/docs/pipeline/correction",
  "/docs/evidence/storage",
  "/docs/evidence/manifests",
  "/docs/reference/intake",
  "/docs/reference/media-rights",
  "/docs/architecture",
];

test("every docs route server-renders from MDX", async () => {
  for (const route of docsRoutes) {
    const response = await render(route);
    assert.equal(response.status, 200, `${route} did not render`);
    const html = await response.text();
    assert.doesNotMatch(html, /Application error/i, `${route} rendered an error`);
  }
});

test("docs chrome renders the sidebar, search and MDX component map", async () => {
  const html = await (await render("/docs")).text();

  for (const group of [
    "Getting started",
    "Core concepts",
    "Pipeline",
    "Evidence",
    "Reference",
    "Resources",
  ]) {
    assert.match(html, new RegExp(group), `${group} missing from docs sidebar`);
  }

  // rehype-slug ids are what the "On this page" rail reads.
  assert.match(html, /<h2[^>]*\bid="/);
  assert.match(html, /⌘K/);
  assert.match(html, /aria-controls="docs-drawer"/);

  // MDX wraps multiline component children in a paragraph. Lede must use a
  // neutral container so the server never emits invalid <p><p> markup that
  // forces the client to discard and rehydrate the documentation tree.
  assert.doesNotMatch(html, /<p[^>]*>\s*<p\b/i);
});

test("docs match the hosted 8 MB intake contract", async () => {
  for (const route of [
    "/docs/quickstart",
    "/docs/reference/intake",
    "/docs/architecture",
  ]) {
    const html = await (await render(route)).text();
    assert.match(html, /8 MB/, `${route} is missing the hosted limit`);
    assert.doesNotMatch(html, /12 MB/, `${route} still shows the old limit`);
  }
});

test("the custom remark plugin forwards fence titles", async () => {
  const html = await (await render("/docs/setup")).text();
  // ```bash title="Install" must reach the rendered element, or CodeGroup tabs
  // can only ever show the language.
  assert.match(html, /title="Install"/);
  assert.match(html, /language-bash/);
});

test("the architecture diagram renders inline, not as an external asset", async () => {
  const html = await (await render("/docs/architecture")).text();

  assert.match(html, /viewBox="0 0 1644 1010"/);
  assert.match(html, /Toluva architecture/);
  assert.doesNotMatch(html, /<object/);

  // Inline JSX so it uses the self-hosted font stack and the semantic drift
  // tokens; an <object> would need its own webfont import and could read
  // neither.
  assert.match(html, /var\(--font-sans\)/);
  assert.match(html, /var\(--color-fit-green/);

  // Every region of the reference layout has to be present, not approximated.
  assert.match(html, /HOW TOLUVA WORKS/);
  for (const stage of [
    "Ingest",
    "Transcribe",
    "Translate",
    "Authorize",
    "Time-fit QA",
    "Master",
  ]) {
    assert.match(html, new RegExp(stage), `spine stage ${stage} missing`);
  }
  for (const region of [
    "UPLOADERS",
    "REVIEWERS",
    "OPERATORS",
    "Source path",
    "Source lineage",
    "Manifests &amp; lineage",
    "Timing verdict",
    "Authorization record",
    "Providers",
    "Quality gates",
    "Worker",
    "Generated media",
    "German",
    "Storage is the record",
    "Toluva capabilities",
    "Media path",
  ]) {
    assert.match(html, new RegExp(region), `diagram region ${region} missing`);
  }
});

test("the docs section loads no third-party assets", async () => {
  // The template this section was modelled on used @iconify/react, which
  // fetches icon data at runtime, and an SVG that @imported Google Fonts.
  for (const route of docsRoutes) {
    const html = await (await render(route)).text();
    for (const host of [
      "iconify",
      "fonts.googleapis.com",
      "cdn.tailwindcss.com",
      "unpkg.com",
      "supabase.co",
    ]) {
      assert.doesNotMatch(
        html,
        new RegExp(host.replace(/\./g, "\\.")),
        `${route} references ${host}`,
      );
    }
  }
});

test("docs navigation is reachable from the product surfaces", async () => {
  const landing = await (await render("/")).text();
  assert.match(landing, /href="\/docs"/);

  const workspace = await (await render("/workspace")).text();
  assert.match(workspace, /href="\/docs"/);
});

test("fails closed when runtime B2 credentials are unavailable", async () => {
  const response = await render("/api/run");
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.deepEqual(payload, {
    error: "live_b2_run_unavailable",
    message:
      "The verified snapshot remains visible while the live B2 read is unavailable.",
    ok: false,
  });
});

test("reports an unavailable worker as offline without leaking an error", async () => {
  const response = await render("/api/worker-status");
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.worker, {
    engineVersion: null,
    lastSeenAt: null,
    online: false,
    reason: "unavailable",
    replicaCount: null,
    state: "offline",
  });
});

test("rejects media kinds outside the verified allowlist", async () => {
  const response = await render("/api/media?kind=../../private");
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "unsupported_verified_media_kind",
  });
});

test("withholds the example project's system-voice source audio", async () => {
  const response = await render("/api/media?kind=source");
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "source_audio_withheld",
    message:
      "The example project serves an audio-free source preview while preserving its immutable source master privately in B2.",
  });
});

test("rejects malformed durable job handles before a B2 read", async () => {
  const response = await render(
    "/api/job-status?project=../../private&job=not-a-job",
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "invalid_job_handle",
    ok: false,
  });
});

test("rejects malformed transcript approvals before a B2 write", async () => {
  const response = await render("/api/transcript-review", {
    body: JSON.stringify({
      correctedText: "Welcome to Toluva.",
      jobId: "not-a-job",
      projectId: "../../private",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "invalid_job_handle",
    message:
      "The transcript correction did not meet the review contract.",
    ok: false,
  });
});

test("rejects malformed timing approvals before a B2 write", async () => {
  const response = await render("/api/timing-review", {
    body: JSON.stringify({
      jobId: "not-a-job",
      projectId: "../../private",
      revisedText: "Toluva bleibt im Takt.",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "invalid_job_handle",
    message:
      "The wording did not meet the timing-review contract.",
    ok: false,
  });
});

test("rejects malformed authorization checks before a B2 read", async () => {
  const response = await render("/api/authorization", {
    body: JSON.stringify({ language: "../../private", purpose: "anything" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "authorization_request_invalid",
    ok: false,
  });
});

test("allows only the two fixed correction-audio attempts", async () => {
  const response = await render("/api/correction-audio?attempt=3");
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "unsupported_correction_attempt",
  });
});

test("shares the timing-expansion action name across web and worker runtimes", async () => {
  const [jobServer, timingDomain] = await Promise.all([
    readFile(new URL("../lib/job-server.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../services/pipeline/src/toluva_pipeline/domain/timing.py",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(jobServer, /\["retry_shorter", "retry_expanded"\]/);
  assert.doesNotMatch(jobServer, /retry_longer/);
  assert.match(timingDomain, /RETRY_EXPANDED\s*=\s*"retry_expanded"/);
});

test("rejects malformed completed-job media requests", async () => {
  const response = await render(
    "/api/job-media?project=bad&job=bad&kind=private",
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "invalid_job_media_request",
  });
});

test("removes starter-only assets and preserves bounded intake wiring", async () => {
  const [workspaceLayout, newPage, jobContract, layout, packageJson] =
    await Promise.all([
    readFile(new URL("../app/(workspace)/layout.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/(workspace)/workspace/new/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/job-contract.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(workspaceLayout, /liveIntakeEnabled=\{liveIntakeEnabled\(\)\}/);
  assert.match(workspaceLayout, /publicDailyJobLimit=\{publicDailyJobLimit\(\)\}/);
  assert.match(newPage, /sourceRightsConfirmed/);
  assert.match(newPage, /syntheticVoiceDisclosureAcknowledged/);
  assert.match(jobContract, /MAX_TTS_CALLS_PER_JOB = 4/);
  assert.match(jobContract, /MAX_TTS_CHARACTERS_PER_JOB = 400/);
  assert.match(layout, /Toluva — Governed video localization/);
  assert.match(layout, /og\.png/);
  assert.doesNotMatch(layout, /codex-preview|Starter Project/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await access(new URL("public/og.png", templateRoot));
});

test("completed jobs expose dynamic result evidence and compact captions", async () => {
  const [runDetail, jobServer, globalCss] = await Promise.all([
    readFile(
      new URL(
        "../app/(workspace)/workspace/runs/[id]/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../lib/job-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(runDetail, /Your German edition is ready/);
  assert.match(runDetail, /job\.finalSummary\.ttsAttemptCount/);
  assert.match(runDetail, /job\.finalSummary\.ttsGeneratedCharacters/);
  assert.match(runDetail, /job\.finalSummary\.localTempoFactor/);
  assert.match(runDetail, /Download German MP4/);
  assert.match(runDetail, /Download captions/);
  assert.match(runDetail, /localized-player/);
  assert.match(jobServer, /completedJobSummary/);
  assert.match(jobServer, /completed_job_summary_invalid/);
  assert.match(globalCss, /\.localized-player::cue/);
});
