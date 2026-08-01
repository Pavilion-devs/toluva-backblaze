import Link from "next/link";

export function MarketingNav() {
  return (
    <nav className="w-full px-6 py-6 md:px-12 flex items-center justify-between max-w-7xl mx-auto animate-fade-in">
      <Link href="/" className="flex items-center gap-2">
        <span className="w-6 h-6 bg-black rounded-tr-lg rounded-bl-lg" />
        <span className="text-xl font-bold text-slate-900 tracking-tight font-display">
          Toluva
        </span>
      </Link>
      <div className="hidden md:flex items-center gap-8 text-[15px] font-medium text-slate-700">
        <a href="#how" className="hover:text-black transition-colors">
          How it works
        </a>
        <a href="#evidence" className="hover:text-black transition-colors">
          Evidence
        </a>
        <a href="#features" className="hover:text-black transition-colors">
          Features
        </a>
        <a
          href="https://github.com/Pavilion-devs/toluva-backblaze"
          className="hover:text-black transition-colors"
        >
          Source
        </a>
      </div>
      <div>
        <Link
          href="/workspace/new"
          className="inline-block bg-ink text-white text-[15px] font-medium px-6 py-2.5 rounded-full hover:bg-black transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
        >
          Get started
        </Link>
      </div>
    </nav>
  );
}
