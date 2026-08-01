import Link from "next/link";

/*
 * The verified red-to-green correction archive, not the three main-run
 * segments. Values mirror `timingCorrectionProof` in lib/verified-run.ts.
 */
const attempts = [
  {
    band: "red" as const,
    drift: "+113.87%",
    generated: "8.127s",
    title: "Willkommen bei Toluva. Mit unserer Plattform wird eine einzige…",
    verdict: "Attempt 1 · blocked",
  },
  {
    band: "green" as const,
    drift: "−5.90%",
    generated: "3.576s",
    title: "Willkommen bei Toluva. Eine Botschaft, viele Sprachen.",
    verdict: "Attempt 2 · approved rewrite",
  },
];

const bandStyles = {
  green: "bg-fit-green-soft border-fit-green/20 text-fit-green",
  amber: "bg-fit-amber-soft border-fit-amber/20 text-fit-amber",
  red: "bg-fit-red-soft border-fit-red/20 text-fit-red",
};

const capabilities = [
  { label: "Drift bands", path: "M3 3v18h18 M7 14l3-3 3 3 4-5" },
  { label: "Bounded retries", path: "M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5" },
  { label: "Protected terms", path: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" },
  { label: "Human approval", path: "M20 6 9 17l-5-5" },
];

const summary = [
  { detail: "Faster Whisper base.en", label: "3 segments" },
  { detail: "Argos en_de package 1.3", label: "Translated" },
  { detail: "ElevenLabs Flash v2.5", label: "189 characters" },
  { detail: "H.264 · AAC · mov_text", label: "12.419s master" },
];

function MockFrame({
  children,
  tilt,
}: {
  children: React.ReactNode;
  tilt: string;
}) {
  return (
    <div className="w-full lg:w-[55%] relative group">
      <div
        className={`absolute inset-0 bg-gradient-to-br from-[#9AC1EB] via-[#C5DFF7] to-[#EFE6D8] rounded-panel transform ${tilt} transition-transform duration-700 group-hover:rotate-0`}
      />
      <div className="md:p-12 transition-transform duration-500 hover:scale-[1.01] bg-gradient-to-br from-[#9AC1EB] via-[#C5DFF7] to-[#EFE6D8] rounded-3xl p-4 sm:p-6 relative shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)]">
        {children}
      </div>
    </div>
  );
}

export function RunShowcase() {
  return (
    <section
      className="w-full max-w-7xl mx-auto px-5 sm:px-6 md:px-12 py-16 sm:py-20 md:py-24 relative z-10"
      id="how"
    >
      <div className="flex flex-col lg:flex-row items-center gap-10 sm:gap-12 lg:gap-24 mb-20 sm:mb-24 md:mb-32">
        <MockFrame tilt="rotate-1">
          <div className="overflow-hidden bg-white max-w-lg border-white/60 border rounded-2xl mx-auto shadow-xl">
            <div className="border-slate-100 border-b p-6">
              <div className="flex items-center justify-between mb-1 gap-3">
                <h3 className="font-bold text-lg text-slate-900 font-display">
                  Correction proof
                </h3>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-fit-green-soft border border-fit-green/20 px-2.5 py-1 text-[10px] font-bold text-fit-green">
                  <span className="w-1.5 h-1.5 rounded-full bg-fit-green" />
                  B2 VERIFIED
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500">
                One 3.800s source slot · protected term{" "}
                <span className="font-mono">Toluva</span>
              </p>
            </div>
            <div className="bg-slate-50/60 pb-2">
              <div className="grid grid-cols-[1.6fr_0.7fr_0.8fr] gap-3 px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <div>Attempt</div>
                <div className="text-right">Speech</div>
                <div className="text-right">Drift</div>
              </div>
              <div className="bg-white border-t border-slate-100 shadow-sm">
                {attempts.map((attempt) => (
                  <div
                    className="grid grid-cols-[1.6fr_0.7fr_0.8fr] gap-3 px-6 py-4 items-center border-b border-slate-50 last:border-b-0"
                    key={attempt.verdict}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[13px] text-slate-900 truncate">
                        {attempt.title}
                      </p>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        {attempt.verdict}
                      </span>
                    </div>
                    <div className="text-right font-mono text-[11px] text-slate-500">
                      {attempt.generated}
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 font-mono text-[11px] font-bold ${bandStyles[attempt.band]}`}
                      >
                        {attempt.drift}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 px-6 py-4 text-[11px] font-medium text-slate-500">
              <span>Green ≤ 8% · Amber ≤ 15% · Red &gt; 15%</span>
              <span className="font-mono">2 attempts kept</span>
            </div>
          </div>
        </MockFrame>

        <div className="w-full lg:w-[45%]">
          <span className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-4 block">
            Timing-drift control
          </span>
          <h2 className="text-[30px] sm:text-4xl lg:text-[46px] leading-[1.15] font-semibold text-ink tracking-tight font-display mb-6">
            A segment that overran by 113% is now in the green
          </h2>
          <p className="leading-relaxed text-lg font-medium text-slate-600 mb-10">
            The German for one 3.8-second slot generated 8.127 seconds of
            speech. Toluva measured it, blocked the next billable call, and
            waited for a hash-bound human-approved rewrite. The shorter revision
            generated 3.576 seconds — a −5.9% fit. Both attempts are still on
            the record.
          </p>
          <Link
            href="/workspace/timing"
            className="inline-block bg-ink text-white px-8 py-3.5 rounded-full text-[15px] font-semibold hover:bg-black transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 mb-12"
          >
            Inspect the correction proof
          </Link>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {capabilities.map((capability) => (
              <div
                className="flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-slate-100 bg-white/50 hover:bg-white hover:shadow-md hover:border-slate-200 transition-all"
                key={capability.label}
              >
                <svg
                  aria-hidden="true"
                  className="text-slate-800 shrink-0"
                  fill="none"
                  height="20"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  viewBox="0 0 24 24"
                  width="20"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d={capability.path} />
                </svg>
                <span className="text-sm font-semibold text-slate-700">
                  {capability.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse lg:flex-row items-center gap-12 lg:gap-24">
        <div className="w-full lg:w-[45%]">
          <span className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-4 block">
            Authorization gate
          </span>
          <h2 className="text-[30px] sm:text-4xl lg:text-[46px] leading-[1.15] font-semibold text-ink tracking-tight font-display mb-6">
            The wrong language never reaches the provider
          </h2>
          <p className="text-lg text-slate-600 font-medium mb-10 leading-relaxed">
            Every generation request is evaluated against the stored
            authorization — permitted languages, approved purposes, validity
            window, revocation, and the evidence hash. A request outside that
            scope is refused before a single credit is spent, and the refusal is
            recorded too.
          </p>
          <Link
            href="/workspace/voice"
            className="inline-block bg-ink text-white px-8 py-3.5 rounded-full text-[15px] font-semibold hover:bg-black transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 mb-12"
          >
            Test the boundary
          </Link>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {["German · allowed", "French · blocked", "Spanish · blocked", "Japanese · blocked"].map(
              (label) => {
                const allowed = label.includes("allowed");
                return (
                  <div
                    className="flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-slate-100 bg-white/50 hover:bg-white hover:shadow-md hover:border-slate-200 transition-all"
                    key={label}
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${allowed ? "bg-fit-green" : "bg-fit-red"}`}
                    />
                    <span className="text-sm font-semibold text-slate-700">
                      {label}
                    </span>
                  </div>
                );
              },
            )}
          </div>
        </div>

        <MockFrame tilt="-rotate-1">
          <div className="bg-white max-w-lg border-white/60 border rounded-2xl mx-auto p-8 shadow-xl">
            <h3 className="font-bold text-lg text-slate-900 mb-8 font-display">
              Run summary
            </h3>
            <div className="grid grid-cols-2 gap-y-10 gap-x-6 mb-10 border-b border-slate-100 pb-10">
              {summary.map((item) => (
                <div className="flex items-start gap-4" key={item.label}>
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                    <svg
                      aria-hidden="true"
                      fill="none"
                      height="20"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      viewBox="0 0 24 24"
                      width="20"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-[16px] font-bold font-display text-slate-900 leading-tight mb-1.5">
                      {item.label}
                    </div>
                    <div className="text-xs font-semibold text-slate-500">
                      {item.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-cream border border-slate-100 p-5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-2">
                Final MP4 SHA-256
              </span>
              <p className="font-mono text-[11px] leading-relaxed text-slate-700 break-all">
                369f3eea954c2bba91bd7a65cade78a86a9f9e1050cf915702e9a2da2e3917fe
              </p>
            </div>
          </div>
        </MockFrame>
      </div>
    </section>
  );
}
