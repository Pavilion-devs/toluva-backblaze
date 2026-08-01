"use client";

import Link from "next/link";
import { useState } from "react";

type Edition = "source" | "final";

/*
 * The source preview is the rights-cleared, audio-free derivative in `public/`.
 * The German edition stays behind the verified B2 proxy — see
 * docs/MEDIA_AND_RIGHTS.md — so it is loaded on demand and degrades to a notice
 * when the private read is unavailable rather than being copied to `public/`.
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
    <main className="grow flex flex-col items-center pt-16 pb-20 px-4 md:px-6 w-full max-w-7xl mx-auto">
      <div
        className="text-center max-w-4xl mx-auto mb-16 animate-slide-up"
        style={{ animationDelay: "0.1s" }}
      >
        <h1 className="md:text-[80px] leading-[1] text-6xl font-semibold text-ink tracking-tight font-display mb-8">
          Localize the message.
          <br />
          Keep control of the voice.
        </h1>
        <p className="md:text-[19px] leading-relaxed text-lg font-medium text-slate-600 max-w-2xl mx-auto mb-10">
          Toluva turns one approved source video into time-aligned,
          consent-aware, verifiable localized editions — with every stage
          recorded in Backblaze B2.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/workspace/new"
            className="text-[17px] hover:bg-black transition-all hover:shadow-xl hover:-translate-y-0.5 sm:w-auto font-medium text-white bg-ink w-full rounded-full py-3.5 px-8 shadow-lg text-center"
          >
            Start localizing
          </Link>
          <a
            href="#evidence"
            className="bg-white/40 backdrop-blur-md border border-white/50 text-ink text-[17px] font-medium px-8 py-3.5 rounded-full hover:bg-white/60 transition-all w-full sm:w-auto flex items-center justify-center gap-2"
          >
            See the evidence
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
            className="absolute left-4 top-4 flex items-center gap-1 rounded-full bg-white/70 p-1 backdrop-blur-md border border-white/60 shadow-sm"
            role="group"
            aria-label="Compare editions"
          >
            {(Object.keys(editions) as Edition[]).map((key) => (
              <button
                aria-pressed={edition === key}
                className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
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
