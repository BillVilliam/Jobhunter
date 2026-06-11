import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { WatcherConfig } from "@shared/schema";
import {
  Briefcase,
  Eye,
  Send,
  CheckCircle,
  Radar,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useScanStore, startScan, stopScan } from "@/lib/scan-store";
import type { JobListing } from "@shared/schema";

interface DashboardData {
  stats: { total: number; new: number; applied: number; interview: number; ignored: number };
  recentJobs: JobListing[];
  cvCount: number;
  activeWatchers: number;
  totalWatchers: number;
}

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  applied: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  interview: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  ignored: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/30 dark:text-zinc-400",
};

const statusLabels: Record<string, string> = {
  new: "Nová",
  applied: "Odoslaná",
  interview: "Pohovor",
  rejected: "Zamietnutá",
  ignored: "Ignorovaná",
};

export default function Dashboard() {
  const { toast } = useToast();
  const scan = useScanStore();
  const prevPendingRef = useRef(scan.isPending);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
  });

  // ── Mandatory country gate before scanning ──
  // Country decides WHICH portals are searched. Watchers without a country
  // and without a location (to detect it from) cannot scan — the user must
  // pick 🇨🇿 or 🇸🇰 first, otherwise the scan is refused.
  const [showCountryDialog, setShowCountryDialog] = useState(false);

  // Credit balance — AI actions (scan, CV analysis, cover letters) spend credits
  const { data: credits } = useQuery<{ balance: number; tokensPerCredit: number }>({
    queryKey: ["/api/credits"],
  });
  const { data: allWatchers = [] } = useQuery<WatcherConfig[]>({
    queryKey: ["/api/watchers"],
  });
  const watchersMissingCountry = allWatchers.filter(
    (w) =>
      w.isActive &&
      !["cz", "sk", "both"].includes((w as any).country ?? "") &&
      !(w.location ?? "").trim(),
  );

  const handleScanClick = () => {
    if (scan.isPending) return stopScan();
    if (watchersMissingCountry.length > 0) {
      setShowCountryDialog(true);
      return;
    }
    startScan();
  };

  const chooseCountryAndScan = async (country: "cz" | "sk") => {
    try {
      await Promise.all(
        watchersMissingCountry.map((w) =>
          apiRequest("PATCH", `/api/watchers/${w.id}`, { country }),
        ),
      );
      queryClient.invalidateQueries({ queryKey: ["/api/watchers"] });
      setShowCountryDialog(false);
      startScan();
    } catch {
      toast({ title: "Nepodarilo sa uložiť krajinu", variant: "destructive" });
    }
  };

  // Show toast when scan finishes (transition from pending → done)
  useEffect(() => {
    if (prevPendingRef.current && !scan.isPending) {
      if (scan.error) {
        toast({ title: "Scan zlyhal", description: scan.error, variant: "destructive" });
      } else if (scan.result?.error) {
        toast({ title: "Chyba pri scane", description: scan.result.error, variant: "destructive" });
      } else if (scan.result?.message === "Scan zastavený") {
        toast({
          title: "Scan zastavený ⏹",
          description: `Uložených: ${scan.result.totalSaved} ponúk (zastavené predčasne)`,
        });
      } else if (scan.result) {
        toast({
          title: "Scan dokončený ✓",
          description: `Nájdených: ${scan.result.totalFound}, uložených: ${scan.result.totalSaved}`,
        });
      }
    }
    prevPendingRef.current = scan.isPending;
  }, [scan.isPending, scan.error, scan.result, toast]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold" data-testid="page-title">Dashboard</h1>
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const stats = data?.stats || { total: 0, new: 0, applied: 0, interview: 0, ignored: 0 };
  const hasWatchers = (data?.totalWatchers ?? 0) > 0;

  return (
    <div className="space-y-6 relative stagger-in">
      {/* ─── Dollar rain animation ─── */}
      {scan.showDollarRain && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 40 }).map((_, i) => {
            const left = Math.random() < 0.5
              ? Math.random() * 18          // left side 0–18%
              : 82 + Math.random() * 18;    // right side 82–100%
            const delay = Math.random() * 1.5;
            const duration = 2 + Math.random() * 2;
            const size = 16 + Math.random() * 20;
            const rotate = Math.random() * 60 - 30;
            return (
              <span
                key={i}
                className="absolute text-green-500/80 select-none"
                style={{
                  left: `${left}%`,
                  top: `-${size}px`,
                  fontSize: `${size}px`,
                  animation: `dollarFall ${duration}s ease-in ${delay}s forwards`,
                  transform: `rotate(${rotate}deg)`,
                }}
              >
                💵
              </span>
            );
          })}
          <style>{`
            @keyframes dollarFall {
              0% { top: -40px; opacity: 1; }
              80% { opacity: 1; }
              100% { top: 105vh; opacity: 0; }
            }
          `}</style>
        </div>
      )}

      {/* ─── Scanner hero area ─── */}
      <Card className="border-card-border overflow-hidden">
        <CardContent className="p-0">
          <div className="flex flex-col items-center justify-center py-6 px-6 relative">
            {/* Wrapper so all animations orbit around the button center */}
            <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
              {/* ── Scan animation ── */}
              {scan.isPending && (
                <>
                  {/* Concentric sonar rings – centered on the button */}
                  {[1, 2, 3].map((i) => {
                    const d = 90 + i * 40;
                    return (
                      <div
                        key={i}
                        className="absolute rounded-full border border-emerald-700/20 pointer-events-none"
                        style={{
                          width: `${d}px`,
                          height: `${d}px`,
                          top: `calc(50% - ${d / 2}px)`,
                          left: `calc(50% - ${d / 2}px)`,
                          opacity: 0,
                          animation: `sonarRing 3s ease-out ${i * 0.8}s infinite`,
                        }}
                      />
                    );
                  })}
                  {/* Opportunity dots – spawn OUTSIDE the scan circle (r=64px), ring 70-110px */}
                  {Array.from({ length: 10 }).map((_, i) => {
                    const angle = (i * 36 + 15) * (Math.PI / 180);
                    const radius = 70 + (i % 3) * 20;
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;
                    const delay = 0.3 + i * 0.5;
                    const size = 3 + (i % 3) * 2;
                    return (
                      <div
                        key={`dot-${i}`}
                        className="absolute pointer-events-none"
                        style={{
                          width: `${size}px`,
                          height: `${size}px`,
                          borderRadius: "50%",
                          background: "rgba(16, 145, 102, 0.55)",
                          left: `calc(50% + ${x}px - ${size / 2}px)`,
                          top: `calc(50% + ${y}px - ${size / 2}px)`,
                          opacity: 0,
                          animation: `dotBlip 2.5s ease-in-out ${delay}s infinite`,
                          boxShadow: "0 0 6px 1px rgba(16, 145, 102, 0.35)",
                        }}
                      />
                    );
                  })}
                  {/* Radar sweep – rotates from button center, extends beyond */}
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      width: 220,
                      height: 220,
                      top: 0,
                      left: 0,
                      animation: "sweepRotate 2.5s linear infinite",
                      transformOrigin: "center center",
                    }}
                  >
                    <svg viewBox="0 0 220 220" className="w-full h-full">
                      <defs>
                        <radialGradient id="sweepGrad" cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
                          <stop offset="35%" stopColor="#10b981" stopOpacity="0.04" />
                          <stop offset="100%" stopColor="#34d399" stopOpacity="0.14" />
                        </radialGradient>
                      </defs>
                      <path
                        d="M 110 110 L 110 0 A 110 110 0 0 1 205 55 Z"
                        fill="url(#sweepGrad)"
                      />
                    </svg>
                  </div>
                  <style>{`
                    @keyframes sonarRing {
                      0% { transform: scale(0.6); opacity: 0.5; }
                      100% { transform: scale(1.2); opacity: 0; }
                    }
                    @keyframes sweepRotate {
                      from { transform: rotate(0deg); }
                      to { transform: rotate(360deg); }
                    }
                    @keyframes scanGlow {
                      0%, 100% { box-shadow: 0 0 20px 0 rgba(16, 145, 102, 0.25); transform: scale(0.97); }
                      50% { box-shadow: 0 0 35px 6px rgba(16, 145, 102, 0.4); transform: scale(1.01); }
                    }
                    @keyframes dotBlip {
                      0%, 100% { opacity: 0; transform: scale(0.5); }
                      15% { opacity: 0.9; transform: scale(1.2); }
                      40% { opacity: 0.5; transform: scale(1); }
                      70% { opacity: 0.2; transform: scale(0.8); }
                    }
                  `}</style>
                </>
              )}

              {/* Main scan button – always centered in the 220px wrapper */}
              <button
                className={`relative z-10 flex items-center justify-center w-28 h-28 rounded-full shadow-xl transition-all duration-200 ${
                  scan.isPending
                    ? "bg-primary/80 shadow-primary/30 shadow-2xl cursor-pointer"
                    : hasWatchers
                      ? "bg-primary hover:bg-primary/90 hover:scale-105 active:scale-95 cursor-pointer shadow-primary/15"
                      : "bg-muted cursor-not-allowed"
                }`}
                style={scan.isPending ? { animation: "scanGlow 2s ease-in-out infinite" } : undefined}
                disabled={!hasWatchers}
                onClick={handleScanClick}
                data-testid="scan-button"
              >
                {hasWatchers ? (
                  <Radar className="w-10 h-10 text-primary-foreground relative z-10" />
                ) : (
                  <WifiOff className="w-10 h-10 text-muted-foreground" />
                )}
              </button>
            </div>

            <p className="mt-3 font-serif text-lg font-semibold tracking-tight">
              {scan.isPending ? "Skenujem ponuky…" : "SCAN"}
            </p>
            {scan.isPending && (
              <p className="text-xs text-muted-foreground mt-1 tabular-nums">{scan.seconds}s</p>
            )}

            {/* ── Live scan progress ── */}
            {scan.isPending && scan.progress && (
              <div className="mt-3 text-center space-y-1">
                {scan.progress.phase === "scraping" && (
                  <p className="text-xs text-muted-foreground">
                    🔍 Prehľadávam portály…
                  </p>
                )}
                {scan.progress.phase === "analyzing" && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      🔍 <span className="font-semibold text-foreground">{scan.progress.totalFound}</span> nájdených
                      {scan.progress.totalNewJobs > 0 && (
                        <span className="text-green-600 dark:text-green-400"> · <span className="font-semibold">{scan.progress.totalNewJobs}</span> nových</span>
                      )}
                      {scan.progress.totalNewJobs === 0 && (
                        <span className="text-muted-foreground"> · 0 nových</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      🤖 Analyzujem: <span className="font-semibold text-foreground">{scan.progress.analyzed}</span> / {scan.progress.total}
                    </p>
                    {scan.progress.totalSaved > 0 && (
                      <p className="text-xs text-green-600 dark:text-green-400">
                        ✓ Uložených: <span className="font-semibold">{scan.progress.totalSaved}</span>
                      </p>
                    )}
                    {/* Mini progress bar */}
                    {scan.progress.total > 0 && (
                      <div className="w-40 mx-auto h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-300"
                          style={{ width: `${Math.round((scan.progress.analyzed / scan.progress.total) * 100)}%` }}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {!hasWatchers && (
              <p className="text-xs text-muted-foreground mt-1">Najprv vytvor aspoň jeden watcher v sekcii Watchery</p>
            )}
            {hasWatchers && !scan.isPending && !scan.result && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <Wifi className="w-3 h-3" /> {data?.activeWatchers} aktívnych watcherov pripravených
              </p>
            )}

            {/* ── Scan result panel ── */}
            {scan.result && !scan.isPending && (
              <div className="mt-6 w-full max-w-md rounded-lg border border-card-border bg-muted/30 p-5 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {scan.result.message === "Scan zastavený" ? "Scan zastavený" : "Výsledok scanu"}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {scan.result.totalSaved} nových uložených
                  </Badge>
                </div>
                {scan.result.results?.map((r) => (
                  <div key={r.watcherId} className="flex items-center justify-between text-xs text-muted-foreground border-t border-card-border pt-2">
                    <span className="font-medium text-foreground">{r.watcherName}</span>
                    <span>
                      {r.result.found} nájd. · {r.result.saved} nových
                      {r.result.skippedDuplicates > 0 && <span className="ml-1">· {r.result.skippedDuplicates} dup.</span>}
                      {r.result.errors.length > 0 && (
                        <span className="text-red-500 ml-1">· {r.result.errors.length} chýb</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Compact stats row ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="stats-grid">
        {[
          { label: "Nové",     value: stats.new,                 icon: Briefcase,   color: "text-blue-500",  bg: "bg-blue-500/10" },
          { label: "Odoslané", value: stats.applied,             icon: Send,        color: "text-amber-500", bg: "bg-amber-500/10" },
          { label: "Pohovory", value: stats.interview,           icon: CheckCircle, color: "text-green-500", bg: "bg-green-500/10" },
          { label: "Watchery", value: data?.activeWatchers ?? 0, icon: Eye,         color: "text-primary",   bg: "bg-primary/10" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="border-card-border">
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${stat.bg}`}>
                  <Icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="stat-numeral text-[28px] leading-none">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ─── Extra counters ─── */}
      <div className="flex items-center justify-center gap-6 text-[11px] text-muted-foreground">
        <span>{stats.total} celkovo</span>
        <span>·</span>
        <span>{data?.cvCount ?? 0} CV</span>
        <span>·</span>
        <span>{data?.activeWatchers ?? 0} watcherov</span>
        {credits && (
          <>
            <span>·</span>
            <span
              className={credits.balance <= 0 ? "text-red-500 font-semibold" : ""}
              title={`1 kredit = ${credits.tokensPerCredit.toLocaleString()} AI tokenov (pomer sa dá zmeniť v nastaveniach)`}
              data-testid="credit-balance"
            >
              💳 {credits.balance.toFixed(1)} kreditov
            </span>
          </>
        )}
      </div>

      {/* ─── Recent jobs ─── */}
      {data?.recentJobs && data.recentJobs.length > 0 && (
        <Card className="border-card-border">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="font-serif text-base font-semibold tracking-tight">Posledné ponuky</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="space-y-1">
              {data.recentJobs.slice(0, 8).map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 transition-colors"
                  data-testid={`job-row-${job.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{job.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{job.company} · {job.location}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    {job.matchScore !== null && (
                      <span className="text-[11px] font-mono text-muted-foreground">{job.matchScore}%</span>
                    )}
                    <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${statusColors[job.status] || ""}`}>
                      {statusLabels[job.status] || job.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Mandatory country choice before scan ── */}
      <Dialog
        open={showCountryDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowCountryDialog(false);
            toast({
              title: "Scan zrušený",
              description: "Bez zvolenej krajiny (🇨🇿/🇸🇰) nie je možné skenovať.",
              variant: "destructive",
            });
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>V ktorej krajine hľadáš prácu?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Niektoré watchery nemajú nastavenú krajinu ani lokalitu. Krajina určuje,
            ktoré pracovné portály sa prehľadajú — bez nej sken nie je možný.
          </p>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Button
              variant="outline"
              className="h-16 text-base"
              onClick={() => chooseCountryAndScan("cz")}
              data-testid="country-cz-button"
            >
              🇨🇿 Česko
            </Button>
            <Button
              variant="outline"
              className="h-16 text-base"
              onClick={() => chooseCountryAndScan("sk")}
              data-testid="country-sk-button"
            >
              🇸🇰 Slovensko
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
