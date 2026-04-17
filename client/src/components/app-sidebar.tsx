import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  FileText,
  Briefcase,
  Eye,
  User,
  Moon,
  Sun,
  Target,
} from "lucide-react";
import { useTheme } from "./theme-provider";
import { Button } from "@/components/ui/button";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/jobs", label: "Ponuky", icon: Briefcase },
  { path: "/cv", label: "CV Databáza", icon: FileText },
  { path: "/watchers", label: "Watchery", icon: Eye },
  { path: "/profile", label: "Profil", icon: User },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-sidebar border-r border-sidebar-border" data-testid="app-sidebar">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary">
          <Target className="w-4.5 h-4.5 text-primary-foreground" />
        </div>
        <span className="text-base font-semibold tracking-tight text-sidebar-foreground" data-testid="app-title">
          JobHunter
        </span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1" data-testid="sidebar-nav">
        {navItems.map((item) => {
          const isActive = item.path === "/" ? location === "/" : location === item.path || location.startsWith(item.path + "/");
          const Icon = item.icon;
          return (
            <Link key={item.path} href={item.path}>
              <div
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <Icon className="w-4 h-4 shrink-0" />
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
