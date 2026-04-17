import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { User, Plus, Save, Trash2, Settings, Mail, Phone, Linkedin, Banknote } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile } from "@shared/schema";
import { useState } from "react";

const emptyForm = {
  fullName: "",
  email: "",
  phone: "",
  linkedIn: "",
  minSalaryFullTime: "",
  minSalaryPartTime: "",
};

export default function Profile() {
  const { toast } = useToast();
  const { data: profiles = [], isLoading } = useQuery<UserProfile[]>({
    queryKey: ["/api/profiles"],
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setIsDialogOpen(true);
  };

  const openEdit = (p: UserProfile) => {
    setEditingId(p.id);
    setForm({
      fullName: p.fullName || "",
      email: p.email || "",
      phone: p.phone || "",
      linkedIn: p.linkedIn || "",
      minSalaryFullTime: p.minSalaryFullTime?.toString() || "",
      minSalaryPartTime: p.minSalaryPartTime?.toString() || "",
    });
    setIsDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        fullName: form.fullName,
        email: form.email,
        phone: form.phone || null,
        linkedIn: form.linkedIn || null,
        minSalaryFullTime: form.minSalaryFullTime ? Number(form.minSalaryFullTime) : null,
        minSalaryPartTime: form.minSalaryPartTime ? Number(form.minSalaryPartTime) : null,
      };
      if (editingId) {
        await apiRequest("PATCH", `/api/profiles/${editingId}`, body);
      } else {
        await apiRequest("POST", "/api/profiles", body);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      setIsDialogOpen(false);
      toast({ title: editingId ? "Profil aktualizovaný ✓" : "Profil vytvorený ✓" });
    },
    onError: () => {
      toast({ title: "Chyba", description: "Nepodarilo sa uložiť profil.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/profiles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      toast({ title: "Profil zmazaný" });
    },
  });

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold" data-testid="page-title">Profily</h1>
        <Card className="animate-pulse">
          <CardContent className="py-8"><div className="h-48 bg-muted rounded" /></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold" data-testid="page-title">Profily</h1>
        <p className="text-sm text-muted-foreground mt-1">Tvoje osobné profily</p>
      </div>

      {/* Existing profiles */}
      {profiles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {profiles.map((p) => (
            <Card key={p.id} className="border-card-border relative group">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    {p.fullName}
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                      <Settings className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(p.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{p.email}</span>
                </div>
                {p.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span>{p.phone}</span>
                  </div>
                )}
                {p.linkedIn && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Linkedin className="w-3.5 h-3.5 shrink-0" />
                    <a href={p.linkedIn} target="_blank" rel="noopener noreferrer" className="truncate hover:text-primary transition-colors">
                      {p.linkedIn.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "").replace(/\/$/, "") || p.linkedIn}
                    </a>
                  </div>
                )}
                {(p.minSalaryFullTime || p.minSalaryPartTime) && (
                  <div className="flex items-center gap-2 text-muted-foreground pt-1 border-t border-border mt-2">
                    <Banknote className="w-3.5 h-3.5 shrink-0" />
                    <div className="flex flex-col text-xs">
                      {p.minSalaryFullTime != null && <span>Plný: {p.minSalaryFullTime.toLocaleString("cs-CZ")} CZK</span>}
                      {p.minSalaryPartTime != null && <span>Polovičný: {p.minSalaryPartTime.toLocaleString("cs-CZ")} CZK</span>}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {profiles.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <User className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Zatiaľ nemáš žiadny profil.</p>
            <p className="text-xs mt-1">Vytvor si prvý profil kliknutím na tlačidlo nižšie.</p>
          </CardContent>
        </Card>
      )}

      {/* Add new profile button */}
      <Button variant="outline" className="gap-2" onClick={openNew}>
        <Plus className="w-4 h-4" />
        Pridať profil
      </Button>

      {/* Dialog for create / edit */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Upraviť profil" : "Nový profil"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Meno a priezvisko *</Label>
              <Input
                id="fullName"
                value={form.fullName}
                onChange={(e) => handleChange("fullName", e.target.value)}
                placeholder="Ján Novák"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="jan@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefón</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                placeholder="+420 123 456 789"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkedIn">LinkedIn</Label>
              <Input
                id="linkedIn"
                value={form.linkedIn}
                onChange={(e) => handleChange("linkedIn", e.target.value)}
                placeholder="https://linkedin.com/in/..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="minSalaryFullTime">Min. plat – plný úväzok</Label>
                <Input
                  id="minSalaryFullTime"
                  type="number"
                  value={form.minSalaryFullTime}
                  onChange={(e) => handleChange("minSalaryFullTime", e.target.value)}
                  placeholder="40000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minSalaryPartTime">Min. plat – ½ úväzok</Label>
                <Input
                  id="minSalaryPartTime"
                  type="number"
                  value={form.minSalaryPartTime}
                  onChange={(e) => handleChange("minSalaryPartTime", e.target.value)}
                  placeholder="20000"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending} className="gap-1.5">
                <Save className="w-4 h-4" />
                {saveMutation.isPending ? "Ukladám..." : editingId ? "Uložiť zmeny" : "Vytvoriť profil"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
