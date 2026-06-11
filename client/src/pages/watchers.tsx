import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Eye, Plus, Trash2, Play, Pause, MapPin, Zap, Loader2, Laptop, Briefcase, Settings, X, PencilLine, Navigation, Sparkles, LocateFixed } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { WatcherConfig, CvVersion } from "@shared/schema";

// Category stored in jobCategories JSON array
export interface Category {
  value: string;   // unique ID like "ai" or "custom-1679..."
  label: string;   // user-visible name
  emoji: string;   // emoji icon
  terms: string[]; // search terms for scraping
}

// Legacy support: old format stored bare strings; new format stores objects
type CategoryEntry = string | Category;

/** Default preset categories (used when creating a new watcher) */
const DEFAULT_CATEGORIES: Category[] = [
  { value: "ai",           label: "AI / Machine Learning",     emoji: "🤖", terms: ["AI", "machine learning", "artificial intelligence", "LLM"] },
  { value: "automation",   label: "Automatizácia / RPA",       emoji: "⚙️", terms: ["automatizácia", "automation", "QA tester", "RPA"] },
  { value: "social-media", label: "Sociálne siete / Content",  emoji: "📱", terms: ["social media", "content manager", "community manager"] },
  { value: "bank-tester",  label: "Tester v banke",            emoji: "🏦", terms: ["tester banka", "QA banka", "tester finanční", "test analyst"] },
  { value: "junior-it",    label: "Junior IT pozícia",         emoji: "💻", terms: ["junior developer", "junior IT", "junior programátor", "trainee IT"] },
  { value: "data-analyst", label: "Dátový analytik",           emoji: "📊", terms: ["data analyst", "dátový analytik", "business intelligence", "data engineer"] },
  { value: "devops",       label: "DevOps / Cloud",            emoji: "☁️", terms: ["devops", "cloud engineer", "SRE", "kubernetes"] },
  { value: "marketing",    label: "Marketing / PPC",           emoji: "📈", terms: ["marketing", "PPC specialist", "digital marketing", "SEO"] },
];

/** Parse saved jobCategories JSON → Category[]  (handles legacy string-only format) */
function parseCategories(raw: string | undefined | null): Category[] {
  try {
    const arr: CategoryEntry[] = JSON.parse(raw || "[]");
    if (!Array.isArray(arr)) return [];
    return arr.map((entry) => {
      if (typeof entry === "string") {
        // Legacy built-in id → resolve from defaults
        const preset = DEFAULT_CATEGORIES.find((d) => d.value === entry);
        return preset ?? { value: entry, label: entry, emoji: "🔍", terms: [entry] };
      }
      // Already a full Category object
      return { value: entry.value, label: entry.label, emoji: entry.emoji ?? "🔍", terms: entry.terms ?? [entry.label] };
    });
  } catch {
    return [];
  }
}

const JOB_TYPES = [
  { value: "full-time",  label: "Plný úväzok" },
  { value: "part-time",  label: "Čiastočný úväzok" },
  { value: "contract",   label: "Kontrakt / Freelance" },
  { value: "any",        label: "Akýkoľvek" },
];

const REMOTE_OPTIONS = [
  { value: "remote",  label: "Remote" },
  { value: "hybrid",  label: "Hybrid" },
  { value: "onsite",  label: "On-site" },
  { value: "any",     label: "Akýkoľvek" },
];

const COUNTRY_OPTIONS = [
  { value: "auto", label: "🌐 Automaticky (podľa lokality)" },
  { value: "cz",   label: "🇨🇿 Česko" },
  { value: "sk",   label: "🇸🇰 Slovensko" },
  { value: "both", label: "🇨🇿+🇸🇰 Obe krajiny" },
];

const COUNTRY_FLAGS: Record<string, string> = {
  cz: "🇨🇿",
  sk: "🇸🇰",
  both: "🇨🇿🇸🇰",
  auto: "🌐",
};

const countryTitle = (v: string) =>
  `Krajina: ${COUNTRY_OPTIONS.find((o) => o.value === v)?.label.replace(/^\S+\s/, "") ?? v}`;

interface PortalsResponse {
  country: "cz" | "sk" | "both";
  autoDetected: boolean;
  portals: { id: string; name: string; country: string }[];
}

export default function Watchers() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editWatcher, setEditWatcher] = useState<WatcherConfig | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([
    ...DEFAULT_CATEGORIES.slice(0, 3),
  ]);
  const [editCategories, setEditCategories] = useState<Category[]>([]);
  const [runningId, setRunningId] = useState<number | null>(null);
  // State for the "add category" inline form
  const [addingCustomFor, setAddingCustomFor] = useState<"create" | "edit" | null>(null);
  const [newCustomLabel, setNewCustomLabel] = useState("");
  const [newCustomTerms, setNewCustomTerms] = useState("");
  const [newCustomEmoji, setNewCustomEmoji] = useState("🔍");
  // State for editing an existing category inline
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [editCustomLabel, setEditCustomLabel] = useState("");
  const [editCustomTerms, setEditCustomTerms] = useState("");
  const [editCustomEmoji, setEditCustomEmoji] = useState("🔍");
  // Location & coordinates
  const [createLocation, setCreateLocation] = useState("Praha");
  const [createCoords, setCreateCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocodingCreate, setGeocodingCreate] = useState(false);
  const [editLocation, setEditLocation] = useState("");
  const [editCoords, setEditCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocodingEdit, setGeocodingEdit] = useState(false);
  const [detectingCreate, setDetectingCreate] = useState(false);
  const [detectingEdit, setDetectingEdit] = useState(false);
  // Country selection ("auto" | "cz" | "sk" | "both")
  const [createCountry, setCreateCountry] = useState("auto");
  const [editCountry, setEditCountry] = useState("auto");
  const { toast } = useToast();

  // Geocode a location string using Nominatim (with retry on rate limit)
  const geocode = async (address: string, retries = 2): Promise<{ lat: number; lng: number } | "rate-limited" | null> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 1500 * attempt));
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=cz,sk`,
          { headers: { "User-Agent": "JobHunter/1.0 (job search app)" } }
        );
        if (res.status === 429) {
          if (attempt < retries) continue;
          return "rate-limited";
        }
        if (!res.ok) {
          if (attempt < retries) continue;
          return "rate-limited";
        }
        const data: { lat: string; lon: string; display_name: string }[] = await res.json();
        if (data.length === 0) return null;
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      } catch {
        if (attempt < retries) continue;
        return "rate-limited";
      }
    }
    return null;
  };

  const handleGeocodeCreate = async () => {
    if (!createLocation.trim()) return;
    setGeocodingCreate(true);
    const result = await geocode(createLocation.trim());
    if (result === "rate-limited") {
      toast({ title: "⏳ Geocoding dočasne nedostupný", description: "Skús to znova o pár sekúnd. Lokácia bude fungovať aj bez overenia." });
    } else if (result === null) {
      toast({ title: "Lokáciu sa nepodarilo nájsť", description: "Skús zadať iba mesto (napr. Praha, Brno). Lokácia bude fungovať aj bez overenia." });
    } else {
      setCreateCoords(result);
    }
    setGeocodingCreate(false);
  };

  const handleGeocodeEdit = async () => {
    if (!editLocation.trim()) return;
    setGeocodingEdit(true);
    const result = await geocode(editLocation.trim());
    if (result === "rate-limited") {
      toast({ title: "⏳ Geocoding dočasne nedostupný", description: "Skús to znova o pár sekúnd. Lokácia bude fungovať aj bez overenia." });
    } else if (result === null) {
      toast({ title: "Lokáciu sa nepodarilo nájsť", description: "Skús zadať iba mesto (napr. Praha, Brno). Lokácia bude fungovať aj bez overenia." });
    } else {
      setEditCoords(result);
    }
    setGeocodingEdit(false);
  };

  // Browser geolocation with manual fallback: if the user denies the
  // permission (or it fails), the text input keeps working as before.
  const detectMyLocation = (target: "create" | "edit") => {
    const setDetecting = target === "create" ? setDetectingCreate : setDetectingEdit;
    const setLoc = target === "create" ? setCreateLocation : setEditLocation;
    const setCoords = target === "create" ? setCreateCoords : setEditCoords;

    if (!navigator.geolocation) {
      toast({ title: "Poloha nie je podporovaná", description: "Tvoj prehliadač nepodporuje zisťovanie polohy — zadaj lokáciu manuálne." });
      return;
    }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // Reverse-geocode to a readable city name (best effort — coords alone are enough)
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}&zoom=10`,
            { headers: { "User-Agent": "JobHunter/1.0 (job search app)" } }
          );
          if (res.ok) {
            const data = await res.json();
            const a = data.address ?? {};
            const city = a.city ?? a.town ?? a.village ?? a.municipality ?? data.name;
            if (city) setLoc(city);
          }
        } catch { /* keep whatever is typed in the input */ }
        setCoords(coords);
        setDetecting(false);
        toast({ title: "📍 Poloha zistená", description: "Lokáciu môžeš kedykoľvek upraviť manuálne." });
      },
      (err) => {
        setDetecting(false);
        toast({
          title: err.code === err.PERMISSION_DENIED ? "Prístup k polohe zamietnutý" : "Polohu sa nepodarilo zistiť",
          description: "Žiadny problém — zadaj mesto alebo adresu manuálne do poľa Lokácia.",
        });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const { data: watchers = [], isLoading } = useQuery<WatcherConfig[]>({
    queryKey: ["/api/watchers"],
  });

  const { data: cvVersions = [] } = useQuery<CvVersion[]>({
    queryKey: ["/api/cv-versions"],
  });

  // Portal preview — which job portals will be scanned for the chosen location/country
  const { data: createPortals } = useQuery<PortalsResponse>({
    queryKey: ["/api/portals", createLocation, createCountry],
    queryFn: () =>
      fetch(`/api/portals?location=${encodeURIComponent(createLocation)}&country=${createCountry}`)
        .then((r) => r.json()),
    enabled: isAddOpen,
  });

  const { data: editPortals } = useQuery<PortalsResponse>({
    queryKey: ["/api/portals", editLocation, editCountry],
    queryFn: () =>
      fetch(`/api/portals?location=${encodeURIComponent(editLocation)}&country=${editCountry}`)
        .then((r) => r.json()),
    enabled: editWatcher !== null,
  });

  // Get CVs that have analysis
  const analyzedCvs = cvVersions.filter((cv) => {
    try { return !!JSON.parse((cv as any).cvAnalysis || "null"); } catch { return false; }
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      await apiRequest("POST", "/api/watchers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setIsAddOpen(false);
      toast({ title: "Watcher vytvorený ✓" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/watchers/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/watchers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Watcher zmazaný" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      await apiRequest("PATCH", `/api/watchers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setEditWatcher(null);
      toast({ title: "Watcher aktualizovaný ✓" });
    },
  });

  const openEditDialog = (watcher: WatcherConfig) => {
    setEditCategories(parseCategories((watcher as any).jobCategories));
    setEditLocation(watcher.location ?? "Praha");
    const w = watcher as any;
    setEditCoords(w.locationLat && w.locationLng ? { lat: w.locationLat, lng: w.locationLng } : null);
    setEditCountry((watcher as any).country ?? "auto");
    setEditWatcher(watcher);
    setAddingCustomFor(null);
    setEditingCustomId(null);
  };

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editWatcher) return;
    const fd = new FormData(e.currentTarget);
    const jobType = fd.get("jobType") as string;
    const remoteOption = fd.get("remoteOption") as string;

    updateMutation.mutate({
      id: editWatcher.id,
      data: {
        name: fd.get("name") || editWatcher.name,
        location: editLocation || "Praha",
        locationLat: editCoords?.lat ?? null,
        locationLng: editCoords?.lng ?? null,
        country: editCountry,
        jobType: jobType === "any" ? null : jobType,
        remoteOption: remoteOption === "any" ? null : remoteOption,
        jobCategories: JSON.stringify(editCategories),
        minMatchScore: Number(fd.get("minMatchScore")) || 50,
      },
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const jobType = fd.get("jobType") as string;
    const remoteOption = fd.get("remoteOption") as string;

    const allLabels = selectedCategories.map((c) => c.label);

    createMutation.mutate({
      name: fd.get("name") || allLabels.slice(0, 3).join(", "),
      portal: "jobs.cz",
      searchQuery: allLabels.join(", "),
      location: createLocation || "Praha",
      locationLat: createCoords?.lat ?? null,
      locationLng: createCoords?.lng ?? null,
      country: createCountry,
      jobType: jobType === "any" ? null : jobType,
      remoteOption: remoteOption === "any" ? null : remoteOption,
      excludeKeywords: "[]",
      requiredSkills: "[]",
      jobCategories: JSON.stringify(selectedCategories),
      minMatchScore: Number(fd.get("minMatchScore")) || 50,
      isActive: true,
      autoApply: false,
      checkInterval: 60,
    });
  };

  const handleRunNow = async (id: number) => {
    setRunningId(id);
    try {
      const res = await apiRequest("POST", `/api/watchers/${id}/run`, {});
      const data = await res.json();
      toast({
        title: "Watcher dokončený",
        description: `Nájdené: ${data.found}, uložené: ${data.saved}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    } catch (err) {
      toast({ title: "Chyba", description: String(err), variant: "destructive" });
    } finally {
      setRunningId(null);
    }
  };

  const remoteLabel = (v: string | null) => REMOTE_OPTIONS.find((o) => o.value === v)?.label ?? v ?? "–";
  const jobTypeLabel = (v: string | null) => JOB_TYPES.find((o) => o.value === v)?.label ?? v ?? "–";

  // ── Helper: add a new category ──
  const addNewCategory = (target: "create" | "edit") => {
    if (!newCustomLabel.trim()) return;
    const terms = newCustomTerms
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (terms.length === 0) {
      terms.push(newCustomLabel.trim());
    }
    const cat: Category = {
      value: `custom-${Date.now()}`,
      label: newCustomLabel.trim(),
      emoji: newCustomEmoji || "🔍",
      terms,
    };
    if (target === "create") {
      setSelectedCategories((prev) => [...prev, cat]);
    } else {
      setEditCategories((prev) => [...prev, cat]);
    }
    setNewCustomLabel("");
    setNewCustomTerms("");
    setNewCustomEmoji("🔍");
    setAddingCustomFor(null);
  };

  // ── Helper: save edits to existing category ──
  const saveCategoryEdit = (target: "create" | "edit") => {
    if (!editingCustomId || !editCustomLabel.trim()) return;
    const terms = editCustomTerms
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (terms.length === 0) terms.push(editCustomLabel.trim());

    const updater = (prev: Category[]) =>
      prev.map((c) =>
        c.value === editingCustomId ? { ...c, label: editCustomLabel.trim(), emoji: editCustomEmoji || c.emoji, terms } : c,
      );
    if (target === "create") {
      setSelectedCategories(updater);
    } else {
      setEditCategories(updater);
    }
    setEditingCustomId(null);
    setEditCustomLabel("");
    setEditCustomTerms("");
    setEditCustomEmoji("🔍");
  };

  // ── Portal preview — shows which portals will be scanned for the chosen country ──
  const PortalPreview = ({ data, selectedCountry }: { data: PortalsResponse | undefined; selectedCountry: string }) => {
    if (!data || !Array.isArray(data.portals) || data.portals.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
        {selectedCountry === "auto" && <span className="text-[10px]">Zistené:</span>}
        <span>{COUNTRY_FLAGS[data.country] ?? "🌐"}</span>
        {data.portals.map((p) => (
          <Badge key={p.id} variant="secondary" className="text-[10px] px-1.5 py-0">
            {p.name}
          </Badge>
        ))}
      </div>
    );
  };

  // ── Category list component — all categories are uniform, editable, deletable ──
  const CategoryList = ({
    categories,
    setCategories,
    target,
  }: {
    categories: Category[];
    setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
    target: "create" | "edit";
  }) => {
    return (
      <div className="space-y-3">
        {/* All categories — uniform grid */}
        <div className="grid grid-cols-2 gap-2">
          {categories.map((cat) => (
            <div key={cat.value}>
              {editingCustomId === cat.value ? (
                /* Inline edit form */
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 space-y-2 col-span-1">
                  <div className="flex gap-1.5">
                    <Input
                      value={editCustomEmoji}
                      onChange={(e) => setEditCustomEmoji(e.target.value)}
                      className="h-8 text-xs w-12 text-center px-1"
                      maxLength={2}
                    />
                    <Input
                      value={editCustomLabel}
                      onChange={(e) => setEditCustomLabel(e.target.value)}
                      placeholder="Názov"
                      className="h-8 text-xs flex-1"
                      autoFocus
                    />
                  </div>
                  <Input
                    value={editCustomTerms}
                    onChange={(e) => setEditCustomTerms(e.target.value)}
                    placeholder="Hľadané výrazy (čiarkou)"
                    className="h-8 text-xs"
                  />
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => saveCategoryEdit(target)}
                      disabled={!editCustomLabel.trim()}
                    >
                      Uložiť
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => { setEditingCustomId(null); setEditCustomLabel(""); setEditCustomTerms(""); setEditCustomEmoji("🔍"); }}
                    >
                      Zrušiť
                    </Button>
                  </div>
                </div>
              ) : (
                /* Normal category tile */
                <div
                  className="group flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm relative"
                >
                  <span className="flex-1 truncate">{cat.emoji} {cat.label}</span>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setEditingCustomId(cat.value);
                        setEditCustomLabel(cat.label);
                        setEditCustomEmoji(cat.emoji);
                        setEditCustomTerms(cat.terms.join(", "));
                        setAddingCustomFor(null);
                      }}
                      title="Upraviť"
                    >
                      <PencilLine className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-destructive"
                      onClick={() => setCategories((prev) => prev.filter((c) => c.value !== cat.value))}
                      title="Odstrániť"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Presets — show unselected defaults as quick-add chips */}
        {(() => {
          const selectedValues = new Set(categories.map((c) => c.value));
          const available = DEFAULT_CATEGORIES.filter((d) => !selectedValues.has(d.value));
          if (available.length === 0) return null;
          return (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Rýchlo pridať</p>
              <div className="flex flex-wrap gap-1.5">
                {available.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-dashed border-muted-foreground/30 px-2 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-primary/5 transition-colors"
                    onClick={() => setCategories((prev) => [...prev, { ...preset }])}
                  >
                    <Plus className="w-3 h-3" />
                    {preset.emoji} {preset.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Add new custom category form */}
        {addingCustomFor === target ? (
          <div className="rounded-lg border border-dashed border-primary/30 p-2.5 space-y-2">
            <div className="flex gap-1.5">
              <Input
                value={newCustomEmoji}
                onChange={(e) => setNewCustomEmoji(e.target.value)}
                className="h-8 text-xs w-12 text-center px-1"
                maxLength={2}
                placeholder="🔍"
              />
              <Input
                value={newCustomLabel}
                onChange={(e) => setNewCustomLabel(e.target.value)}
                placeholder="Názov kategórie (napr. Copywriter)"
                className="h-8 text-xs flex-1"
                autoFocus
              />
            </div>
            <Input
              value={newCustomTerms}
              onChange={(e) => setNewCustomTerms(e.target.value)}
              placeholder="Hľadané výrazy oddelené čiarkou (napr. copywriter, content writer)"
              className="h-8 text-xs"
            />
            <div className="flex gap-1.5">
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => addNewCategory(target)}
                disabled={!newCustomLabel.trim()}
              >
                <Plus className="w-3 h-3 mr-1" />
                Pridať
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => { setAddingCustomFor(null); setNewCustomLabel(""); setNewCustomTerms(""); setNewCustomEmoji("🔍"); }}
              >
                Zrušiť
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1 w-full border-dashed"
            onClick={() => { setAddingCustomFor(target); setEditingCustomId(null); setNewCustomLabel(""); setNewCustomTerms(""); setNewCustomEmoji("🔍"); }}
          >
            <Plus className="w-3.5 h-3.5" />
            Pridať kategóriu
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight" data-testid="page-title">Watchery</h1>
          <p className="text-sm text-muted-foreground mt-1">Nastav čo hľadáš a SCAN nájde ponuky</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5" data-testid="add-watcher-button">
              <Plus className="w-4 h-4" />
              Nový watcher
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nový watcher</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-5 mt-2">
              {/* ── Job type, Remote ── */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Úväzok</Label>
                  <Select name="jobType" defaultValue="any">
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JOB_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Remote</Label>
                  <Select name="remoteOption" defaultValue="any">
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REMOTE_OPTIONS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* ── Location with geocoding ── */}
              <div className="space-y-1.5">
                <Label className="text-xs">📍 Lokácia (adresa alebo miesto)</Label>
                <p className="text-[10px] text-muted-foreground -mt-0.5">
                  Zadaj mesto alebo adresu — overenie GPS je voliteľné
                </p>
                <div className="flex gap-2">
                  <Input
                    value={createLocation}
                    onChange={(e) => { setCreateLocation(e.target.value); setCreateCoords(null); }}
                    placeholder="napr. Karlín, Praha"
                    className="h-9 text-xs flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs gap-1 px-2.5 shrink-0"
                    onClick={handleGeocodeCreate}
                    disabled={geocodingCreate || !createLocation.trim()}
                  >
                    {geocodingCreate ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />}
                    Overiť
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs gap-1 px-2.5 shrink-0"
                    onClick={() => detectMyLocation("create")}
                    disabled={detectingCreate}
                    title="Použiť moju polohu (ak ju zamietneš, zadaj lokáciu manuálne)"
                  >
                    {detectingCreate ? <Loader2 className="w-3 h-3 animate-spin" /> : <LocateFixed className="w-3 h-3" />}
                    Moja poloha
                  </Button>
                </div>
                {createCoords ? (
                  <p className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    GPS: {createCoords.lat.toFixed(4)}, {createCoords.lng.toFixed(4)} ✓
                  </p>
                ) : createLocation.trim() ? (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    GPS neoverené — funguje aj bez overenia, AI použije názov mesta
                  </p>
                ) : null}
              </div>

              {/* ── Country ── */}
              <div className="space-y-1.5">
                <Label className="text-xs">Krajina</Label>
                <Select value={createCountry} onValueChange={setCreateCountry}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <PortalPreview data={createPortals} selectedCountry={createCountry} />
              </div>

              {/* Name (optional – auto-generated from categories if empty) */}
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs text-muted-foreground">Názov (nepovinný)</Label>
                <Input id="name" name="name" placeholder="napr. Práca v Prahe" className="h-9" data-testid="watcher-name-input" />
              </div>

              {/* ── Categories checkbox list ── */}
              <div className="space-y-2">
                <Label className="font-semibold">Kategórie na vyhľadávanie</Label>
                <p className="text-[10px] text-muted-foreground -mt-1">
                  Vyber kategórie – SCAN prehľadá všetky portály a AI vyberie najlepšie ponuky.
                </p>
                {/* Load from CV */}
                {analyzedCvs.length > 0 && (
                  <div className="flex items-center gap-2 p-2 rounded-md border border-dashed border-violet-300 bg-violet-50 dark:bg-violet-900/10">
                    <Sparkles className="w-4 h-4 text-violet-500 shrink-0" />
                    <Select onValueChange={(cvId) => {
                      const cv = analyzedCvs.find(c => c.id === Number(cvId));
                      if (!cv) return;
                      try {
                        const analysis = JSON.parse((cv as any).cvAnalysis || "{}");
                        if (analysis.suggestedCategories?.length) {
                          setSelectedCategories(analysis.suggestedCategories);
                          toast({ title: "Kategórie načítané z CV ✓", description: `${analysis.suggestedCategories.length} kategórií z "${cv.name}"` });
                        }
                      } catch {}
                    }}>
                      <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Načítať kategórie z CV..." /></SelectTrigger>
                      <SelectContent>
                        {analyzedCvs.map(cv => <SelectItem key={cv.id} value={String(cv.id)}>{cv.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <CategoryList
                  categories={selectedCategories}
                  setCategories={setSelectedCategories}
                  target="create"
                />
              </div>

              {/* ── Min AI score ── */}
              <div className="space-y-1.5">
                <Label htmlFor="minMatchScore" className="text-xs">Min. AI skóre (0–100)</Label>
                <Input
                  id="minMatchScore"
                  name="minMatchScore"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue="50"
                  className="h-9 w-24 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsAddOpen(false)}>Zrušiť</Button>
                <Button type="submit" size="sm" disabled={createMutation.isPending || selectedCategories.length === 0} data-testid="watcher-submit-button">
                  {createMutation.isPending ? "Vytvárám…" : "Vytvoriť"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-6"><div className="h-16 bg-muted rounded" /></CardContent>
            </Card>
          ))}
        </div>
      ) : watchers.length === 0 ? (
        <Card className="border-card-border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Eye className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">Zatiaľ žiadne watchery</p>
            <p className="text-xs mt-1">Vytvor watcher, potom stlač SCAN na Dashboarde</p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={() => setIsAddOpen(true)} data-testid="empty-add-watcher">
              <Plus className="w-4 h-4" />
              Vytvoriť watcher
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2" data-testid="watchers-list">
          {watchers.map((watcher) => {
            const watcherCats = parseCategories((watcher as WatcherConfig & { jobCategories?: string }).jobCategories);

            return (
              <Card key={watcher.id} className={`border-card-border transition-opacity ${!watcher.isActive ? "opacity-50" : ""}`} data-testid={`watcher-card-${watcher.id}`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    {/* Left: info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold truncate">{watcher.name}</h3>
                        {watcher.isActive ? (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 shrink-0">
                            <Play className="w-2.5 h-2.5 mr-0.5" /> On
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                            <Pause className="w-2.5 h-2.5 mr-0.5" /> Off
                          </Badge>
                        )}
                      </div>
                      {/* Key info: location, job type, remote */}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {watcher.location}
                          <span title={countryTitle((watcher as any).country ?? "auto")}>
                            {COUNTRY_FLAGS[(watcher as any).country ?? "auto"] ?? "🌐"}
                          </span>
                          {(watcher as any).locationLat && (
                            <span className="text-green-600 dark:text-green-400" title={`GPS: ${(watcher as any).locationLat?.toFixed(4)}, ${(watcher as any).locationLng?.toFixed(4)}`}>📍</span>
                          )}
                        </span>
                        {watcher.jobType && (
                          <span className="flex items-center gap-1">
                            <Briefcase className="w-3 h-3" />
                            {jobTypeLabel(watcher.jobType)}
                          </span>
                        )}
                        {watcher.remoteOption && (
                          <span className="flex items-center gap-1">
                            <Laptop className="w-3 h-3" />
                            {remoteLabel(watcher.remoteOption)}
                          </span>
                        )}
                        {watcher.minMatchScore != null && (
                          <span className="text-[10px]">AI ≥{watcher.minMatchScore}</span>
                        )}
                      </div>
                      {/* Category badges */}
                      {watcherCats.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {watcherCats.map((cat) => (
                            <Badge key={cat.value} variant="secondary" className="text-[10px] px-1.5 py-0 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                              {cat.emoji} {cat.label}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Right: controls */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={watcher.isActive ?? true}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: watcher.id, isActive: checked })}
                        data-testid={`watcher-toggle-${watcher.id}`}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => openEditDialog(watcher)}
                        data-testid={`watcher-edit-${watcher.id}`}
                        title="Upraviť"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        disabled={runningId === watcher.id}
                        onClick={() => handleRunNow(watcher.id)}
                        data-testid={`watcher-run-${watcher.id}`}
                      >
                        {runningId === watcher.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Zap className="w-3 h-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate(watcher.id)}
                        data-testid={`watcher-delete-${watcher.id}`}
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

      {/* ── Edit watcher dialog ── */}
      <Dialog open={editWatcher !== null} onOpenChange={(open) => { if (!open) setEditWatcher(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>⚙️ Upraviť watcher</DialogTitle>
          </DialogHeader>
          {editWatcher && (
            <form onSubmit={handleEditSubmit} className="space-y-5 mt-2">
              {/* Job type, Remote */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Úväzok</Label>
                  <Select name="jobType" defaultValue={editWatcher.jobType ?? "any"}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JOB_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Remote</Label>
                  <Select name="remoteOption" defaultValue={editWatcher.remoteOption ?? "any"}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REMOTE_OPTIONS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Location with geocoding */}
              <div className="space-y-1.5">
                <Label className="text-xs">📍 Lokácia</Label>
                <div className="flex gap-2">
                  <Input
                    value={editLocation}
                    onChange={(e) => { setEditLocation(e.target.value); setEditCoords(null); }}
                    placeholder="napr. Karlín, Praha"
                    className="h-9 text-xs flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs gap-1 px-2.5 shrink-0"
                    onClick={handleGeocodeEdit}
                    disabled={geocodingEdit || !editLocation.trim()}
                  >
                    {geocodingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />}
                    Overiť
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs gap-1 px-2.5 shrink-0"
                    onClick={() => detectMyLocation("edit")}
                    disabled={detectingEdit}
                    title="Použiť moju polohu (ak ju zamietneš, zadaj lokáciu manuálne)"
                  >
                    {detectingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <LocateFixed className="w-3 h-3" />}
                    Moja poloha
                  </Button>
                </div>
                {editCoords ? (
                  <p className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    GPS: {editCoords.lat.toFixed(4)}, {editCoords.lng.toFixed(4)} ✓
                  </p>
                ) : editLocation.trim() ? (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    GPS neoverené — funguje aj bez overenia, AI použije názov mesta
                  </p>
                ) : null}
              </div>

              {/* Country */}
              <div className="space-y-1.5">
                <Label className="text-xs">Krajina</Label>
                <Select value={editCountry} onValueChange={setEditCountry}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <PortalPreview data={editPortals} selectedCountry={editCountry} />
              </div>

              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-name" className="text-xs text-muted-foreground">Názov</Label>
                <Input id="edit-name" name="name" defaultValue={editWatcher.name} className="h-9" />
              </div>

              {/* Categories checkbox list */}
              <div className="space-y-2">
                <Label className="font-semibold">Kategórie na vyhľadávanie</Label>
                <p className="text-[10px] text-muted-foreground -mt-1">
                  Vyber kategórie – SCAN prehľadá všetky portály a AI vyberie najlepšie ponuky.
                </p>
                {analyzedCvs.length > 0 && (
                  <div className="flex items-center gap-2 p-2 rounded-md border border-dashed border-violet-300 bg-violet-50 dark:bg-violet-900/10">
                    <Sparkles className="w-4 h-4 text-violet-500 shrink-0" />
                    <Select onValueChange={(cvId) => {
                      const cv = analyzedCvs.find(c => c.id === Number(cvId));
                      if (!cv) return;
                      try {
                        const analysis = JSON.parse((cv as any).cvAnalysis || "{}");
                        if (analysis.suggestedCategories?.length) {
                          setEditCategories(analysis.suggestedCategories);
                          toast({ title: "Kategórie načítané z CV ✓", description: `${analysis.suggestedCategories.length} kategórií z "${cv.name}"` });
                        }
                      } catch {}
                    }}>
                      <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Načítať kategórie z CV..." /></SelectTrigger>
                      <SelectContent>
                        {analyzedCvs.map(cv => <SelectItem key={cv.id} value={String(cv.id)}>{cv.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <CategoryList
                  categories={editCategories}
                  setCategories={setEditCategories}
                  target="edit"
                />
              </div>

              {/* Min AI score */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-minMatchScore" className="text-xs">Min. AI skóre (0–100)</Label>
                <Input
                  id="edit-minMatchScore"
                  name="minMatchScore"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={editWatcher.minMatchScore ?? 50}
                  className="h-9 w-24 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditWatcher(null)}>Zrušiť</Button>
                <Button type="submit" size="sm" disabled={updateMutation.isPending || editCategories.length === 0}>
                  {updateMutation.isPending ? "Ukladám…" : "Uložiť"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
