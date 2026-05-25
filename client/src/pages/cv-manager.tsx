import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Upload, Plus, Trash2, Mail, ChevronDown, ChevronUp, Settings, Eye, ScanText, Loader2, MapPin, Briefcase, GraduationCap, Languages, Sparkles, Wand2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CvVersion, CoverLetter, JobListing } from "@shared/schema";

interface CvAnalysis {
  name?: string;
  fullName?: string;
  targetRole?: string;
  location?: string;
  skills?: string[];
  languages?: { language: string; level: string }[];
  experience?: { role: string; company: string; duration: string; description: string }[];
  education?: { degree: string; school: string; year: string }[];
  summary?: string;
  suggestedCategories?: { value: string; label: string; emoji: string; terms: string[] }[];
  suggestedSearchTerms?: string[];
  cvLanguage?: string;
  parsedText?: string;
}

// Tag options for cover letters (same categories as watchers + extras)
const COVER_LETTER_TAGS = [
  { value: "ai",             label: "AI / ML",               emoji: "🤖" },
  { value: "ai-integration", label: "AI integrácia",         emoji: "🔗" },
  { value: "ai-tools",       label: "AI nástroje",           emoji: "🛠️" },
  { value: "ai-strategy",    label: "AI stratégia",          emoji: "🎯" },
  { value: "automation",     label: "Automatizácia / RPA",   emoji: "⚙️" },
  { value: "junior-it",      label: "Junior IT",             emoji: "💻" },
  { value: "part-time",      label: "Part-time / Brigáda",   emoji: "⏰" },
  { value: "social-media",   label: "Sociálne siete",        emoji: "📱" },
  { value: "bank-tester",    label: "Tester v banke",        emoji: "🏦" },
  { value: "proactive",      label: "Proaktivita",           emoji: "🚀" },
  { value: "people-skills",  label: "Práca s ľuďmi",         emoji: "🤝" },
  { value: "process-improvement", label: "Zlepšovanie procesov", emoji: "📈" },
  { value: "creative",       label: "Kreatívne pozície",     emoji: "🎨" },
  { value: "consulting",     label: "Poradenstvo",           emoji: "💼" },
];

export default function CvManager() {
  const [isAddCvOpen, setIsAddCvOpen] = useState(false);
  const [isAddClOpen, setIsAddClOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [expandedClId, setExpandedClId] = useState<number | null>(null);
  const [editCl, setEditCl] = useState<CoverLetter | null>(null);
  const [editClTags, setEditClTags] = useState<string[]>([]);
  const [previewCv, setPreviewCv] = useState<CvVersion | null>(null);
  const [analysisPreview, setAnalysisPreview] = useState<{ cvName: string; analysis: CvAnalysis } | null>(null);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [genCvId, setGenCvId] = useState<string>("");
  const [genJobId, setGenJobId] = useState<string>("");
  const [genLang, setGenLang] = useState("cs");
  const [genLengthType, setGenLengthType] = useState("words");
  const [genLengthValue, setGenLengthValue] = useState("250");
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const { toast } = useToast();

  // ── CV queries ──
  const { data: cvVersions = [], isLoading: cvLoading } = useQuery<CvVersion[]>({
    queryKey: ["/api/cv-versions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/cv-versions?includeContent=1");
      return res.json();
    },
  });

  // ── Cover letter queries ──
  const { data: coverLetters = [], isLoading: clLoading } = useQuery<CoverLetter[]>({
    queryKey: ["/api/cover-letters"],
  });

  // ── Favorite jobs (for cover letter generation) ──
  const { data: allJobs = [] } = useQuery<JobListing[]>({
    queryKey: ["/api/jobs", { favorite: true, minScore: 0, limit: 100 }],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/jobs?favorite=1&minScore=0&limit=100");
      return res.json();
    },
  });
  const favoriteJobs = allJobs;

  // ── CV mutations ──
  const createCvMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const file = data.get("file") as File;
      const reader = new FileReader();
      const fileContent = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const res = await apiRequest("POST", "/api/cv-versions", {
        name: file.name,
        fileName: file.name,
        fileContent,
        fileType: "image",
        isActive: true,
      });
      return await res.json();
    },
    onSuccess: (cv) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cv-versions"] });
      setIsAddCvOpen(false);
      toast({ title: "CV nahrané ✓", description: "Spúšťam AI analýzu..." });
      analyzeCvMutation.mutate({ id: cv.id, name: cv.name });
    },
    onError: () => {
      toast({ title: "Chyba", description: "Nepodarilo sa nahrať CV.", variant: "destructive" });
    },
  });

  const deleteCvMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/cv-versions/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cv-versions"] });
      toast({ title: "CV zmazané" });
    },
  });

  const toggleCvActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/cv-versions/${id}`, { isActive });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/cv-versions"] }),
  });

  const analyzeCvMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await apiRequest("POST", `/api/cv-versions/${id}/analyze`);
      const data = await res.json();
      return { ...data, cvName: name };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cv-versions"] });
      setAnalysisPreview({ cvName: data.analysis?.name || data.cvName, analysis: data.analysis });
      toast({ title: "CV zanalyzované ✓", description: `Profil: ${data.analysis?.targetRole || "OK"}` });
    },
    onError: () => {
      toast({ title: "Chyba", description: "Nepodarilo sa analyzovať CV.", variant: "destructive" });
    },
  });

  const parseCvAnalysis = (cv: CvVersion): CvAnalysis | null => {
    try {
      return JSON.parse((cv as any).cvAnalysis || "null");
    } catch {
      return null;
    }
  };

  // ── Cover letter mutations ──
  const createClMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      await apiRequest("POST", "/api/cover-letters", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cover-letters"] });
      setIsAddClOpen(false);
      setSelectedTags([]);
      toast({ title: "Motivačný list pridaný ✓" });
    },
    onError: () => {
      toast({ title: "Chyba", description: "Nepodarilo sa uložiť motivačný list.", variant: "destructive" });
    },
  });

  const deleteClMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/cover-letters/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cover-letters"] });
      toast({ title: "Motivačný list zmazaný" });
    },
  });

  const toggleClActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/cover-letters/${id}`, { isActive });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/cover-letters"] }),
  });

  const updateClMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      await apiRequest("PATCH", `/api/cover-letters/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cover-letters"] });
      setEditCl(null);
      toast({ title: "Motivačný list aktualizovaný ✓" });
    },
  });

  const generateClMutation = useMutation({
    mutationFn: async (params: { cvId: number; jobId: number; language: string; lengthType: string; lengthValue: number }) => {
      const res = await apiRequest("POST", "/api/cover-letters/generate", params);
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedContent(data.content);
      toast({ title: "Motivačný list vygenerovaný ✓", description: `Pre ${data.company} – ${data.jobTitle}` });
    },
    onError: () => {
      toast({ title: "Chyba", description: "Nepodarilo sa vygenerovať motivačný list.", variant: "destructive" });
    },
  });

  // ── Handlers ──
  const openEditClDialog = (cl: CoverLetter) => {
    let tags: string[] = [];
    try { tags = JSON.parse(cl.tags || "[]"); } catch {}
    setEditClTags(tags);
    setEditCl(cl);
  };

  const handleEditClSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editCl) return;
    const fd = new FormData(e.currentTarget);
    updateClMutation.mutate({
      id: editCl.id,
      data: {
        name: fd.get("name") || editCl.name,
        content: fd.get("content") || editCl.content,
        tags: JSON.stringify(editClTags),
        language: fd.get("language") || editCl.language,
      },
    });
  };
  const handleCvSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    createCvMutation.mutate(new FormData(e.currentTarget));
  };

  const handleClSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createClMutation.mutate({
      name: fd.get("name") || "Motivačný list",
      content: fd.get("content"),
      tags: JSON.stringify(selectedTags),
      language: fd.get("language") || "cs",
      isActive: true,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold" data-testid="page-title">CV Databáza</h1>
        <p className="text-sm text-muted-foreground mt-1">Spravuj CV a motivačné listy</p>
      </div>

      <Tabs defaultValue="cv" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cv" className="gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            CV ({cvVersions.length})
          </TabsTrigger>
          <TabsTrigger value="cover-letters" className="gap-1.5">
            <Mail className="w-3.5 h-3.5" />
            Motivačné listy ({coverLetters.length})
          </TabsTrigger>
        </TabsList>

        {/* ═══ TAB 1: CV Versions ═══ */}
        <TabsContent value="cv" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={isAddCvOpen} onOpenChange={setIsAddCvOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Nahrať CV</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Nahrať CV obrázok</DialogTitle></DialogHeader>
                <form onSubmit={handleCvSubmit} className="space-y-4 mt-2">
                  <div className="space-y-2">
                    <Label htmlFor="cv-file">CV súbor (JPG / PNG)</Label>
                    <Input id="cv-file" name="file" type="file" accept=".jpg,.jpeg,.png,.webp" required />
                    <p className="text-xs text-muted-foreground">
                      Nahraj screenshot alebo fotku CV. AI automaticky prečíta obsah, extrahuje skills, lokáciu, skúsenosti a navrhne kategórie pre watchery.
                    </p>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={() => setIsAddCvOpen(false)}>Zrušiť</Button>
                    <Button type="submit" disabled={createCvMutation.isPending || analyzeCvMutation.isPending}>
                      {createCvMutation.isPending || analyzeCvMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Analyzujem...</>
                      ) : (
                        <><Upload className="w-4 h-4 mr-1" /> Nahrať a analyzovať</>
                      )}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {cvLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(2)].map((_, i) => (
                <Card key={i} className="animate-pulse"><CardContent className="py-6"><div className="h-24 bg-muted rounded" /></CardContent></Card>
              ))}
            </div>
          ) : cvVersions.length === 0 ? (
            <Card className="border-card-border">
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FileText className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">Zatiaľ žiadne CV</p>
                <p className="text-xs mt-1">Nahraj svoju prvú verziu CV</p>
                <Button size="sm" className="mt-4 gap-1.5" onClick={() => setIsAddCvOpen(true)}>
                  <Upload className="w-4 h-4" /> Nahrať CV
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {cvVersions.map((cv) => {
                let skills: string[] = [];
                try { skills = JSON.parse(cv.skills || "[]"); } catch {}
                const analysis = parseCvAnalysis(cv);
                return (
                  <Card key={cv.id} className={`border-card-border transition-opacity ${!cv.isActive ? "opacity-60" : ""}`}>
                    <CardContent className="py-4 px-5">
                      <div className="flex items-start gap-4">
                        {/* CV thumbnail */}
                        <button
                          className="shrink-0 rounded-lg overflow-hidden border border-card-border w-16 h-22 hover:opacity-80 transition-opacity bg-muted"
                          onClick={() => setPreviewCv(cv)}
                          title="Zobraziť CV"
                        >
                          {cv.fileContent ? (
                            <img src={cv.fileContent} alt="CV" className="w-full h-full object-cover object-top" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><FileText className="w-6 h-6 text-muted-foreground" /></div>
                          )}
                        </button>

                        {/* CV info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold truncate">{cv.name}</h3>
                            {analysis && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">AI Analyzed</Badge>}
                          </div>
                          {cv.targetRole && <p className="text-xs text-muted-foreground mt-0.5">🎯 {cv.targetRole}</p>}
                          {analysis?.location && (
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {analysis.location}
                            </p>
                          )}
                          {cv.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{cv.description}</p>}
                          {skills.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {skills.slice(0, 8).map((skill) => (
                                <Badge key={skill} variant="secondary" className="text-[10px] px-1.5 py-0">{skill}</Badge>
                              ))}
                              {skills.length > 8 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">+{skills.length - 8}</Badge>}
                            </div>
                          )}
                          {analysis?.languages && analysis.languages.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {analysis.languages.map((lang: { language: string; level: string }) => (
                                <Badge key={lang.language} variant="outline" className="text-[10px] px-1.5 py-0">🌐 {lang.language} ({lang.level})</Badge>
                              ))}
                            </div>
                          )}
                          {analysis?.suggestedCategories && analysis.suggestedCategories.length > 0 && (
                            <div className="mt-2">
                              <p className="text-[10px] text-muted-foreground font-medium mb-1">Odporúčané kategórie:</p>
                              <div className="flex flex-wrap gap-1">
                                {analysis.suggestedCategories.slice(0, 5).map((cat: { value: string; emoji: string; label: string }) => (
                                  <Badge key={cat.value} variant="secondary" className="text-[10px] px-1.5 py-0 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                                    {cat.emoji} {cat.label}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-2 inline-block">{cv.language}</span>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <Switch checked={cv.isActive ?? true} onCheckedChange={(c) => toggleCvActiveMutation.mutate({ id: cv.id, isActive: c })} />
                          <Button
                            variant="outline"
                            size="sm"
                            className={`h-7 w-7 p-0 ${analysis ? "text-green-600 hover:text-green-700" : "text-muted-foreground hover:text-foreground"}`}
                            onClick={() => {
                              if (analysis) {
                                setAnalysisPreview({ cvName: cv.name, analysis });
                              } else {
                                analyzeCvMutation.mutate({ id: cv.id, name: cv.name });
                              }
                            }}
                            disabled={analyzeCvMutation.isPending}
                            title={analysis ? "Zobraziť analýzu" : "Analyzovať CV"}
                          >
                            {analyzeCvMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => setPreviewCv(cv)} title="Zobraziť CV">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => deleteCvMutation.mutate(cv.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══ TAB 2: Motivačné listy ═══ */}
        <TabsContent value="cover-letters" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setIsGenerateOpen(true); setGeneratedContent(null); }}>
              <Wand2 className="w-4 h-4" /> Generovať z AI
            </Button>
            <Dialog open={isAddClOpen} onOpenChange={(open) => { setIsAddClOpen(open); if (!open) setSelectedTags([]); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Nový motivačný list</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Nový motivačný list</DialogTitle></DialogHeader>
                <form onSubmit={handleClSubmit} className="space-y-4 mt-2">
                  <div className="space-y-2">
                    <Label htmlFor="cl-name">Názov</Label>
                    <Input id="cl-name" name="name" placeholder="napr. AI Integrátor – motivačný list" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cl-content">Text motivačného listu</Label>
                    <Textarea id="cl-content" name="content" placeholder="Dobrý den, ..." rows={8} required className="resize-y" />
                  </div>

                  {/* Tags */}
                  <div className="space-y-2">
                    <Label className="font-semibold">Na aké pozície je vhodný?</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {COVER_LETTER_TAGS.map((tag) => {
                        const checked = selectedTags.includes(tag.value);
                        return (
                          <label
                            key={tag.value}
                            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 cursor-pointer transition-colors text-xs ${
                              checked
                                ? "border-primary bg-primary/5 text-foreground"
                                : "border-card-border text-muted-foreground hover:bg-muted/30"
                            }`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(c) => {
                                setSelectedTags((prev) =>
                                  c ? [...prev, tag.value] : prev.filter((v) => v !== tag.value)
                                );
                              }}
                              className="h-3 w-3"
                            />
                            <span>{tag.emoji} {tag.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Jazyk</Label>
                    <Select name="language" defaultValue="cs">
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cs">Čeština</SelectItem>
                        <SelectItem value="sk">Slovenčina</SelectItem>
                        <SelectItem value="en">Angličtina</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={() => setIsAddClOpen(false)}>Zrušiť</Button>
                    <Button type="submit" disabled={createClMutation.isPending || selectedTags.length === 0}>
                      {createClMutation.isPending ? "Ukladám..." : "Uložiť"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {clLoading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <Card key={i} className="animate-pulse"><CardContent className="py-6"><div className="h-20 bg-muted rounded" /></CardContent></Card>
              ))}
            </div>
          ) : coverLetters.length === 0 ? (
            <Card className="border-card-border">
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Mail className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">Zatiaľ žiadne motivačné listy</p>
                <p className="text-xs mt-1">Pridaj svoj prvý motivačný list s tagmi pre AI matching</p>
                <Button size="sm" className="mt-4 gap-1.5" onClick={() => setIsAddClOpen(true)}>
                  <Plus className="w-4 h-4" /> Pridať motivačný list
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {coverLetters.map((cl) => {
                let tags: string[] = [];
                try { tags = JSON.parse(cl.tags || "[]"); } catch {}
                const isExpanded = expandedClId === cl.id;

                return (
                  <Card key={cl.id} className={`border-card-border transition-opacity ${!cl.isActive ? "opacity-50" : ""}`}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-primary shrink-0" />
                            <h3 className="text-sm font-semibold truncate">{cl.name}</h3>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 uppercase shrink-0">{cl.language}</Badge>
                          </div>

                          {/* Tags */}
                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5 ml-6">
                              {tags.map((tag) => {
                                const info = COVER_LETTER_TAGS.find((t) => t.value === tag);
                                return (
                                  <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                                    {info?.emoji} {info?.label ?? tag}
                                  </Badge>
                                );
                              })}
                            </div>
                          )}

                          {/* Preview / full text toggle */}
                          <div className="ml-6 mt-2">
                            <p className={`text-xs text-muted-foreground whitespace-pre-wrap ${isExpanded ? "" : "line-clamp-2"}`}>
                              {cl.content}
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px] text-muted-foreground mt-0.5 gap-1"
                              onClick={() => setExpandedClId(isExpanded ? null : cl.id)}
                            >
                              {isExpanded ? <><ChevronUp className="w-3 h-3" /> Skryť</> : <><ChevronDown className="w-3 h-3" /> Zobraziť celý</>}
                            </Button>
                          </div>
                        </div>

                        {/* Controls */}
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <Switch checked={cl.isActive ?? true} onCheckedChange={(c) => toggleClActiveMutation.mutate({ id: cl.id, isActive: c })} />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => openEditClDialog(cl)}
                            title="Upraviť"
                          >
                            <Settings className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteClMutation.mutate(cl.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Edit cover letter dialog ── */}
      <Dialog open={editCl !== null} onOpenChange={(open) => { if (!open) setEditCl(null); }}>        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>⚙️ Upraviť motivačný list</DialogTitle>
          </DialogHeader>
          {editCl && (
            <form onSubmit={handleEditClSubmit} className="space-y-4 mt-2">
              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-cl-name" className="text-xs text-muted-foreground">Názov</Label>
                <Input id="edit-cl-name" name="name" defaultValue={editCl.name} className="h-9" />
              </div>

              {/* Content */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-cl-content" className="text-xs text-muted-foreground">Text motivačného listu</Label>
                <Textarea
                  id="edit-cl-content"
                  name="content"
                  defaultValue={editCl.content}
                  rows={10}
                  required
                  className="resize-y text-sm"
                />
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label className="font-semibold">Na aké pozície je vhodný?</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {COVER_LETTER_TAGS.map((tag) => {
                    const checked = editClTags.includes(tag.value);
                    return (
                      <label
                        key={tag.value}
                        className={`flex items-center gap-2 rounded-md border px-3 py-1.5 cursor-pointer transition-colors text-xs ${
                          checked
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-card-border text-muted-foreground hover:bg-muted/30"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) => {
                            setEditClTags((prev) =>
                              c ? [...prev, tag.value] : prev.filter((v) => v !== tag.value)
                            );
                          }}
                          className="h-3 w-3"
                        />
                        <span>{tag.emoji} {tag.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Language */}
              <div className="space-y-1.5">
                <Label className="text-xs">Jazyk</Label>
                <Select name="language" defaultValue={editCl.language ?? "cs"}>
                  <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cs">Čeština</SelectItem>
                    <SelectItem value="sk">Slovenčina</SelectItem>
                    <SelectItem value="en">Angličtina</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditCl(null)}>Zrušiť</Button>
                <Button type="submit" size="sm" disabled={updateClMutation.isPending || editClTags.length === 0}>
                  {updateClMutation.isPending ? "Ukladám…" : "Uložiť"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── CV image preview dialog ── */}
      <Dialog open={previewCv !== null} onOpenChange={(open) => { if (!open) setPreviewCv(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>📄 {previewCv?.name}</DialogTitle>
          </DialogHeader>
          {previewCv && (previewCv.fileContent || (previewCv as any).imageContent) ? (
            <img
              src={previewCv.fileContent || (previewCv as any).imageContent}
              alt="CV preview"
              className="w-full rounded-lg border border-card-border mt-2"
            />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Žiadny obrázok CV.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* ── CV Analysis preview dialog ── */}
      <Dialog open={analysisPreview !== null} onOpenChange={(open) => { if (!open) setAnalysisPreview(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>🧠 AI Analýza – {analysisPreview?.cvName}</DialogTitle>
          </DialogHeader>
          {analysisPreview?.analysis && (() => {
            const a = analysisPreview.analysis;
            return (
              <div className="space-y-4 mt-2">
                {a.summary && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Profil</h4>
                    <p className="text-sm">{a.summary}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {a.fullName && <div><h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Meno</h4><p className="text-sm">{a.fullName}</p></div>}
                  {a.location && <div><h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Lokácia</h4><p className="text-sm">{a.location}</p></div>}
                  {a.targetRole && <div><h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1"><Briefcase className="w-3 h-3" /> Cieľová pozícia</h4><p className="text-sm">{a.targetRole}</p></div>}
                </div>
                {a.skills && a.skills.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Skills</h4>
                    <div className="flex flex-wrap gap-1">{a.skills.map((s) => <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>)}</div>
                  </div>
                )}
                {a.languages && a.languages.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1"><Languages className="w-3 h-3" /> Jazyky</h4>
                    <div className="flex flex-wrap gap-1">{a.languages.map((l) => <Badge key={l.language} variant="outline" className="text-[10px]">{l.language} ({l.level})</Badge>)}</div>
                  </div>
                )}
                {a.experience && a.experience.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1"><Briefcase className="w-3 h-3" /> Skúsenosti</h4>
                    <div className="space-y-2">
                      {a.experience.map((exp, i) => (
                        <div key={i} className="text-sm border-l-2 border-primary/20 pl-3">
                          <p className="font-medium">{exp.role}</p>
                          <p className="text-xs text-muted-foreground">{exp.company} · {exp.duration}</p>
                          {exp.description && <p className="text-xs text-muted-foreground mt-0.5">{exp.description}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {a.education && a.education.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1"><GraduationCap className="w-3 h-3" /> Vzdelanie</h4>
                    {a.education.map((edu, i) => <div key={i} className="text-sm"><span className="font-medium">{edu.degree}</span><span className="text-muted-foreground"> – {edu.school} ({edu.year})</span></div>)}
                  </div>
                )}
                {a.suggestedCategories && a.suggestedCategories.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Odporúčané kategórie pre watchery</h4>
                    <div className="space-y-1">
                      {a.suggestedCategories.map((cat) => (
                        <div key={cat.value} className="flex items-center gap-2 text-sm">
                          <span>{cat.emoji}</span><span className="font-medium">{cat.label}</span>
                          <span className="text-xs text-muted-foreground">({cat.terms.join(", ")})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {a.suggestedSearchTerms && a.suggestedSearchTerms.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Odporúčané search terms</h4>
                    <div className="flex flex-wrap gap-1">{a.suggestedSearchTerms.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}</div>
                  </div>
                )}
                {a.parsedText && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Extrahovaný text</h4>
                    <pre className="text-xs bg-muted p-3 rounded-lg whitespace-pre-wrap break-words max-h-40 overflow-y-auto font-mono">{a.parsedText}</pre>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Generate cover letter dialog ── */}
      <Dialog open={isGenerateOpen} onOpenChange={(open) => { setIsGenerateOpen(open); if (!open) setGeneratedContent(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wand2 className="w-5 h-5 text-violet-500" /> Generovať motivačný list</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* CV select */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Vyber CV</Label>
              <Select value={genCvId} onValueChange={setGenCvId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Zvol CV..." /></SelectTrigger>
                <SelectContent>
                  {cvVersions.filter(cv => cv.isActive).map(cv => (
                    <SelectItem key={cv.id} value={String(cv.id)}>
                      {cv.name} {cv.targetRole ? `(${cv.targetRole})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cvVersions.length === 0 && <p className="text-xs text-muted-foreground">Najprv nahraj CV v záložke CV.</p>}
            </div>

            {/* Job select (favorites only) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Vyber pracovnú ponuku (z obľúbených)</Label>
              <Select value={genJobId} onValueChange={setGenJobId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Zvol ponuku..." /></SelectTrigger>
                <SelectContent>
                  {favoriteJobs.map(job => (
                    <SelectItem key={job.id} value={String(job.id)}>
                      {job.title} – {job.company} {job.matchScore ? `(${job.matchScore}%)` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {favoriteJobs.length === 0 && <p className="text-xs text-muted-foreground">Nemáš žiadne obľúbené ponuky. Označ ponuku ⭐ v sekcii Ponuky.</p>}
            </div>

            {/* Language + Length */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Jazyk</Label>
                <Select value={genLang} onValueChange={setGenLang}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cs">Čeština</SelectItem>
                    <SelectItem value="sk">Slovenčina</SelectItem>
                    <SelectItem value="en">Angličtina</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Dĺžka v</Label>
                <Select value={genLengthType} onValueChange={setGenLengthType}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="words">Slovách</SelectItem>
                    <SelectItem value="chars">Znakoch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Počet</Label>
                <Input className="h-9" type="number" min="50" max="5000" value={genLengthValue} onChange={e => setGenLengthValue(e.target.value)} />
              </div>
            </div>

            {/* Generate button */}
            <Button
              className="w-full gap-2"
              disabled={!genCvId || !genJobId || generateClMutation.isPending}
              onClick={() => generateClMutation.mutate({
                cvId: Number(genCvId),
                jobId: Number(genJobId),
                language: genLang,
                lengthType: genLengthType,
                lengthValue: Number(genLengthValue),
              })}
            >
              {generateClMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generujem...</>
              ) : (
                <><Wand2 className="w-4 h-4" /> Vygenerovať motivačný list</>
              )}
            </Button>

            {/* Generated result */}
            {generatedContent && (
              <div className="space-y-3 border-t pt-4">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-green-500" /> Vygenerovaný motivačný list
                </h4>
                <div className="bg-muted/50 rounded-lg p-4 border">
                  <p className="text-sm whitespace-pre-wrap">{generatedContent}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      const selectedJob = favoriteJobs.find(j => j.id === Number(genJobId));
                      const selectedCv = cvVersions.find(c => c.id === Number(genCvId));
                      createClMutation.mutate({
                        name: `${selectedJob?.title || "Pozícia"} – ${selectedJob?.company || "Firma"} (${selectedCv?.name || "CV"})`,
                        content: generatedContent,
                        tags: JSON.stringify([]),
                        language: genLang,
                        isActive: true,
                      });
                      setIsGenerateOpen(false);
                      setGeneratedContent(null);
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" /> Uložiť ako nový motivačný list
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { navigator.clipboard.writeText(generatedContent); toast({ title: "Skopírované ✓" }); }}
                  >
                    Kopírovať
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
