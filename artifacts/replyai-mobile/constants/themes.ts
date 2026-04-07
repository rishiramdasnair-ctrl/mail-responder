export type ThemeId = "default" | "midnight" | "ocean" | "sage" | "blush" | "sand";

export interface ColorPalette {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  radius: number;
}

export interface ThemeDef {
  id: ThemeId;
  label: string;
  swatch: string;
  dark: boolean;
  palette: ColorPalette;
}

const BASE_RADIUS = 8;

export const THEMES: ThemeDef[] = [
  {
    id: "default",
    label: "Default",
    swatch: "#141414",
    dark: false,
    palette: {
      background: "#ffffff",
      foreground: "#141414",
      card: "#ffffff",
      cardForeground: "#141414",
      primary: "#141414",
      primaryForeground: "#ffffff",
      secondary: "#f2f2f2",
      secondaryForeground: "#262626",
      muted: "#f2f2f2",
      mutedForeground: "#737373",
      accent: "#f2f2f2",
      accentForeground: "#141414",
      destructive: "#e53e3e",
      destructiveForeground: "#ffffff",
      border: "#e0e0e0",
      input: "#e0e0e0",
      radius: BASE_RADIUS,
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    swatch: "#0a0a0a",
    dark: true,
    palette: {
      background: "#0a0a0a",
      foreground: "#f0f0f0",
      card: "#141414",
      cardForeground: "#f0f0f0",
      primary: "#f0f0f0",
      primaryForeground: "#0a0a0a",
      secondary: "#222222",
      secondaryForeground: "#e0e0e0",
      muted: "#1c1c1c",
      mutedForeground: "#888888",
      accent: "#222222",
      accentForeground: "#f0f0f0",
      destructive: "#c53030",
      destructiveForeground: "#ffffff",
      border: "#272727",
      input: "#272727",
      radius: BASE_RADIUS,
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    swatch: "#2563eb",
    dark: false,
    palette: {
      background: "#eef4ff",
      foreground: "#0f1f40",
      card: "#ffffff",
      cardForeground: "#0f1f40",
      primary: "#2563eb",
      primaryForeground: "#ffffff",
      secondary: "#dce8ff",
      secondaryForeground: "#1e3a70",
      muted: "#dce8ff",
      mutedForeground: "#4d6a9e",
      accent: "#dce8ff",
      accentForeground: "#0f1f40",
      destructive: "#dc2626",
      destructiveForeground: "#ffffff",
      border: "#c0d4f7",
      input: "#c0d4f7",
      radius: BASE_RADIUS,
    },
  },
  {
    id: "sage",
    label: "Sage",
    swatch: "#16a34a",
    dark: false,
    palette: {
      background: "#f0faf2",
      foreground: "#0d2b18",
      card: "#ffffff",
      cardForeground: "#0d2b18",
      primary: "#16a34a",
      primaryForeground: "#ffffff",
      secondary: "#d8f0e1",
      secondaryForeground: "#1a4a2a",
      muted: "#d8f0e1",
      mutedForeground: "#3d7555",
      accent: "#d8f0e1",
      accentForeground: "#0d2b18",
      destructive: "#dc2626",
      destructiveForeground: "#ffffff",
      border: "#b4dfc4",
      input: "#b4dfc4",
      radius: BASE_RADIUS,
    },
  },
  {
    id: "blush",
    label: "Blush",
    swatch: "#e11d63",
    dark: false,
    palette: {
      background: "#fff5f8",
      foreground: "#2d0d1a",
      card: "#ffffff",
      cardForeground: "#2d0d1a",
      primary: "#e11d63",
      primaryForeground: "#ffffff",
      secondary: "#ffdde8",
      secondaryForeground: "#6b1230",
      muted: "#ffdde8",
      mutedForeground: "#a03360",
      accent: "#ffdde8",
      accentForeground: "#2d0d1a",
      destructive: "#dc2626",
      destructiveForeground: "#ffffff",
      border: "#fbbfce",
      input: "#fbbfce",
      radius: BASE_RADIUS,
    },
  },
  {
    id: "sand",
    label: "Sand",
    swatch: "#c2850b",
    dark: false,
    palette: {
      background: "#fdf8f2",
      foreground: "#2c1e10",
      card: "#ffffff",
      cardForeground: "#2c1e10",
      primary: "#c2850b",
      primaryForeground: "#ffffff",
      secondary: "#f5ece0",
      secondaryForeground: "#5a3c18",
      muted: "#f5ece0",
      mutedForeground: "#8a6848",
      accent: "#f5ece0",
      accentForeground: "#2c1e10",
      destructive: "#dc2626",
      destructiveForeground: "#ffffff",
      border: "#e8d5bf",
      input: "#e8d5bf",
      radius: BASE_RADIUS,
    },
  },
];

export const DEFAULT_THEME_ID: ThemeId = "default";

export function getTheme(id: ThemeId): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
