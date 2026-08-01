"use client";

import Link from "next/link";
import { seconds } from "../../../../lib/format";
import { MediaCompare } from "../../_components/media-compare";
import {
  buttonClass,
  MetaLabel,
  PageHeader,
  Panel,
  StatusMark,
} from "../../_components/ui";
import { useWorkspace } from "../../_components/workspace-data";

const languages = [
  { code: "de", localName: "Deutsch", name: "German" },
  { code: "fr", localName: "Français", name: "French" },
  { code: "es", localName: "Español", name: "Spanish" },
  { code: "ja", localName: "日本語", name: "Japanese" },
];

export default function EditionsPage() {
  const { run } = useWorkspace();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        description="One governed German edition is complete. The other languages are outside the stored authorization scope, so Toluva refuses them before any provider call rather than generating something it cannot account for."
        eyebrow="Outputs"
        title="Language editions"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <MediaCompare />

        <Panel eyebrow="Editions" title="1 verified">
          <div className="flex flex-col gap-2">
            {languages.map((language) => {
              const isGerman = language.code === "de";
              return (
                <div
                  className={`flex items-center gap-3 rounded-2xl border p-3.5 ${
                    isGerman
                      ? "border-fit-green/25 bg-fit-green-soft"
                      : "border-slate-100 bg-cream/60"
                  }`}
                  key={language.code}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-[12px] font-bold ${
                      isGerman
                        ? "bg-fit-green text-white"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {language.code.toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-[14px] font-semibold text-ink">
                      {language.name}
                    </strong>
                    <small className="text-[12px] text-slate-500">
                      {language.localName}
                    </small>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <StatusMark status={isGerman ? "ready" : "blocked"} />
                    <small className="text-[11px] text-slate-500">
                      {isGerman
                        ? "Engine run complete"
                        : "Authorization required"}
                    </small>
                  </span>
                </div>
              );
            })}
          </div>

          <Link
            className={`${buttonClass("secondary")} mt-5 w-full`}
            href="/workspace/voice"
          >
            Test why the others are blocked →
          </Link>
        </Panel>
      </div>

      <Panel eyebrow="German edition" title="Master details">
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Duration", seconds(run.edition.finalDurationSeconds)],
            ["Container", "H.264 · AAC"],
            [
              "Captions",
              run.edition.captionsEmbedded
                ? "mov_text + WebVTT"
                : "WebVTT sidecar",
            ],
            ["Protected terms", run.edition.protectedTerms.join(", ")],
          ].map(([term, value]) => (
            <div key={term}>
              <MetaLabel>{term}</MetaLabel>
              <strong className="font-mono text-[14px] text-ink">
                {value}
              </strong>
            </div>
          ))}
        </dl>
        <div className="mt-5 rounded-2xl border border-slate-100 bg-cream p-4">
          <MetaLabel>Final MP4 SHA-256</MetaLabel>
          <code className="block break-all font-mono text-[12px] leading-relaxed text-slate-700">
            {run.edition.finalSha256}
          </code>
        </div>
      </Panel>
    </div>
  );
}
