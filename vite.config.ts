import { fileURLToPath } from "node:url";
import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  // MDX is registered here rather than left to vinext's auto-injection, which
  // supplies no `providerImportSource` and so never applies our component map.
  // vinext detects a user-registered MDX plugin and skips its own.
  //
  // The provider is our own module, not `@mdx-js/react`: that package builds on
  // `createContext`, which does not exist in the RSC runtime and crashes the
  // server bundle on import. MDX only needs the module to export
  // `useMDXComponents`, so a plain function works in both environments.
  const mdx = (await import("@mdx-js/rollup")).default;
  const remarkGfm = (await import("remark-gfm")).default;
  const rehypeSlug = (await import("rehype-slug")).default;
  const remarkCodeMeta = (await import("./build/remark-code-meta.mjs")).default;

  const mdxComponents = fileURLToPath(
    new URL("./app/(docs)/_components/mdx-components.tsx", import.meta.url),
  );

  return {
    resolve: { alias: { "#mdx-components": mdxComponents } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      {
        enforce: "pre" as const,
        ...mdx({
          providerImportSource: "#mdx-components",
          remarkPlugins: [remarkGfm, remarkCodeMeta],
          // Gives every heading an id, which is what the "On this page" rail reads.
          rehypePlugins: [rehypeSlug],
        }),
      },
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
