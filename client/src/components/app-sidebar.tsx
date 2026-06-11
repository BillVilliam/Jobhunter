import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  FileText,
  Briefcase,
  Eye,
  Moon,
  Sun,
} from "lucide-react";
import { useTheme } from "./theme-provider";
import { Button } from "@/components/ui/button";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/jobs", label: "Ponuky", icon: Briefcase },
  { path: "/cv", label: "CV Databáza", icon: FileText },
  { path: "/watchers", label: "Watchery", icon: Eye },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <aside
      className="flex flex-col w-60 min-h-screen bg-sidebar border-r border-sidebar-border"
      data-testid="app-sidebar"
    >
      {/* Wordmark */}
      <div className="px-6 pt-7 pb-6">
        <Link href="/">
          <div className="cursor-pointer select-none" data-testid="app-title">
            <span className="font-serif text-[22px] font-semibold tracking-tight text-sidebar-foreground leading-none">
              Job<span className="italic text-primary">Hunter</span>
            </span>
            <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              AI Job Scout
            </p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-0.5" data-testid="sidebar-nav">
        {navItems.map((item) => {
          const isActive =
            item.path === "/"
              ? location === "/"
              : location === item.path || location.startsWith(item.path + "/");
          const Icon = item.icon;
          return (
            <Link key={item.path} href={item.path}>
              <div
                className={`group relative flex items-center gap-3 px-3 py-2 rounded-md text-[13.5px] transition-all duration-150 cursor-pointer ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "text-muted-foreground font-medium hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
                }`}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                {/* Active indicator — small ink dot */}
                <span
                  className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-full bg-primary transition-all duration-200 ${
                    isActive ? "h-4 opacity-100" : "h-0 opacity-0"
                  }`}
                />
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground/70 group-hover:text-sidebar-foreground"
                  }`}
                />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-sidebar-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          className="w-full justify-start gap-3 text-muted-foreground hover:text-sidebar-foreground"
          data-testid="theme-toggle"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === "dark" ? "Svetlý režim" : "Tmavý režim"}
        </Button>
      </div>
    </aside>
  );
}
