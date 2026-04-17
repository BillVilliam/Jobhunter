import { AppSidebar } from "./app-sidebar";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-[1200px]">
          {children}
        </div>
      </main>
    </div>
  );
}
