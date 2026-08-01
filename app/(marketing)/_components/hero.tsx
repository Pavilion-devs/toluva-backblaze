"use client";

import Link from "next/link";
import { useState } from "react";

type Edition = "source" | "final";

/*
 * PLACEHOLDER HERO MEDIA — swap point.
 *
 * These two entries are the only thing to change when the entrant-owned
 * recording of the real workflow is ready: drop the file in `public/`, point
 * `src` at it, and either collapse this to a single entry or keep the compare
 * toggle if the recording has a localized counterpart.
 *
 * Until then it shows the example project. The source preview is the
 * rights-cleared, audio-free derivative in `public/`; the German edition stays
 * behind the verified B2 proxy (see docs/MEDIA_AND_RIGHTS.md) so it is loaded
 * on demand and degrades to a notice rather than being copied to `public/`.
 * The private source audio is never served here.
 */
const editions: Record<
  Edition,
  { caption: string; label: string; src: string }
> = {
  source: {
    caption: "English source · 12.419s · muted preview",
    label: "Source · EN",
    src: "/judge-source-muted.mp4",
  },
  final: {
    caption: "German edition · 12.419s · disclosed stock synthetic voice",
    label: "Localized · DE",
    src: "/api/media?kind=final",
  },
};

export function Hero() {
  const [edition, setEdition] = useState<Edition>("source");
  const [mediaUnavailable, setMediaUnavailable] = useState(false);
  const active = editions[edition];

  function show(next: Edition) {
    setEdition(next);
    setMediaUnavailable(false);
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl grow flex-col items-center px-5 pt-10 pb-16 sm:px-6 sm:pt-14 md:pt-16 md:pb-20">
      <div
        className="mx-auto mb-12 max-w-4xl animate-slide-up text-center sm:mb-14 md:mb-16"
        style={{ animationDelay: "0.1s" }}
      >
        <h1 className="mb-6 text-[38px] font-semibold leading-[1.05] tracking-tight text-ink sm:text-[56px] md:mb-8 md:text-[72px] lg:text-[80px] lg:leading-[1]">
          Localize the message.
          <br />
          Keep control of the voice.
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-[17px] font-medium leading-relaxed text-slate-600 sm:text-lg md:mb-10 md:text-[19px]">
          Toluva turns one approved source video into time-aligned,
          consent-aware, verifiable localized editions — with every stage
          recorded in Backblaze B2.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href="/workspace/new"
            className="w-full rounded-full bg-ink px-8 py-3.5 text-center text-[16px] font-medium text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-black hover:shadow-xl sm:w-auto sm:text-[17px]"
          >
            Start localizing
          </Link>
          <a
            href="#evidence"
            className="flex w-full items-center justify-center gap-2 rounded-full border border-white/50 bg-white/40 px-8 py-3.5 text-[16px] font-medium text-ink backdrop-blur-md transition-all hover:bg-white/60 sm:w-auto sm:text-[17px]"
          >
            See how it works
          </a>
        </div>
      </div>

      <div
        className="z-30 w-full max-w-[1067px] mx-auto animate-slide-up"
        style={{ animationDelay: "0.3s" }}
      >
        <div className="relative w-full aspect-video">
          {!mediaUnavailable ? (
            <video
              aria-label={active.caption}
              autoPlay
              className="absolute inset-0 h-full w-full rounded-xl bg-ink object-cover shadow-[0_30px_60px_-15px_rgba(0,0,0,0.25)]"
              controls
              key={edition}
              loop
              muted
              onError={() => setMediaUnavailable(true)}
              playsInline
              preload="metadata"
              src={active.src}
            />
          ) : (
            <div className="absolute inset-0 rounded-xl bg-white/70 backdrop-blur-md border border-white/60 flex flex-col items-center justify-center gap-3 px-8 text-center shadow-[0_30px_60px_-15px_rgba(0,0,0,0.25)]">
              <span className="font-mono text-xs font-bold tracking-widest text-slate-500 uppercase">
                B2
              </span>
              <strong className="font-display text-xl text-ink">
                The German edition is served from private B2
              </strong>
              <p className="text-[15px] text-slate-600 max-w-md">
                That read is unavailable right now. The verified record stays
                available as an example project in the workspace.
              </p>
              <button
                className="mt-2 rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                onClick={() => show("source")}
              >
                Back to the source
              </button>
            </div>
          )}

          <div
            className="absolute left-3 top-3 flex items-center gap-1 rounded-full border border-white/60 bg-white/75 p-1 shadow-sm backdrop-blur-md sm:left-4 sm:top-4"
            role="group"
            aria-label="Compare editions"
          >
            {(Object.keys(editions) as Edition[]).map((key) => (
              <button
                aria-pressed={edition === key}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors sm:px-4 sm:text-[13px] ${
                  edition === key
                    ? "bg-ink text-white"
                    : "text-slate-600 hover:text-ink"
                }`}
                key={key}
                onClick={() => show(key)}
              >
                {editions[key].label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-4 text-center text-[13px] font-medium text-slate-500">
          {active.caption}
        </p>
      </div>
    </main>
  );
}
