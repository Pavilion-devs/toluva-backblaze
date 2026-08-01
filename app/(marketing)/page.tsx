import { FeatureGrid } from "./_components/feature-grid";
import { Hero } from "./_components/hero";
import { MarketingNav } from "./_components/marketing-nav";
import { Pillars } from "./_components/pillars";
import { ProofBand } from "./_components/proof-band";
import { RunShowcase } from "./_components/run-showcase";
import { SiteFooter } from "./_components/site-footer";
import { StageWheel } from "./_components/stage-wheel";

export default function LandingPage() {
  return (
    <div className="antialiased min-h-screen overflow-x-hidden selection:bg-black selection:text-white text-slate-800 relative">
      <div className="sky-backdrop fixed inset-0 z-0 pointer-events-none" />
      <div className="relative z-10 flex flex-col min-h-screen">
        <MarketingNav />
        <Hero />
        <Pillars />
        <RunShowcase />
        <FeatureGrid />
        <ProofBand />
        <StageWheel />
        <div className="bg-cream w-full">
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}
