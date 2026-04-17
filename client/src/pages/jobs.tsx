import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ExternalLink, Search, Filter, MapPin, Building2, Clock, Star, Send, ThumbsUp, ThumbsDown, Lightbulb, Tag, CheckCircle, Circle, Trash2, Ban } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { JobListing } from "@shared/schema";

interface AiAnalysis {
  score: number;
  reason: string;
  pros: string[];
  cons: string[];
  suggestedCvHint: string;
  matchedCategories: string[];
  distanceKm?: number | null;
  cvMatchScores?: Record<string, number>;
  workModeMatch?: boolean;
}

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  applied: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  interview: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  ignored: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/30 dark:text-zinc-400",
  disliked: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

const statusLabels: Record<string, string> = {
  new: "Nová",
  applied: "Odoslaná",
  interview: "Pohovor",
  rejected: "Zamietnutá",
  ignored: "Ignorovaná",
  disliked: "Nepáči sa",
};

const portalColors: Record<string, string> = {
  "jobs.cz": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  "startupjobs.cz": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "prace.cz": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
};

const PAGE_SIZE = 50;

export default function Jobs() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [portalFilter, setPortalFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [selectedJob, setSelectedJob] = useState<JobListing | null>(null);
  const { toast } = useToast();

  const { data: jobs = [], isLoading } = useQuery<JobListing[]>({
    queryKey: ["/api/jobs"],
    queryFn: async () => {
      const res = await fetch(`/api/jobs?limit=9999`);
      if (!res.ok) throw new Error("Failed to fetch jobs");
      return res.json();
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PATCH", `/api/jobs/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: number; isFavorite: boolean }) => {
      await apiRequest("PATCH", `/api/jobs/${id}`, { isFavorite });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
  });

  const dislikeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/jobs/${id}`, { status: "disliked" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
  });

  const clearJobsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/jobs/clear");
      return res.json();
    },
    onSuccess: (data: { deleted: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Vyčistené", description: `Odstránených ${data.deleted} ponúk. Odoslané a obľúbené zostali.` });
    },
  });

  const filtered = jobs.filter((job) => {
    const matchSearch = search === "" ||
      job.title.toLowerCase().includes(search.toLowerCase()) ||
      job.company.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all"
      ? job.status !== "disliked"   // hide disliked by default
      : job.status === statusFilter;
    const matchPortal = portalFilter === "all" || job.portal === portalFilter;
    return matchSearch && matchStatus && matchPortal;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedJobs = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [search, statusFilter, portalFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold" data-testid="page-title">Pracovné ponuky</h1>
        <p className="text-sm text-muted-foreground mt-1">Všetky nájdené pracovné ponuky</p>
      </div>

      <div className="flex flex-wrap items-center gap-3" data-testid="filters">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Hľadať podľa názvu alebo firmy..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="search-input"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]" data-testid="status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všetky</SelectItem>
            <SelectItem value="new">Nové</SelectItem>
            <SelectItem value="applied">Odoslané</SelectItem>
            <SelectItem value="interview">Pohovor</SelectItem>
            <SelectItem value="rejected">Zamietnuté</SelectItem>
            <SelectItem value="ignored">Ignorované</SelectItem>
            <SelectItem value="disliked">👎 Nepáči sa</SelectItem>
          </SelectContent>
        </Select>
        <Select value={portalFilter} onValueChange={setPortalFilter}>
          <SelectTrigger className="w-[160px]" data-testid="portal-filter">
            <SelectValue placeholder="Portál" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všetky portály</SelectItem>
            <SelectItem value="jobs.cz">Jobs.cz</SelectItem>
            <SelectItem value="startupjobs.cz">StartupJobs.cz</SelectItem>
            <SelectItem value="prace.cz">Prace.cz</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 ml-auto pr-1">
          <span className="text-xs text-muted-foreground mr-1">{filtered.length} z {jobs.length} ponúk</span>
          <span className="text-muted-foreground/30">|</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ←
            </Button>
            <span className="text-xs text-muted-foreground font-medium px-1 select-none">
              Strana {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              →
            </Button>
          </div>
          <span className="text-muted-foreground/30">|</span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive hover:text-destructive">
                <Trash2 className="w-3 h-3 mr-1" />
                Clear
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Vyčistiť ponuky?</AlertDialogTitle>
                <AlertDialogDescription>
                  Odstránia sa všetky ponuky okrem tých, ktoré sú označené ako <strong>odoslané</strong> alebo <strong>obľúbené ⭐</strong>. Táto akcia je nezvratná.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Zrušiť</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => clearJobsMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Vyčistiť
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-4"><div className="h-12 bg-muted rounded" /></CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-card-border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Search className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">Žiadne ponuky</p>
            <p className="text-xs mt-1">Nastav watcher a ponuky sa tu objavia automaticky</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2" data-testid="jobs-list">
          {pagedJobs.map((job) => (
            <Card
              key={job.id}
              className="border-card-border hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => setSelectedJob(job)}
              data-testid={`job-card-${job.id}`}
            >
              <CardContent className="py-4 px-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold truncate">{job.title}</h3>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {job.company}
                      </span>
                      {job.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {job.location}
                        </span>
                      )}
                      {job.salary && (
                        <span className="font-medium text-foreground">{job.salary}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Favorite toggle */}
                    <button
                      className={`p-1 rounded-full transition-all duration-200 hover:scale-110 ${
                        job.isFavorite
                          ? "text-amber-500 hover:text-amber-600"
                          : "text-muted-foreground/30 hover:text-amber-500"
                      }`}
                      title={job.isFavorite ? "Odstrániť z obľúbených" : "Pridať do obľúbených"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavoriteMutation.mutate({ id: job.id, isFavorite: !job.isFavorite });
                      }}
                      data-testid={`toggle-fav-${job.id}`}
                    >
                      <Star className={`w-4 h-4 ${job.isFavorite ? "fill-amber-500" : ""}`} />
                    </button>
                    {/* Dislike button */}
                    <button
                      className={`p-1 rounded-full transition-all duration-200 hover:scale-110 ${
                        job.status === "disliked"
                          ? "text-rose-500 hover:text-rose-600"
                          : "text-muted-foreground/30 hover:text-rose-500"
                      }`}
                      title={job.status === "disliked" ? "Zrušiť dislike" : "Nepáči sa mi – skryť"}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (job.status === "disliked") {
                          updateStatusMutation.mutate({ id: job.id, status: "new" });
                        } else {
                          dislikeMutation.mutate(job.id);
                        }
                      }}
                      data-testid={`dislike-${job.id}`}
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                    {/* Applied toggle */}
                    <button
                      className={`p-1 rounded-full transition-all duration-200 hover:scale-110 ${
                        job.status === "applied"
                          ? "text-green-500 hover:text-green-600"
                          : "text-muted-foreground/40 hover:text-green-500"
                      }`}
                      title={job.status === "applied" ? "Označená ako odoslaná" : "Označiť ako odoslanú"}
                      onClick={(e) => {
                        e.stopPropagation();
                        const newStatus = job.status === "applied" ? "new" : "applied";
                        updateStatusMutation.mutate({ id: job.id, status: newStatus });
                      }}
                      data-testid={`toggle-applied-${job.id}`}
                    >
                      {job.status === "applied" ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>
                    {job.matchScore !== null && (
                      <div className={`text-xs font-mono font-medium px-2 py-0.5 rounded ${
                        job.matchScore >= 80 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
                        job.matchScore >= 60 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" :
                        "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/30 dark:text-zinc-400"
                      }`}>
                        {job.matchScore}%
                      </div>
                    )}
                    {(() => {
                      try {
                        const a = JSON.parse((job as any).aiAnalysis ?? "null");
                        if (a?.distanceKm != null) return (
                          <div className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            a.distanceKm <= 10 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
                            a.distanceKm <= 30 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" :
                            "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300"
                          }`}>
                            📍{a.distanceKm.toFixed(0)}km
                          </div>
                        );
                      } catch {}
                      return null;
                    })()}
                    <Badge variant="secondary" className={`text-[11px] px-2 py-0.5 ${portalColors[job.portal] || ""}`}>
                      {job.portal}
                    </Badge>
                    <Badge variant="secondary" className={`text-[11px] px-2 py-0.5 ${statusColors[job.status] || ""}`}>
                      {statusLabels[job.status] || job.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Job Detail Dialog */}
      <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedJob && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg">{selectedJob.title}</DialogTitle>
                <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" />
                    {selectedJob.company}
                  </span>
                  {selectedJob.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {selectedJob.location}
                    </span>
                  )}
                </div>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className={portalColors[selectedJob.portal] || ""}>
                    {selectedJob.portal}
                  </Badge>
                  <Badge variant="secondary" className={statusColors[selectedJob.status] || ""}>
                    {statusLabels[selectedJob.status] || selectedJob.status}
                  </Badge>
                  {selectedJob.salary && (
                    <Badge variant="outline">{selectedJob.salary}</Badge>
                  )}
                  {selectedJob.matchScore !== null && (
                    <Badge variant="outline">Match: {selectedJob.matchScore}%</Badge>
                  )}
                </div>

                {selectedJob.description && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Popis</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedJob.description}</p>
                  </div>
                )}

                {/* AI Analysis Panel */}
                {(() => {
                  let analysis: AiAnalysis | null = null;
                  try {
                    analysis = JSON.parse((selectedJob as JobListing & { aiAnalysis?: string }).aiAnalysis ?? "null");
                  } catch {}

                  if (!analysis) return selectedJob.matchReason ? (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">AI Match analýza</h4>
                      <p className="text-sm text-muted-foreground">{selectedJob.matchReason}</p>
                    </div>
                  ) : null;

                  return (
                    <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold">AI Analýza</h4>
                        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                          analysis.score >= 80 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
                          analysis.score >= 60 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" :
                          "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/30 dark:text-zinc-400"
                        }`}>
                          {analysis.score}%
                        </span>
                        {analysis.distanceKm != null && (
                          <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                            analysis.distanceKm <= 5 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
                            analysis.distanceKm <= 15 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" :
                            analysis.distanceKm <= 30 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" :
                            "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300"
                          }`}>
                            📍 {analysis.distanceKm.toFixed(1)} km
                          </span>
                        )}
                        {analysis.workModeMatch !== undefined && (
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            analysis.workModeMatch
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800/30 dark:text-zinc-400"
                          }`}>
                            {analysis.workModeMatch ? "✓ Režim sedí" : "✗ Iný režim"}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{analysis.reason}</p>

                      {/* CV Match Scores */}
                      {analysis.cvMatchScores && Object.keys(analysis.cvMatchScores).length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-muted-foreground mb-1">Zhoda s CV</div>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(analysis.cvMatchScores).map(([name, score]) => (
                              <span key={name} className={`text-xs font-mono px-2 py-0.5 rounded ${
                                score >= 70 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
                                score >= 40 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" :
                                "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/30 dark:text-zinc-400"
                              }`}>
                                📄 {name}: {score}%
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {analysis.pros.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400 mb-1">
                            <ThumbsUp className="w-3 h-3" /> Pozitíva
                          </div>
                          <ul className="space-y-0.5">
                            {analysis.pros.map((p, i) => (
                              <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                                <span className="text-green-500 shrink-0">+</span>{p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {analysis.cons.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1 text-xs font-medium text-red-500 dark:text-red-400 mb-1">
                            <ThumbsDown className="w-3 h-3" /> Negatíva
                          </div>
                          <ul className="space-y-0.5">
                            {analysis.cons.map((c, i) => (
                              <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                                <span className="text-red-400 shrink-0">−</span>{c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {analysis.suggestedCvHint && (
                        <div className="flex items-start gap-1.5 text-xs text-indigo-600 dark:text-indigo-400">
                          <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{analysis.suggestedCvHint}</span>
                        </div>
                      )}

                      {analysis.matchedCategories.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {analysis.matchedCategories.map((cat) => (
                            <Badge key={cat} variant="secondary" className="text-[10px] px-1.5 py-0 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                              <Tag className="w-2.5 h-2.5 mr-0.5" />{cat}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="flex gap-2 pt-2">
                  <Button size="sm" asChild data-testid="open-job-url">
                    <a href={selectedJob.url} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                      <ExternalLink className="w-3.5 h-3.5" />
                      Otvoriť ponuku
                    </a>
                  </Button>
                  {selectedJob.status === "new" && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          updateStatusMutation.mutate({ id: selectedJob.id, status: "applied" });
                          setSelectedJob({ ...selectedJob, status: "applied" });
                        }}
                        data-testid="mark-applied"
                      >
                        <Send className="w-3.5 h-3.5 mr-1.5" />
                        Označiť ako odoslanú
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          updateStatusMutation.mutate({ id: selectedJob.id, status: "ignored" });
                          setSelectedJob(null);
                        }}
                        data-testid="mark-ignored"
                      >
                        Ignorovať
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
