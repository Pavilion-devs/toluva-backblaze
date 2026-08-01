const manifests = [
  "transcription",
  "translation ×3",
  "speech ×3",
  "audio fan-in",
  "composition",
];

const objectTypes = [
  "source master",
  "authorization",
  "transcript",
  "quality decision",
  "translation",
  "speech attempt",
  "captions",
  "final render",
  "disclosure",
  "status event",
  "checkpoint",
  "manifest",
];

const smallCards = [
  {
    body: "Failed attempts are never overwritten or hidden. Each retry is a separate run carrying the previous attempt's parent run ID, so the whole correction history stays auditable.",
    path: "M12 8v4l3 3 M3 12a9 9 0 1 0 3-6.7L3 8",
    title: "Append-only attempts",
  },
  {
    body: "Public routes refuse writes before upload, approval, or provider spend. Credentials stay server-side, and media proxies accept fixed kinds or opaque job handles — never arbitrary B2 keys.",
    path: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z M12 9v4 M12 16h.01",
    title: "Fail-closed by default",
  },
  {
    body: "A manifest proves recorded lineage and canonical integrity. It does not prove every supplied fact or guarantee regulatory compliance, and Toluva does not claim otherwise.",
    path: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 15h6",
    title: "Honest about limits",
  },
];

export function FeatureGrid() {
  return (
    <section
      className="md:px-12 z-10 w-full max-w-7xl mx-auto py-24 px-4 relative"
      id="features"
    >
      <div className="text-center max-w-3xl mx-auto mb-20 animate-fade-in">
        <span className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-4 block">
          Under the hood
        </span>
        <h2 className="md:text-[56px] leading-[1.1] text-4xl font-semibold text-ink tracking-tight font-display mb-6">
          Built so the receipts survive the demo
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-[#F2EBE5] rounded-card p-8 md:p-12 flex flex-col justify-between hover:shadow-xl transition-all duration-500 hover:-translate-y-1 group border border-transparent hover:border-slate-200/50">
          <h3 className="md:text-[28px] leading-tight text-2xl font-semibold text-ink font-display max-w-md mb-10">
            Nine Genblaze runs, one verified composition
          </h3>
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100/50 mb-10 relative overflow-hidden transition-transform duration-500 group-hover:scale-[1.02]">
            <div className="flex flex-col gap-3">
              {manifests.map((manifest, index) => (
                <div className="flex items-center gap-3" key={manifest}>
                  <span className="w-7 h-7 shrink-0 rounded-full bg-ink text-white text-[11px] font-bold flex items-center justify-center font-mono">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm font-semibold text-slate-700 capitalize">
                    {manifest}
                  </span>
                  <span className="ml-auto text-fit-green" aria-hidden="true">
                    <svg
                      fill="none"
                      height="16"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="3"
                      viewBox="0 0 24 24"
                      width="16"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[17px] leading-relaxed text-slate-600">
            Transcription, three translations, three speech runs, the
            source-timed audio fan-in, and the three-input video composition.
            Each is its own run with its own canonical manifest, and the app
            re-checks stored media hashes before calling any of it verified.
          </p>
        </div>

        <div className="bg-[#F2EBE5] rounded-card p-8 md:p-12 flex flex-col justify-between hover:shadow-xl transition-all duration-500 hover:-translate-y-1 group border border-transparent hover:border-slate-200/50 relative overflow-hidden">
          <h3 className="md:text-[28px] leading-tight z-10 text-2xl font-semibold text-ink font-display max-w-md mb-10 relative">
            Backblaze B2 is the system of record, not a file dump
          </h3>
          <div className="flex flex-col gap-6 z-0 h-48 mb-6 relative justify-center overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-12 md:w-24 bg-gradient-to-r from-[#F2EBE5] to-transparent z-10" />
            <div className="absolute inset-y-0 right-0 w-12 md:w-24 bg-gradient-to-l from-[#F2EBE5] to-transparent z-10" />
            <div className="flex flex-wrap gap-2 justify-center">
              {objectTypes.map((type) => (
                <span
                  className="rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 shadow-sm"
                  key={type}
                >
                  {type}
                </span>
              ))}
            </div>
          </div>
          <p className="text-[17px] leading-relaxed z-10 text-slate-600 relative">
            Sixty job-scoped objects for a single twelve-second run. Source
            masters, authorization evidence, quality decisions, every speech
            attempt, disclosure records, and canonical manifests all land in B2
            before anything is called finished.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {smallCards.map((card) => (
          <div
            className="bg-[#F2EBE5] rounded-card p-8 md:p-10 flex flex-col items-start gap-4 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 group"
            key={card.title}
          >
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
              <svg
                aria-hidden="true"
                className="text-slate-800"
                fill="none"
                height="22"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="22"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d={card.path} />
              </svg>
            </div>
            <h4 className="text-lg font-bold text-slate-900 font-display">
              {card.title}
            </h4>
            <p className="text-[15px] leading-relaxed text-slate-600">
              {card.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
