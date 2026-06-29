import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

export type ThemeMode = "light" | "dark";
export type ThemeColor = "teal" | "emerald" | "blue" | "violet" | "rose" | "amber" | "red";
export type FontScale = "sm" | "md" | "lg" | "xl";

export interface ColorPreset {
  id: ThemeColor;
  name: string;
  swatch: string;
  light: {
    brand: string;
    brandFg: string;
    brandAccent: string;
    primary: string;
    primaryFg: string;
    ring: string;
    accent: string;
    accentFg: string;
    sidebarAccent: string;
    sidebarAccentFg: string;
    chart1: string;
    chart2: string;
  };
  dark: {
    brand: string;
    brandFg: string;
    brandAccent: string;
    primary: string;
    primaryFg: string;
    ring: string;
    accent: string;
    accentFg: string;
    sidebarAccent: string;
    sidebarAccentFg: string;
    chart1: string;
    chart2: string;
  };
}

export const COLOR_PRESETS: ColorPreset[] = [
  {
    id: "teal",
    name: "Teal Mint",
    swatch: "oklch(0.32 0.06 185)",
    light: {
      brand: "oklch(0.32 0.06 185)",
      brandFg: "oklch(0.98 0.01 180)",
      brandAccent: "oklch(0.75 0.18 155)",
      primary: "oklch(0.32 0.06 185)",
      primaryFg: "oklch(0.98 0.01 180)",
      ring: "oklch(0.45 0.08 185)",
      accent: "oklch(0.94 0.03 165)",
      accentFg: "oklch(0.25 0.05 185)",
      sidebarAccent: "oklch(0.95 0.02 170)",
      sidebarAccentFg: "oklch(0.25 0.05 185)",
      chart1: "oklch(0.32 0.06 185)",
      chart2: "oklch(0.75 0.18 155)",
    },
    dark: {
      brand: "oklch(0.35 0.07 185)",
      brandFg: "oklch(0.98 0.01 180)",
      brandAccent: "oklch(0.75 0.18 155)",
      primary: "oklch(0.75 0.18 155)",
      primaryFg: "oklch(0.18 0.04 180)",
      ring: "oklch(0.6 0.1 185)",
      accent: "oklch(0.28 0.05 180)",
      accentFg: "oklch(0.97 0.01 180)",
      sidebarAccent: "oklch(0.25 0.04 185)",
      sidebarAccentFg: "oklch(0.98 0.01 180)",
      chart1: "oklch(0.35 0.07 185)",
      chart2: "oklch(0.75 0.18 155)",
    },
  },
  {
    id: "emerald",
    name: "Emerald",
    swatch: "oklch(0.55 0.16 155)",
    light: {
      brand: "oklch(0.42 0.12 155)",
      brandFg: "oklch(0.98 0.01 155)",
      brandAccent: "oklch(0.78 0.18 145)",
      primary: "oklch(0.42 0.12 155)",
      primaryFg: "oklch(0.98 0.01 155)",
      ring: "oklch(0.5 0.13 155)",
      accent: "oklch(0.94 0.04 155)",
      accentFg: "oklch(0.28 0.08 155)",
      sidebarAccent: "oklch(0.95 0.03 155)",
      sidebarAccentFg: "oklch(0.28 0.08 155)",
      chart1: "oklch(0.42 0.12 155)",
      chart2: "oklch(0.78 0.18 145)",
    },
    dark: {
      brand: "oklch(0.45 0.13 155)",
      brandFg: "oklch(0.98 0.01 155)",
      brandAccent: "oklch(0.78 0.18 145)",
      primary: "oklch(0.78 0.18 145)",
      primaryFg: "oklch(0.18 0.04 155)",
      ring: "oklch(0.6 0.14 155)",
      accent: "oklch(0.3 0.07 155)",
      accentFg: "oklch(0.97 0.01 155)",
      sidebarAccent: "oklch(0.28 0.06 155)",
      sidebarAccentFg: "oklch(0.98 0.01 155)",
      chart1: "oklch(0.45 0.13 155)",
      chart2: "oklch(0.78 0.18 145)",
    },
  },
  {
    id: "blue",
    name: "Ocean Blue",
    swatch: "oklch(0.5 0.17 250)",
    light: {
      brand: "oklch(0.4 0.15 250)",
      brandFg: "oklch(0.98 0.01 250)",
      brandAccent: "oklch(0.72 0.16 230)",
      primary: "oklch(0.4 0.15 250)",
      primaryFg: "oklch(0.98 0.01 250)",
      ring: "oklch(0.5 0.16 250)",
      accent: "oklch(0.94 0.04 240)",
      accentFg: "oklch(0.28 0.1 250)",
      sidebarAccent: "oklch(0.95 0.03 240)",
      sidebarAccentFg: "oklch(0.28 0.1 250)",
      chart1: "oklch(0.4 0.15 250)",
      chart2: "oklch(0.72 0.16 230)",
    },
    dark: {
      brand: "oklch(0.45 0.16 250)",
      brandFg: "oklch(0.98 0.01 250)",
      brandAccent: "oklch(0.75 0.16 230)",
      primary: "oklch(0.72 0.16 240)",
      primaryFg: "oklch(0.18 0.04 250)",
      ring: "oklch(0.6 0.15 250)",
      accent: "oklch(0.3 0.08 245)",
      accentFg: "oklch(0.97 0.01 250)",
      sidebarAccent: "oklch(0.28 0.07 245)",
      sidebarAccentFg: "oklch(0.98 0.01 250)",
      chart1: "oklch(0.45 0.16 250)",
      chart2: "oklch(0.75 0.16 230)",
    },
  },
  {
    id: "violet",
    name: "Royal Violet",
    swatch: "oklch(0.5 0.2 295)",
    light: {
      brand: "oklch(0.42 0.18 295)",
      brandFg: "oklch(0.98 0.01 295)",
      brandAccent: "oklch(0.72 0.18 310)",
      primary: "oklch(0.42 0.18 295)",
      primaryFg: "oklch(0.98 0.01 295)",
      ring: "oklch(0.5 0.18 295)",
      accent: "oklch(0.95 0.04 295)",
      accentFg: "oklch(0.3 0.12 295)",
      sidebarAccent: "oklch(0.95 0.04 300)",
      sidebarAccentFg: "oklch(0.3 0.12 295)",
      chart1: "oklch(0.42 0.18 295)",
      chart2: "oklch(0.72 0.18 310)",
    },
    dark: {
      brand: "oklch(0.45 0.18 295)",
      brandFg: "oklch(0.98 0.01 295)",
      brandAccent: "oklch(0.75 0.18 310)",
      primary: "oklch(0.72 0.18 305)",
      primaryFg: "oklch(0.18 0.05 295)",
      ring: "oklch(0.6 0.17 295)",
      accent: "oklch(0.3 0.1 295)",
      accentFg: "oklch(0.97 0.01 295)",
      sidebarAccent: "oklch(0.28 0.08 295)",
      sidebarAccentFg: "oklch(0.98 0.01 295)",
      chart1: "oklch(0.45 0.18 295)",
      chart2: "oklch(0.75 0.18 310)",
    },
  },
  {
    id: "rose",
    name: "Rose Pink",
    swatch: "oklch(0.62 0.2 5)",
    light: {
      brand: "oklch(0.5 0.18 5)",
      brandFg: "oklch(0.98 0.01 5)",
      brandAccent: "oklch(0.75 0.17 20)",
      primary: "oklch(0.5 0.18 5)",
      primaryFg: "oklch(0.98 0.01 5)",
      ring: "oklch(0.58 0.18 5)",
      accent: "oklch(0.95 0.04 5)",
      accentFg: "oklch(0.35 0.12 5)",
      sidebarAccent: "oklch(0.95 0.04 10)",
      sidebarAccentFg: "oklch(0.35 0.12 5)",
      chart1: "oklch(0.5 0.18 5)",
      chart2: "oklch(0.75 0.17 20)",
    },
    dark: {
      brand: "oklch(0.5 0.18 5)",
      brandFg: "oklch(0.98 0.01 5)",
      brandAccent: "oklch(0.75 0.17 20)",
      primary: "oklch(0.72 0.18 10)",
      primaryFg: "oklch(0.18 0.04 5)",
      ring: "oklch(0.6 0.18 5)",
      accent: "oklch(0.3 0.1 5)",
      accentFg: "oklch(0.97 0.01 5)",
      sidebarAccent: "oklch(0.28 0.08 5)",
      sidebarAccentFg: "oklch(0.98 0.01 5)",
      chart1: "oklch(0.5 0.18 5)",
      chart2: "oklch(0.75 0.17 20)",
    },
  },
  {
    id: "amber",
    name: "Sunset Amber",
    swatch: "oklch(0.75 0.16 75)",
    light: {
      brand: "oklch(0.55 0.15 60)",
      brandFg: "oklch(0.98 0.01 70)",
      brandAccent: "oklch(0.8 0.17 75)",
      primary: "oklch(0.55 0.15 60)",
      primaryFg: "oklch(0.98 0.01 70)",
      ring: "oklch(0.62 0.15 65)",
      accent: "oklch(0.95 0.05 75)",
      accentFg: "oklch(0.35 0.1 60)",
      sidebarAccent: "oklch(0.95 0.04 70)",
      sidebarAccentFg: "oklch(0.35 0.1 60)",
      chart1: "oklch(0.55 0.15 60)",
      chart2: "oklch(0.8 0.17 75)",
    },
    dark: {
      brand: "oklch(0.5 0.14 60)",
      brandFg: "oklch(0.98 0.01 70)",
      brandAccent: "oklch(0.8 0.17 75)",
      primary: "oklch(0.78 0.17 75)",
      primaryFg: "oklch(0.18 0.04 60)",
      ring: "oklch(0.6 0.15 65)",
      accent: "oklch(0.3 0.08 65)",
      accentFg: "oklch(0.97 0.01 70)",
      sidebarAccent: "oklch(0.28 0.07 65)",
      sidebarAccentFg: "oklch(0.98 0.01 70)",
      chart1: "oklch(0.5 0.14 60)",
      chart2: "oklch(0.8 0.17 75)",
    },
  },
  {
    id: "red",
    name: "Crimson",
    swatch: "oklch(0.55 0.22 27)",
    light: {
      brand: "oklch(0.48 0.2 27)",
      brandFg: "oklch(0.98 0.01 25)",
      brandAccent: "oklch(0.72 0.18 40)",
      primary: "oklch(0.48 0.2 27)",
      primaryFg: "oklch(0.98 0.01 25)",
      ring: "oklch(0.55 0.2 27)",
      accent: "oklch(0.95 0.04 27)",
      accentFg: "oklch(0.32 0.12 27)",
      sidebarAccent: "oklch(0.95 0.04 30)",
      sidebarAccentFg: "oklch(0.32 0.12 27)",
      chart1: "oklch(0.48 0.2 27)",
      chart2: "oklch(0.72 0.18 40)",
    },
    dark: {
      brand: "oklch(0.48 0.2 27)",
      brandFg: "oklch(0.98 0.01 25)",
      brandAccent: "oklch(0.72 0.18 40)",
      primary: "oklch(0.7 0.2 30)",
      primaryFg: "oklch(0.18 0.04 25)",
      ring: "oklch(0.6 0.2 27)",
      accent: "oklch(0.3 0.1 27)",
      accentFg: "oklch(0.97 0.01 25)",
      sidebarAccent: "oklch(0.28 0.08 27)",
      sidebarAccentFg: "oklch(0.98 0.01 25)",
      chart1: "oklch(0.48 0.2 27)",
      chart2: "oklch(0.72 0.18 40)",
    },
  },
];

export const FONT_SCALES: { id: FontScale; label: string; px: number }[] = [
  { id: "sm", label: "Small", px: 14 },
  { id: "md", label: "Default", px: 16 },
  { id: "lg", label: "Large", px: 18 },
  { id: "xl", label: "Extra large", px: 20 },
];

interface ThemeContextValue {
  mode: ThemeMode;
  color: ThemeColor;
  fontScale: FontScale;
  highContrast: boolean;
  logo: string | null;
  brandName: string;
  setMode: (m: ThemeMode) => void;
  setColor: (c: ThemeColor) => void;
  setFontScale: (s: FontScale) => void;
  setHighContrast: (v: boolean) => void;
  setLogo: (dataUrl: string | null) => void;
  setBrandName: (name: string) => void;
  presets: ColorPreset[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const PER_USER_KEY = (uid: string) => `roh.prefs.${uid}`;
const BRAND_LOGO_KEY = "roh.brand.logo";
const BRAND_NAME_KEY = "roh.brand.name";

interface UserPrefs {
  mode: ThemeMode;
  color: ThemeColor;
  fontScale: FontScale;
  highContrast: boolean;
}
const DEFAULT_PREFS: UserPrefs = {
  mode: "light",
  color: "teal",
  fontScale: "md",
  highContrast: false,
};

function loadUserPrefs(uid: string | undefined): UserPrefs {
  if (!uid || typeof localStorage === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(PER_USER_KEY(uid));
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}
function saveUserPrefs(uid: string, prefs: UserPrefs) {
  localStorage.setItem(PER_USER_KEY(uid), JSON.stringify(prefs));
}

function applyTheme(prefs: UserPrefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", prefs.mode === "dark");
  root.classList.toggle("high-contrast", prefs.highContrast);
  const preset = COLOR_PRESETS.find((p) => p.id === prefs.color) ?? COLOR_PRESETS[0];
  const tokens = prefs.mode === "dark" ? preset.dark : preset.light;
  const map: Record<string, string> = {
    "--brand": tokens.brand,
    "--brand-foreground": tokens.brandFg,
    "--brand-accent": tokens.brandAccent,
    "--primary": tokens.primary,
    "--primary-foreground": tokens.primaryFg,
    "--ring": tokens.ring,
    "--accent": tokens.accent,
    "--accent-foreground": tokens.accentFg,
    "--sidebar-accent": tokens.sidebarAccent,
    "--sidebar-accent-foreground": tokens.sidebarAccentFg,
    "--chart-1": tokens.chart1,
    "--chart-2": tokens.chart2,
  };
  for (const [k, v] of Object.entries(map)) root.style.setProperty(k, v);
  const px = FONT_SCALES.find((f) => f.id === prefs.fontScale)?.px ?? 16;
  root.style.fontSize = `${px}px`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id;
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);
  const [logo, setLogoState] = useState<string | null>(null);
  const [brandName, setBrandNameState] = useState<string>("Rays Of Hope");

  // Load brand-level
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    setLogoState(localStorage.getItem(BRAND_LOGO_KEY));
    setBrandNameState(localStorage.getItem(BRAND_NAME_KEY) || "Rays Of Hope");
  }, []);

  // Load user-level whenever user changes
  useEffect(() => {
    const p = loadUserPrefs(uid);
    setPrefs(p);
    applyTheme(p);
  }, [uid]);

  const persist = (p: UserPrefs) => {
    setPrefs(p);
    applyTheme(p);
    if (uid) saveUserPrefs(uid, p);
  };

  const value: ThemeContextValue = {
    mode: prefs.mode,
    color: prefs.color,
    fontScale: prefs.fontScale,
    highContrast: prefs.highContrast,
    logo,
    brandName,
    setMode: (mode) => persist({ ...prefs, mode }),
    setColor: (color) => persist({ ...prefs, color }),
    setFontScale: (fontScale) => persist({ ...prefs, fontScale }),
    setHighContrast: (highContrast) => persist({ ...prefs, highContrast }),
    setLogo: (l) => {
      setLogoState(l);
      if (l) localStorage.setItem(BRAND_LOGO_KEY, l);
      else localStorage.removeItem(BRAND_LOGO_KEY);
    },
    setBrandName: (n) => {
      const v = n.trim() || "Rays Of Hope";
      setBrandNameState(v);
      localStorage.setItem(BRAND_NAME_KEY, v);
    },
    presets: COLOR_PRESETS,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
