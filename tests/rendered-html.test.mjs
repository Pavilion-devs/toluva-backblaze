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

test("server-renders the Toluva product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Toluva — Governed video localization<\/title>/i);
  assert.match(html, /One message, many languages/);
  assert.match(html, /VERIFIED ENGINE RUN/);
  assert.match(html, /DEVELOPMENT SAMPLE/);
  assert.match(html, /VOICE CONTROL/);
  assert.match(html, /Localization pipeline/);
  assert.match(html, /Verified run workbench/);
  assert.match(html, /Backblaze B2/);
  assert.match(html, /Genblaze/);
  assert.match(html, /Willkommen bei Toluva/);
  assert.match(html, /New localization/);
  assert.doesNotMatch(html, /Leadership onboarding/);
  assert.doesNotMatch(html, /prepared demonstration data/i);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /Your site is taking shape/);
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
    message: "The transcript correction did not meet the review contract.",
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
    message: "The wording did not meet the timing-review contract.",
    ok: false,
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

test("removes starter-only assets and metadata", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<ToluvaApp \/>/);
  assert.match(layout, /Toluva — Governed video localization/);
  assert.match(layout, /og\.png/);
  assert.doesNotMatch(layout, /codex-preview|Starter Project/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await access(new URL("public/og.png", templateRoot));
});
