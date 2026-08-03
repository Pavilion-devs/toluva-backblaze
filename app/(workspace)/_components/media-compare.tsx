"use client";

import { useState } from "react";
import { seconds } from "../../../lib/format";
import { buttonClass, Chip, MetaLabel } from "./ui";
import { useWorkspace } from "./workspace-data";

type MediaView = "source" | "final";

export function MediaCompare() {
  const { connection, refreshRun, run } = useWorkspace();
  const [view, setView] = useState<MediaView>("final");
  const [mediaError, setMediaError] = useState(false);

  const active =
    view === "source"
      ? {
          duration: run.source.durationSeconds,
          label: "English source visual preview without audio",
          src: "/judge-source-muted.mp4",
          text: run.source.text,
        }
      : {
          duration: run.edition.finalDurationSeconds,
          label: "German localized edition",
          src: "/api/media?kind=final",
          text: run.edition.translatedText,
        };

  function show(next: MediaView) {
    setView(next);
    setMediaError(false);
  }

  return (
    <article className="overflow-hidden rounded-card border border-slate-200/70 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <div
          className="flex items-center gap-1 rounded-full bg-slate-100 p-1"
          role="group"
          aria-label="Media edition"
        >
          {(["source", "final"] as MediaView[]).map((key) => (
            <button
              aria-pressed={view === key}
              className={`rounded-full px-3.5 py-1.5 text-caption font-semibold transition-colors ${
                view === key
                  ? "bg-ink text-white"
                  : "text-slate-600 hover:text-ink"
              }`}
              key={key}
              onClick={() => show(key)}
            >
              {key === "source" ? "Source · EN" : "Localized · DE"}
            </button>
          ))}
        </div>
        <span className="font-mono text-caption text-slate-500">
          {seconds(active.duration)}
        </span>
      </div>

      <div className="bg-ink">
        {!mediaError ? (
          <video
            aria-label={active.label}
            className="aspect-video w-full"
            controls
            key={`${view}-${connection}`}
            muted={view === "source"}
            onError={() => setMediaError(true)}
            playsInline
            preload="metadata"
            src={active.src}
          >
            {view === "final" && (
              <track
                default
                kind="captions"
                label="Deutsch"
                src="/api/media?kind=captions"
                srcLang="de"
              />
            )}
          </video>
        ) : (
          <div
            className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-cream px-8 text-center"
            role="status"
          >
            <span className="font-mono text-micro font-bold tracking-widest text-slate-500">
              B2
            </span>
            <strong className="font-display text-[16px] text-ink">
              Private media is temporarily unavailable
            </strong>
            <p className="max-w-sm text-body leading-relaxed text-slate-600">
              The verified record remains visible. Refresh the B2 connection to
              retry secure playback.
            </p>
            <button
              className={`${buttonClass("secondary")} mt-2`}
              onClick={() => {
                setMediaError(false);
                void refreshRun();
              }}
            >
              Retry playback
            </button>
          </div>
        )}
      </div>

      <div className="border-b border-slate-100 bg-cream/70 px-5 py-4">
        <MetaLabel>{view === "source" ? "Source" : "German"}</MetaLabel>
        <p className="text-body leading-relaxed text-slate-700">
          {active.text}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <MetaLabel>
            {view === "source" ? "Source master" : "Localized master"}
          </MetaLabel>
          <strong className="block truncate font-mono text-body text-ink">
            {view === "source"
              ? run.source.b2Key.split("/").at(-1)
              : "localized-de.mp4"}
          </strong>
          <small className="mt-0.5 block text-caption text-slate-500">
            {view === "source"
              ? "Muted example derivative · source master remains private B2 evidence"
              : "H.264 · AAC · mov_text captions"}
          </small>
        </div>
        <Chip tone={view === "source" ? "amber" : "green"}>
          {view === "source" ? "Audio withheld" : "✓ Bytes verified"}
        </Chip>
      </div>
    </article>
  );
}
