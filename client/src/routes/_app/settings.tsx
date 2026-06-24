import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type ChangeEvent } from "react";
import { Sun, Moon, Check, Palette, Upload, Trash2, Type, Contrast, User as UserIcon, Save } from "lucide-react";
import { useTheme, FONT_SCALES } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const {
    mode, color, fontScale, highContrast, logo, brandName,
    setMode, setColor, setFontScale, setHighContrast, setLogo, setBrandName, presets,
  } = useTheme();
  const { user } = useAuth();

  const fileRef = useRef<HTMLInputElement>(null);
  const [brandDraft, setBrandDraft] = useState(brandName);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  const onUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 1024 * 1024) { toast.error("Logo must be under 1 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setLogo(reader.result as string);
      toast.success("Logo updated");
    };
    reader.readAsDataURL(f);
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description="Personalize your workspace, branding, and accessibility." />

      {/* PROFILE */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-muted-foreground" /> Profile
        </h2>
        <p className="text-sm text-muted-foreground">Each demo user keeps their own profile and theme preferences.</p>

        <div className="mt-5 flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-xl bg-brand text-brand-foreground text-base font-semibold">
            {user?.avatarInitials}
          </span>
          <div>
            <div className="text-sm font-medium">{user?.name}</div>
            <div className="text-xs text-muted-foreground">{user?.roleName} · {user?.email}</div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 max-w-2xl">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Full name</Label>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="mt-4">
          <Button
            size="sm"
            onClick={() => {
              // TODO: Wire up profile update API
              toast.success("Profile updated (saved locally)");
            }}
          >
            <Save className="h-4 w-4 mr-1.5" /> Save profile
          </Button>
        </div>
      </section>

      {/* APPEARANCE */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground">These preferences are saved per user.</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 max-w-md">
          <button
            onClick={() => setMode("light")}
            className={cn("flex items-center gap-3 rounded-lg border p-4 text-left transition",
              mode === "light" ? "border-ring ring-2 ring-ring/30 bg-accent/40" : "border-border hover:bg-muted/40")}
          >
            <div className="grid h-10 w-10 place-items-center rounded-md bg-background border border-border">
              <Sun className="h-5 w-5 text-warning" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">Light</div>
              <div className="text-xs text-muted-foreground">Bright & clean</div>
            </div>
            {mode === "light" && <Check className="h-4 w-4 text-primary" />}
          </button>

          <button
            onClick={() => setMode("dark")}
            className={cn("flex items-center gap-3 rounded-lg border p-4 text-left transition",
              mode === "dark" ? "border-ring ring-2 ring-ring/30 bg-accent/40" : "border-border hover:bg-muted/40")}
          >
            <div className="grid h-10 w-10 place-items-center rounded-md bg-foreground/90">
              <Moon className="h-5 w-5 text-background" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">Dark</div>
              <div className="text-xs text-muted-foreground">Easy on the eyes</div>
            </div>
            {mode === "dark" && <Check className="h-4 w-4 text-primary" />}
          </button>
        </div>

        <h3 className="mt-7 text-sm font-semibold flex items-center gap-2">
          <Palette className="h-4 w-4 text-muted-foreground" /> Accent color
        </h3>
        <p className="text-xs text-muted-foreground">Drives buttons, charts, sidebar highlights and the header brand chip.</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {presets.map(p => {
            const active = p.id === color;
            return (
              <button
                key={p.id}
                onClick={() => setColor(p.id)}
                className={cn("group flex items-center gap-3 rounded-lg border p-3 text-left transition",
                  active ? "border-ring ring-2 ring-ring/30 bg-accent/30" : "border-border hover:bg-muted/40")}
              >
                <span className="h-9 w-9 rounded-md border border-border shadow-inner" style={{ background: p.swatch }} />
                <div className="flex-1">
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{p.id}</div>
                </div>
                {active && <Check className="h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* BRANDING */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold">Branding</h2>
        <p className="text-sm text-muted-foreground">
          Upload your school logo and set the workspace name. The header and sidebar accents follow your selected theme color automatically.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-5">
          <div className="grid h-20 w-20 place-items-center rounded-xl border border-border bg-muted/40 overflow-hidden">
            {logo ? (
              <img src={logo} alt="Current logo" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">No logo</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1.5" /> Upload logo
              </Button>
              {logo && (
                <Button size="sm" variant="ghost" onClick={() => { setLogo(null); toast.success("Logo removed"); }}>
                  <Trash2 className="h-4 w-4 mr-1.5" /> Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">PNG, JPG or SVG · max 1 MB · square works best.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-2 max-w-md">
          <Label htmlFor="brand-name">Workspace name</Label>
          <div className="flex gap-2">
            <Input id="brand-name" value={brandDraft} onChange={(e) => setBrandDraft(e.target.value)} />
            <Button
              size="sm"
              onClick={() => { setBrandName(brandDraft); toast.success("Workspace name updated"); }}
            >
              Save
            </Button>
          </div>
        </div>
      </section>

      {/* ACCESSIBILITY */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold">Accessibility</h2>
        <p className="text-sm text-muted-foreground">Adjust text size and contrast across the entire app.</p>

        <div className="mt-5">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Type className="h-4 w-4 text-muted-foreground" /> Font size
          </Label>
          <div className="mt-3 grid gap-2 sm:grid-cols-4 max-w-2xl">
            {FONT_SCALES.map(f => {
              const active = f.id === fontScale;
              return (
                <button
                  key={f.id}
                  onClick={() => setFontScale(f.id)}
                  className={cn("rounded-lg border p-3 text-left transition",
                    active ? "border-ring ring-2 ring-ring/30 bg-accent/30" : "border-border hover:bg-muted/40")}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium" style={{ fontSize: `${f.px}px` }}>Aa</span>
                    {active && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{f.label} · {f.px}px</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between rounded-lg border border-border p-4 max-w-2xl">
          <div className="flex items-start gap-3">
            <Contrast className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <div className="text-sm font-medium">High contrast mode</div>
              <div className="text-xs text-muted-foreground">Maximises text contrast and adds strong focus rings.</div>
            </div>
          </div>
          <Switch checked={highContrast} onCheckedChange={setHighContrast} />
        </div>
      </section>
    </div>
  );
}
