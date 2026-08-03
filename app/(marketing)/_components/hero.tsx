import Link from "next/link";

export function Hero() {
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
          <video
            aria-label="Toluva product walkthrough showing the localization workflow"
            autoPlay
            className="absolute inset-0 h-full w-full rounded-xl bg-ink object-cover shadow-[0_30px_60px_-15px_rgba(0,0,0,0.25)]"
            controls
            loop
            muted
            playsInline
            poster="/toluva-product-walkthrough-cover.jpg"
            preload="metadata"
            src="/toluva-product-walkthrough.mp4"
          />
        </div>
        <p className="mt-4 text-center text-[13px] font-medium text-slate-500">
          Toluva in action · entrant-recorded product walkthrough
        </p>
      </div>
    </main>
  );
}
