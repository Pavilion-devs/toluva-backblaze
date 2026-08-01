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

  // Positioning guard: the template this page came from sold a general-purpose
  // AI video editor, which AGENTS.md forbids Toluva from claiming to be.
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
  assert.match(html, /Verified engine run/);
  assert.match(html, /Controlled engine sample/);
  assert.match(html, /Voice control/);
  assert.match(html, /Localization pipeline/);
  assert.match(html, /Verified run workbench/);
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
});

test("server-renders the timing correction proof on its own route", async () => {
  const response = await render("/workspace/timing");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Signature correction proof/);
  assert.match(html, /Measured red → approved rewrite → verified green/);
  assert.match(html, /3 measured segments/);
  assert.match(html, /Ein Video kann jedes Team erreichen/);
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
  assert.doesNotMatch(html, /judge mode/i);
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
