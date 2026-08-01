/*
 * The template's vertical word-wheel, which scrolled competitor names. Spun
 * here through the real pipeline stages from lib/verified-run.ts so the motion
 * carries the product story instead of a comparison claim.
 */
const stages = [
  "Ingest",
  "Transcribe",
  "Translate",
  "Authorize",
  "Time-fit QA",
  "Master",
];

const emphasis = ["opacity-20 blur-[1px]", "opacity-40", "", "opacity-40", "opacity-20 blur-[1px]", "opacity-20 blur-[1px]"];

export function StageWheel() {
  return (
    <section className="overflow-hidden bg-cream w-full z-10 border-white/40 border-t pt-20 sm:pt-26 md:pt-32 pb-0 relative">
      <div className="max-w-7xl mx-auto px-4 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16 relative z-20">
          <span className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-4 block">
            Every stage leaves a receipt
          </span>
          <h2 className="text-[30px] sm:text-4xl md:text-5xl leading-[1.15] font-semibold text-ink tracking-tight font-display mb-6">
            Six stages. Nothing unrecorded.
          </h2>
        </div>

        <div className="relative w-full max-w-5xl mx-auto h-[460px] flex items-center justify-center overflow-hidden mb-24 select-none">
          <div className="absolute top-0 left-0 right-0 h-[38%] bg-gradient-to-b from-cream via-cream/90 to-transparent z-10 backdrop-blur-[2px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 h-[38%] bg-gradient-to-t from-cream via-cream/90 to-transparent z-10 backdrop-blur-[2px] pointer-events-none" />
          <div className="flex flex-col items-center gap-8 animate-wheel will-change-transform">
            {[...stages, ...stages].map((stage, index) => (
              <div
                className={`text-6xl md:text-8xl font-bold font-display text-ink tracking-tight whitespace-nowrap ${emphasis[index % stages.length]}`}
                key={`${stage}-${index}`}
              >
                {stage}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
