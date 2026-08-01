import Link from "next/link";

const columns = [
  {
    heading: "Product",
    links: [
      { href: "/workspace", label: "Example project" },
      { href: "/workspace/timing", label: "Timing QA" },
      { href: "/workspace/voice", label: "Voice authorization" },
      { href: "/workspace/provenance", label: "Provenance" },
    ],
  },
  {
    heading: "Information",
    links: [
      {
        href: "https://github.com/Pavilion-devs/toluva-backblaze",
        label: "Source code",
      },
      {
        href: "https://github.com/Pavilion-devs/toluva-backblaze/blob/main/docs/MEDIA_AND_RIGHTS.md",
        label: "Media and rights",
      },
      {
        href: "https://github.com/Pavilion-devs/toluva-backblaze/blob/main/THIRD_PARTY_NOTICES.md",
        label: "Third-party notices",
      },
      {
        href: "https://github.com/Pavilion-devs/toluva-backblaze/blob/main/LICENSE",
        label: "License",
      },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="w-full max-w-7xl z-10 mx-auto pt-36 px-6 pb-12 relative">
      <div className="bg-panel rounded-panel p-8 md:p-12 lg:p-16 shadow-sm border border-white/20">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-24 mb-16 justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2 mb-6">
              <span className="w-6 h-6 bg-ink rounded-tr-md rounded-bl-md" />
              <span className="text-xl font-semibold text-ink tracking-tight font-display">
                Toluva
              </span>
            </div>
            <p className="text-[15px] leading-relaxed text-slate-600 font-medium mb-8">
              A governed video-localization workflow for enterprise training and
              communications teams. Compliance-supporting and evidence-ready —
              not a guarantee of legal compliance.
            </p>
          </div>
          <div className="flex gap-12 sm:gap-24">
            {columns.map((column) => (
              <div className="flex flex-col gap-4" key={column.heading}>
                <h4 className="text-xs font-semibold tracking-widest text-ink uppercase mb-1 font-display">
                  {column.heading}
                </h4>
                {column.links.map((link) =>
                  link.href.startsWith("/") ? (
                    <Link
                      className="text-[15px] text-slate-600 hover:text-ink transition-colors"
                      href={link.href}
                      key={link.label}
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      className="text-[15px] text-slate-600 hover:text-ink transition-colors"
                      href={link.href}
                      key={link.label}
                    >
                      {link.label}
                    </a>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="w-full h-px bg-slate-900/5 mb-8" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-[13px] text-slate-500">
          <div>
            © 2026 Toluva. Source available under the MIT License.
          </div>
          <div className="max-w-md md:text-right">
            Synthetic voice output is disclosed. Model outputs and provider
            services remain subject to their own terms.
          </div>
        </div>
      </div>
    </footer>
  );
}
