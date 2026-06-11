import { AppSidebar } from "./app-sidebar";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-8 max-w-[1080px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
