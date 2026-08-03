import type { Metadata } from "next";
import { DocsSidebar } from "./_components/docs-sidebar";
import { DocsTopbar } from "./_components/docs-topbar";
import { PrevNext } from "./_components/prev-next";
import { Toc } from "./_components/toc";

export const metadata: Metadata = {
  description:
    "Documentation for Toluva — a governed video-localization workflow with consent-bound synthetic voice, measured timing QA, and verifiable media lineage.",
  title: { default: "Toluva Docs", template: "%s · Toluva Docs" },
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-ink">
      <DocsTopbar />
      <div className="mx-auto flex w-full max-w-[1600px]">
        <DocsSidebar />
        <main className="min-w-0 flex-1 px-5 py-10 sm:px-6 lg:px-12">
          <article className="mx-auto max-w-3xl" id="doc-article">
            {children}
            <PrevNext />
          </article>
        </main>
        <Toc />
      </div>
    </div>
  );
}
