import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(new URL(path, "http://localhost/"), {
      headers: { accept: "text/html" },
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

test("rejects media kinds outside the verified allowlist", async () => {
  const response = await render("/api/media?kind=../../private");
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "unsupported_verified_media_kind",
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
