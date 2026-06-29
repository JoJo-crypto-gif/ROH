import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Contrast, Moon, Palette, Save, Sun, Type, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTheme, FONT_SCALES } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/rbac";
import { academicApi } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

const emptyProfile = {
  name: "",
  motto: "",
  address: "",
  phone: "",
  email: "",
  logoUrl: "",
  headteacherName: "",
  reportFooter: "",
};

function SettingsPage() {
  const {
    mode,
    color,
    fontScale,
    highContrast,
    logo,
    brandName,
    setMode,
    setColor,
    setFontScale,
    setHighContrast,
    setLogo,
    setBrandName,
    presets,
  } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission(user, "academic.manage");
  const fileRef = useRef<HTMLInputElement>(null);
  const profileQuery = useQuery({
    queryKey: ["school-profile"],
    queryFn: academicApi.getSchoolProfile,
    enabled: canManage,
  });
  const settingsQuery = useQuery({
    queryKey: ["academic-settings"],
    queryFn: academicApi.getSettings,
    enabled: canManage,
  });
  const [profile, setProfile] = useState(emptyProfile);
  useEffect(() => {
    if (!profileQuery.data?.profile) return;
    setProfile(
      Object.fromEntries(
        Object.keys(emptyProfile).map((key) => [key, profileQuery.data!.profile[key] ?? ""]),
      ) as typeof emptyProfile,
    );
  }, [profileQuery.data]);

  const saveProfile = useMutation({
    mutationFn: () => academicApi.updateSchoolProfile(profile),
    onSuccess: ({ profile: saved }) => {
      toast.success("School profile saved");
      if (typeof saved.name === "string") setBrandName(saved.name);
      if (typeof saved.logoUrl === "string") setLogo(saved.logoUrl || null);
      queryClient.invalidateQueries({ queryKey: ["school-profile"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Unable to save school profile"),
  });
  const saveTermCount = useMutation({
    mutationFn: (defaultTermCount: number) => academicApi.updateSettings({ defaultTermCount }),
    onSuccess: () => {
      toast.success("Default term count saved");
      queryClient.invalidateQueries({ queryKey: ["academic-settings"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Unable to update term count"),
  });
  const uploadLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) return void toast.error("Logo must be under 1 MB");
    const reader = new FileReader();
    reader.onload = () => setProfile((current) => ({ ...current, logoUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="School report branding and personal workspace preferences."
      />
      {canManage && (
        <section className="rounded-xl border bg-card p-6">
          <h2 className="font-semibold">School profile and report branding</h2>
          <p className="text-sm text-muted-foreground">
            These details are frozen into every published report-card version.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="School name"
              value={profile.name}
              onChange={(value) => setProfile({ ...profile, name: value })}
            />
            <Field
              label="Motto"
              value={profile.motto}
              onChange={(value) => setProfile({ ...profile, motto: value })}
            />
            <Field
              label="Address"
              value={profile.address}
              onChange={(value) => setProfile({ ...profile, address: value })}
            />
            <Field
              label="Phone"
              value={profile.phone}
              onChange={(value) => setProfile({ ...profile, phone: value })}
            />
            <Field
              label="Email"
              value={profile.email}
              onChange={(value) => setProfile({ ...profile, email: value })}
            />
            <Field
              label="Headteacher name"
              value={profile.headteacherName}
              onChange={(value) => setProfile({ ...profile, headteacherName: value })}
            />
            <div className="md:col-span-2">
              <Field
                label="Report footer"
                value={profile.reportFooter}
                onChange={(value) => setProfile({ ...profile, reportFooter: value })}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-xl border bg-muted/30">
              {profile.logoUrl ? (
                <img
                  src={profile.logoUrl}
                  alt="School logo"
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-xs text-muted-foreground">No logo</span>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={uploadLogo}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1.5 h-4 w-4" />
              Choose logo
            </Button>
            <Button
              onClick={() => saveProfile.mutate()}
              disabled={!profile.name || saveProfile.isPending}
            >
              <Save className="mr-1.5 h-4 w-4" />
              Save profile
            </Button>
          </div>
          <div className="mt-6 max-w-sm border-t pt-4">
            <Label>Default terms for new academic years</Label>
            <select
              className="mt-2 h-9 w-full rounded-md border bg-background px-3"
              value={settingsQuery.data?.settings.defaultTermCount ?? 3}
              onChange={(event) => saveTermCount.mutate(Number(event.target.value))}
            >
              {[1, 2, 3, 4].map((count) => (
                <option key={count} value={count}>
                  {count} terms
                </option>
              ))}
            </select>
          </div>
        </section>
      )}
      <section className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold">Appearance</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 max-w-xl">
          {(["light", "dark"] as const).map((themeMode) => {
            const Icon = themeMode === "light" ? Sun : Moon;
            return (
              <button
                key={themeMode}
                onClick={() => setMode(themeMode)}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-4 text-left",
                  mode === themeMode && "border-ring bg-accent/30 ring-2 ring-ring/30",
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="flex-1 capitalize">{themeMode}</span>
                {mode === themeMode && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
        <h3 className="mt-6 flex items-center gap-2 text-sm font-semibold">
          <Palette className="h-4 w-4" />
          Accent colour
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setColor(preset.id)}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 text-left",
                color === preset.id && "border-ring ring-2 ring-ring/30",
              )}
            >
              <span className="h-8 w-8 rounded-md border" style={{ background: preset.swatch }} />
              <span className="flex-1 text-sm font-medium">{preset.name}</span>
              {color === preset.id && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold">Accessibility</h2>
        <Label className="mt-5 flex items-center gap-2">
          <Type className="h-4 w-4" />
          Font size
        </Label>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {FONT_SCALES.map((scale) => (
            <button
              key={scale.id}
              onClick={() => setFontScale(scale.id)}
              className={cn(
                "rounded-lg border p-3 text-left",
                fontScale === scale.id && "border-ring bg-accent/30 ring-2 ring-ring/30",
              )}
            >
              <span style={{ fontSize: `${scale.px}px` }}>Aa</span>
              <span className="ml-2 text-xs text-muted-foreground">{scale.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-5 flex max-w-xl items-center justify-between rounded-lg border p-4">
          <div className="flex gap-3">
            <Contrast className="h-5 w-5" />
            <div>
              <div className="text-sm font-medium">High contrast</div>
              <div className="text-xs text-muted-foreground">
                Stronger text contrast and focus rings.
              </div>
            </div>
          </div>
          <Switch checked={highContrast} onCheckedChange={setHighContrast} />
        </div>
        <div className="mt-5 max-w-md">
          <Label>Local workspace name</Label>
          <Input
            className="mt-2"
            value={brandName}
            onChange={(event) => setBrandName(event.target.value)}
          />
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input className="mt-1.5" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
