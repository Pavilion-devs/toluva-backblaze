import Link from "next/link";

/*
 * Occupies the template's testimonial slot. The template shipped four invented
 * quotes from named people behind a `{false && …}` guard; these are measured
 * values from the verified run instead.
 */
const proofs = [
  {
    detail:
      "A controlled English source processed into three timed segments, then recomposed as H.264 video with AAC audio, embedded mov_text captions, and a WebVTT sidecar.",
    label: "English source, start to finish",
    value: "12.419s",
  },
  {
    detail:
      "Source lineage, authorization evidence, transcripts, quality decisions, every speech attempt, captions, renders, and canonical manifests — all job-scoped.",
    label: "Objects written to Backblaze B2",
    value: "60",
  },
  {
    detail:
      "Transcription, three translations, three speech runs, the audio fan-in, and the final composition. Every one independently hash-checked before display.",
    label: "Genblaze manifests, all verified",
    value: "9/9",
  },
  {
    detail:
      "One German attempt overran its 3.800s slot by 113.868%. A protected-term-safe, human-approved rewrite landed at −5.898%. Both attempts remain inspectable.",
    label: "Measured red-to-green correction",
    value: "2 attempts",
  },
];

export function ProofBand() {
  return (
    <section
      className="w-full relative py-16 sm:py-20 md:py-24 z-10 bg-cream border-t border-white/40"
      id="evidence"
    >
      <div className="max-w-4xl mx-auto px-6 text-center mb-14 sm:mb-16 md:mb-20 relative z-10">
        <h2 className="text-[30px] sm:text-4xl md:text-5xl leading-[1.15] font-semibold text-ink tracking-tight font-display mb-10 drop-shadow-sm">
          One approved source. One governed German edition. Every step on the
          record.
        </h2>
        <p className="text-lg text-slate-600 font-medium max-w-2xl mx-auto">
          The submitted deployment proves one complete English-to-German
          production lane. It does not claim universal language support, perfect
          lip sync, or automatic legal compliance.
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 lg:gap-8 mb-12 sm:mb-16">
        {proofs.map((proof) => (
          <div
            className="bg-white p-8 md:p-10 rounded-card shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-300"
            key={proof.label}
          >
            <div className="font-display text-4xl md:text-5xl font-bold text-ink tracking-tight mb-3">
              {proof.value}
            </div>
            <div className="text-sm font-bold text-slate-900 font-display mb-4">
              {proof.label}
            </div>
            <p className="text-[15px] leading-relaxed text-slate-600">
              {proof.detail}
            </p>
          </div>
        ))}
      </div>

      <div className="max-w-4xl mx-auto px-6 text-center">
        <Link
          href="/workspace"
          className="inline-block bg-ink text-white px-8 py-3.5 rounded-full text-[15px] font-semibold hover:bg-black transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
        >
          Explore the example project
        </Link>
        <p className="mt-5 text-[13px] font-medium text-slate-500">
          New jobs use a bounded German lane with rights confirmation,
          synthetic-voice disclosure, daily admission slots, and a hard
          per-job provider budget.
        </p>
      </div>
    </section>
  );
}
