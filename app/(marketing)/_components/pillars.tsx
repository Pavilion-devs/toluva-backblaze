const pillars = [
  {
    body: "Voice authorization is an active generation control, not metadata. Language, purpose, validity window, and the consent-evidence hash are all checked before a provider is ever called.",
    icon: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    title: "Consent-bound voice",
  },
  {
    body: "Every translated segment is measured against its source slot. Drift outside the band triggers a bounded rewrite and regeneration loop — red to green, with each attempt kept.",
    icon: (
      <>
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </>
    ),
    title: "Measured timing QA",
  },
  {
    body: "Backblaze B2 holds source masters, transcripts, every speech attempt, captions, renders, and canonical Genblaze manifests. Stored hashes are re-checked before bytes are called verified.",
    icon: (
      <>
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v14a9 3 0 0 0 18 0V5" />
        <path d="M3 12a9 3 0 0 0 18 0" />
      </>
    ),
    title: "Verifiable lineage",
  },
];

export function Pillars() {
  return (
    <section className="w-full max-w-7xl mx-auto px-4 md:px-6 py-24 relative z-10">
      <div className="text-center max-w-3xl mx-auto mb-16 animate-fade-in">
        <span className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-4 block">
          One governed lane
        </span>
        <h2 className="md:text-5xl text-3xl font-semibold text-ink tracking-tight font-display mb-6">
          Not a dubbing button. A chain of custody.
        </h2>
        <p className="text-lg text-slate-600 font-medium">
          Anyone can generate a translated voice track. Toluva can show you
          exactly how it was produced, who approved it, and what changed when it
          did not fit.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {pillars.map((pillar) => (
          <div
            className="bg-white/80 backdrop-blur-md rounded-card p-8 border border-white/60 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group relative overflow-hidden"
            key={pillar.title}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white via-transparent to-transparent opacity-50 pointer-events-none" />
            <div className="w-14 h-14 bg-cream rounded-2xl flex items-center justify-center mb-6 text-slate-900 shadow-sm group-hover:scale-110 transition-transform duration-300 border border-white">
              <svg
                aria-hidden="true"
                fill="none"
                height="24"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="24"
                xmlns="http://www.w3.org/2000/svg"
              >
                {pillar.icon}
              </svg>
            </div>
            <h3 className="text-xl font-bold text-ink font-display mb-3">
              {pillar.title}
            </h3>
            <p className="text-[15px] leading-relaxed text-slate-600">
              {pillar.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
