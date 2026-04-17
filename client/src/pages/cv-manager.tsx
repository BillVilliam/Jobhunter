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
import { FileText, Upload, Plus, Trash2, Mail, ChevronDown, ChevronUp, Settings, Image, Eye, ScanText } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CvVersion, CoverLetter } from "@shared/schema";

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
  const [parsedTextPreview, setParsedTextPreview] = useState<{ cvName: string; text: string; pages?: number } | null>(null);
  const { toast } = useToast();

  // ── CV queries ──
  const { data: cvVersions = [], isLoading: cvLoading } = useQuery<CvVersion[]>({
    queryKey: ["/api/cv-versions"],
  });

  // ── Cover letter queries ──
  const { data: coverLetters = [], isLoading: clLoading } = useQuery<CoverLetter[]>({
    queryKey: ["/api/cover-letters"],
  });

  // ── CV mutations ──
  const createCvMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const file = data.get("file") as File;
      const reader = new FileReader();
      const fileContent = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const skills = (data.get("skills") as string).split(",").map(s => s.trim()).filter(Boolean);
      await apiRequest("POST", "/api/cv-versions", {
        name: data.get("name"),
        description: data.get("description"),
        fileName: file.name,
        fileContent,
        fileType: file.name.endsWith(".pdf") ? "pdf" : "docx",
        targetRole: data.get("targetRole"),
        skills: JSON.stringify(skills),
        language: data.get("language"),
        isActive: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cv-versions"] });
      setIsAddCvOpen(false);
      toast({ title: "CV pridané ✓" });
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

  const uploadCvImageMutation = useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const reader = new FileReader();
      const imageContent = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      await apiRequest("PATCH", `/api/cv-versions/${id}`, { imageContent });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cv-versions"] });
      toast({ title: "Fotka CV uložená ✓" });
    },
    onError: () => {
      toast({ title: "Chyba", description: "Nepodarilo sa nahrať fotku.", variant: "destructive" });
    },
  });

  const parseCvMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await apiRequest("POST", `/api/cv-versions/${id}/parse`);
      const data = await res.json();
      return { ...data, cvName: name };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cv-versions"] });
      setParsedTextPreview({ cvName: data.cvName, text: data.parsedText, pages: data.pages });
      toast({ title: "CV prečítané ✓", description: `${data.pages} strán` });
    },
    onError: () => {
      toast({ title: "Chyba", description: "Nepodarilo sa prečítať CV.", variant: "destructive" });
    },
  });

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
                <Button size="sm" className="gap-1.5"><Plus className="w-4 h-4" /> Pridať CV</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Nahrať novú verziu CV</DialogTitle></DialogHeader>
                <form onSubmit={handleCvSubmit} className="space-y-4 mt-2">
                  <div className="space-y-2">
                    <Label htmlFor="cv-name">Názov verzie</Label>
                    <Input id="cv-name" name="name" placeholder="napr. Frontend Developer CV" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cv-description">Popis</Label>
                    <Textarea id="cv-description" name="description" placeholder="Čo táto verzia zdôrazňuje..." rows={2} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cv-targetRole">Cieľová pozícia</Label>
                    <Input id="cv-targetRole" name="targetRole" placeholder="napr. Frontend Developer" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cv-skills">Kľúčové skills (čiarkou oddelené)</Label>
                    <Input id="cv-skills" name="skills" placeholder="React, TypeScript, Node.js" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cv-language">Jazyk</Label>
                    <Select name="language" defaultValue="en">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">Angličtina</SelectItem>
                        <SelectItem value="cs">Čeština</SelectItem>
                        <SelectItem value="sk">Slovenčina</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cv-file">CV súbor (PDF/DOCX)</Label>
                    <Input id="cv-file" name="file" type="file" accept=".pdf,.docx" required />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={() => setIsAddCvOpen(false)}>Zrušiť</Button>
                    <Button type="submit" disabled={createCvMutation.isPending}>
                      {createCvMutation.isPending ? "Nahrávam..." : "Nahrať CV"}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cvVersions.map((cv) => {
                let skills: string[] = [];
                try { skills = JSON.parse(cv.skills || "[]"); } catch {}
                return (
                  <Card key={cv.id} className={`border-card-border transition-opacity ${!cv.isActive ? "opacity-60" : ""}`}>
                    <CardContent className="py-4 px-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 min-w-0">
                          {/* CV image thumbnail or icon */}
                          {(cv as any).imageContent ? (
                            <button
                              className="shrink-0 mt-0.5 rounded-lg overflow-hidden border border-card-border w-10 h-14 hover:opacity-80 transition-opacity"
                              onClick={() => setPreviewCv(cv)}
                              title="Zobraziť foto CV"
                            >
                              <img
                                src={(cv as any).imageContent}
                                alt="CV preview"
                                className="w-full h-full object-cover object-top"
                              />
                            </button>
                          ) : (
                            <div className="p-2 rounded-lg bg-primary/10 mt-0.5 shrink-0"><FileText className="w-4 h-4 text-primary" /></div>
                          )}
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold truncate">{cv.name}</h3>
                            {cv.targetRole && <p className="text-xs text-muted-foreground mt-0.5">{cv.targetRole}</p>}
                            {cv.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{cv.description}</p>}
                            {skills.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {skills.slice(0, 5).map((skill) => (
                                  <Badge key={skill} variant="secondary" className="text-[10px] px-1.5 py-0">{skill}</Badge>
                                ))}
                                {skills.length > 5 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">+{skills.length - 5}</Badge>}
                              </div>
                            )}
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-2 inline-block">{cv.fileType} · {cv.language}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0 ml-2">
                          <Switch checked={cv.isActive ?? true} onCheckedChange={(c) => toggleCvActiveMutation.mutate({ id: cv.id, isActive: c })} />
                          {/* Image upload button */}
                          <label
                            className="cursor-pointer inline-flex items-center justify-center h-7 w-7 rounded-md border border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                            title="Nahrať fotku CV"
                          >
                            <Image className="w-3.5 h-3.5" />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) uploadCvImageMutation.mutate({ id: cv.id, file });
                              }}
                            />
                          </label>
                          {(cv as any).imageContent && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => setPreviewCv(cv)}
                              title="Zobraziť CV"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {/* Parse CV to text */}
                          {cv.fileType === "pdf" && (
                            (cv as any).parsedText ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
                                onClick={() => setParsedTextPreview({ cvName: cv.name, text: (cv as any).parsedText })}
                                title="Zobraziť extrahovaný text"
                              >
                                <ScanText className="w-3.5 h-3.5" />
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => parseCvMutation.mutate({ id: cv.id, name: cv.name })}
                                disabled={parseCvMutation.isPending}
                                title="Prečítať CV text"
                              >
                                <ScanText className="w-3.5 h-3.5" />
                              </Button>
                            )
                          )}
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
          <div className="flex justify-end">
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
          {previewCv && (previewCv as any).imageContent ? (
            <img
              src={(previewCv as any).imageContent}
              alt="CV preview"
              className="w-full rounded-lg border border-card-border mt-2"
            />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Žiadna fotka CV. Nahraj ju kliknutím na ikonu 🖼 pri CV karte.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Parsed text preview dialog ── */}
      <Dialog open={parsedTextPreview !== null} onOpenChange={(open) => { if (!open) setParsedTextPreview(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>📝 Extrahovaný text – {parsedTextPreview?.cvName}</DialogTitle>
          </DialogHeader>
          {parsedTextPreview?.pages && (
            <p className="text-xs text-muted-foreground">Počet strán: {parsedTextPreview.pages}</p>
          )}
          <pre className="text-xs bg-muted p-4 rounded-lg whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto font-mono leading-relaxed">
            {parsedTextPreview?.text || "Žiadny text"}
          </pre>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (parsedTextPreview?.text) {
                  navigator.clipboard.writeText(parsedTextPreview.text);
                  toast({ title: "Skopírované ✓" });
                }
              }}
            >
              Kopírovať text
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
