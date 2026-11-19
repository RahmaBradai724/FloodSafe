import type { Level } from "./api";
import { locale, tr } from "./i18n";

// Alert levels (validated with the dataviz palette checker, light surface). Moderate yellow has low
// contrast on white, so a level is never shown by colour alone: its name is always written next to it.
export const LEVELS: Level[] = ["low", "moderate", "high", "very_high"];

export const LEVEL_COLOR: Record<Level, string> = {
  low: "#64748b",
  moderate: "#d9a400",
  high: "#ea580c",
  very_high: "#9f1239",
};

export const LEVEL_LABEL: Record<Level, string> = {
  low: "Risque faible",
  moderate: "Risque modéré",
  high: "Risque élevé",
  very_high: "Risque très élevé",
};

export const LEVEL_SHORT: Record<Level, string> = {
  low: "Faible",
  moderate: "Modéré",
  high: "Élevé",
  very_high: "Très élevé",
};

export const LEVEL_WEIGHT: Record<Level, number> = { low: 4, moderate: 5, high: 7, very_high: 8 };

// A road exposed in heavy rain while the zone trigger is off: never drawn as an alert.
export const EXPOSED_COLOR = "#4f46e5";
export const EXPOSED_LABEL = "Route exposée en cas de forte pluie";

export function rank(level: Level): number {
  return LEVELS.indexOf(level);
}

export function exposureOf(susceptibility: number): Level {
  return LEVELS[Math.max(0, Math.min(3, Math.round(susceptibility * 3)))];
}

// main_factors come from the model in English (flood_risk.features.FACTOR_GROUPS)
const FACTOR_FR: Record<string, string> = {
  "depression / low point": "point bas, cuvette",
  "wadi proximity": "proche d'un oued",
  underpass: "passage inférieur",
  "impervious surface": "zone très bâtie",
  "drainage vulnerability": "drainage fragile",
  "past floods": "inondations passées",
};

export function factorsFr(text: string): string[] {
  const m = text.match(/Main factors: (.*)$/);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((f) => f.trim().replace(/\s*\(\+\d+\)$/, ""))
    .filter((f) => f && f !== "none dominant")
    .map((f) => tr(FACTOR_FR[f] ?? f));
}

export function minutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

export function km(metres: number): string {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`;
}

export function clock(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  // SQLite returns UTC times without an offset
  const utc = /[zZ]$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  return new Date(utc).toLocaleString(locale(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}
