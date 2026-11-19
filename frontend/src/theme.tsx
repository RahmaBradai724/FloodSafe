import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { TileLayer } from "react-leaflet";
import type { Level } from "./api";
import { useT } from "./i18n";

/** Style D « Minimal »: black and white, only the risks and the route carry colour. */
export type ThemePref = "auto" | "light" | "dark";
type Resolved = "light" | "dark";

export interface Palette {
  level: Record<Level, string>;
  exposed: string;
  /** the trip line where the risk is low, the destination pin, the zone outline */
  ink: string;
  /** the halo drawn under a route so it stands out from the map */
  casing: string;
  /** a route that is not selected */
  idle: string;
  safe: string;
}

// Light: the levels validated earlier on a white surface. Dark: lighter steps of the same hues,
// so they stay readable on the dark basemap (as in the approved mock-up).
const PALETTES: Record<Resolved, Palette> = {
  light: {
    level: { low: "#64748b", moderate: "#d9a400", high: "#ea580c", very_high: "#9f1239" },
    exposed: "#4f46e5",
    ink: "#111111",
    casing: "#ffffff",
    idle: "#64748b",
    safe: "#16a34a",
  },
  dark: {
    level: { low: "#94a3b8", moderate: "#facc15", high: "#fb923c", very_high: "#fb4868" },
    exposed: "#a5b4fc",
    ink: "#f5f5f2",
    casing: "#0e0e10",
    idle: "#8a8a93",
    safe: "#22c55e",
  },
};

// Standard OpenStreetMap tiles (no API key), turned grey by day and inverted grey by night in CSS
// (.tiles-light / .tiles-dark), so only the risks and the route carry colour.
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

interface ThemeValue {
  pref: ThemePref;
  resolved: Resolved;
  palette: Palette;
  cycle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);
const KEY = "floodsafe.theme";

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPref] = useState<ThemePref>(readPref);
  const [systemDark, setSystemDark] = useState(() => media().matches);

  useEffect(() => {
    const m = media();
    const on = () => setSystemDark(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  const resolved: Resolved = pref === "auto" ? (systemDark ? "dark" : "light") : pref;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#0b0b0c" : "#fafaf8");
  }, [resolved]);

  const value = useMemo<ThemeValue>(
    () => ({
      pref,
      resolved,
      palette: PALETTES[resolved],
      cycle: () =>
        setPref((p) => {
          const next: ThemePref = p === "auto" ? "light" : p === "light" ? "dark" : "auto";
          try {
            localStorage.setItem(KEY, next);
          } catch {
            /* private window: the choice simply isn't remembered */
          }
          return next;
        }),
    }),
    [pref, resolved],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error("useTheme outside ThemeProvider");
  return v;
}

export const usePalette = () => useTheme().palette;

/** Basemap matching the theme: grey OpenStreetMap by day, inverted grey by night. */
export function BaseTiles() {
  const { resolved } = useTheme();
  return <TileLayer key={resolved} attribution={ATTRIBUTION} url={TILE_URL} className={`tiles-${resolved}`} />;
}

const LABEL: Record<ThemePref, string> = { auto: "Thème : automatique", light: "Thème : clair", dark: "Thème : sombre" };

/** Cycles auto → clair → sombre. */
export function ThemeToggle() {
  const { pref, resolved, cycle } = useTheme();
  const t = useT();
  return (
    <button className="iconbtn theme-toggle" onClick={cycle} title={t(LABEL[pref])} aria-label={t(LABEL[pref])}>
      {pref === "auto" ? (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <path d="M12 3a9 9 0 1 0 0 18V3Z" fill="currentColor" />
          <circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      ) : resolved === "dark" ? (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="currentColor" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <circle cx="12" cy="12" r="4.5" fill="currentColor" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
