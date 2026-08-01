import {
  liveIntakeEnabled,
  publicDailyJobLimit,
} from "../../lib/runtime-mode";
import {
  WorkspaceMobileNav,
  WorkspaceSidebar,
} from "./_components/workspace-sidebar";
import { WorkspaceProvider } from "./_components/workspace-data";
import { WorkspaceTopbar } from "./_components/workspace-topbar";
import { WorkspaceNotices } from "./_components/workspace-notices";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider
      liveIntakeEnabled={liveIntakeEnabled()}
      publicDailyJobLimit={publicDailyJobLimit()}
    >
      <div className="flex min-h-screen bg-cream">
        <WorkspaceSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <WorkspaceMobileNav />
          <WorkspaceTopbar />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8 md:py-10">
            <WorkspaceNotices />
            {children}
          </main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}
