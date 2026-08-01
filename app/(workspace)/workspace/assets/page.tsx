"use client";

import { useMemo, useState } from "react";
import { Chip, MetaLabel, PageHeader, Panel } from "../../_components/ui";
import { useWorkspace } from "../../_components/workspace-data";

export default function AssetsPage() {
  const { run } = useWorkspace();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const assets = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return run.assets;
    return run.assets.filter(
      (asset) =>
        asset.name.toLowerCase().includes(needle) ||
        asset.kind.toLowerCase().includes(needle) ||
        asset.b2Key.toLowerCase().includes(needle),
    );
  }, [filter, run.assets]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description="The interface reads sanitized records through a server-only bridge. Storage credentials never reach the browser, and media proxies accept fixed kinds or exact opaque job handles rather than arbitrary B2 keys."
        eyebrow="System of record"
        title="B2 assets"
      />

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-slate-200/70 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink font-mono text-caption font-bold text-white">
            B2
          </span>
          <div>
            <strong className="block font-display text-[15px] text-ink">
              Backblaze B2 is the example project&apos;s system of record
            </strong>
            <p className="text-body text-slate-600">
              Source lineage, attempts, decisions, and the final render
            </p>
          </div>
        </div>
        <Chip tone="green">{run.b2ObjectCount} job objects</Chip>
      </div>

      <Panel
        actions={
          <input
            aria-label="Filter assets"
            className="w-56 rounded-full border border-slate-200 bg-white px-4 py-2 text-body text-ink placeholder:text-slate-400"
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by name or key…"
            type="search"
            value={filter}
          />
        }
        eyebrow="Highlighted objects"
        title={`${assets.length} of ${run.assets.length} shown`}
      >
        {assets.length === 0 ? (
          <p className="py-8 text-center text-body text-slate-500">
            No asset matches that filter.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {assets.map((asset) => {
              const open = selected === asset.b2Key;
              return (
                <article
                  className={`rounded-2xl border p-4 transition-colors ${
                    open
                      ? "border-slate-300 bg-white"
                      : "border-slate-100 bg-cream/60"
                  }`}
                  key={asset.b2Key}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <MetaLabel>{asset.kind}</MetaLabel>
                      <strong className="block truncate font-mono text-body text-ink">
                        {asset.name}
                      </strong>
                      <small className="mt-1 block text-caption text-slate-500">
                        {asset.meta}
                      </small>
                    </div>
                    <button
                      aria-expanded={open}
                      aria-label={`Inspect ${asset.name}`}
                      className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-body text-slate-600 hover:text-ink"
                      onClick={() => setSelected(open ? null : asset.b2Key)}
                    >
                      {open ? "×" : "→"}
                    </button>
                  </div>
                  {open && (
                    <code className="mt-3 block break-all rounded-xl bg-ink/95 p-3 font-mono text-micro leading-relaxed text-cream">
                      {asset.b2Key}
                    </code>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
