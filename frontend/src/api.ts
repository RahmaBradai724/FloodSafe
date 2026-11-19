// Client for the FloodSafe API (backend/app/main_v2.py). In development Vite proxies /api to port 8000.

import { tr } from "./i18n";

const BASE = import.meta.env.VITE_API_URL ?? "/api";
const TOKEN_KEY = "floodsafe.token";
const USER_KEY = "floodsafe.user";

export type Level = "low" | "moderate" | "high" | "very_high";

export interface User {
  id: number;
  email: string;
  role: "user" | "admin";
}

export interface Trigger {
  threshold_mm: number;
  window: string;
  validation: string;
  status: "on" | "off" | "unknown";
  max_rain_24h_mm: number | null;
}

export interface WeatherStatus {
  mode: string;
  simulated: boolean;
  available: boolean;
  last_error: string | null;
  source?: string;
  retrieved_at?: string;
  age_minutes?: number;
  simulated_outage?: boolean;
  attribution?: string | null;
}

export interface Explanation {
  code: string;
  text: string;
  params: Record<string, unknown>;
}

export interface RouteSegment {
  segment_id: number;
  score: number;
  level: Level;
  confidence: number;
  confidence_label: "low" | "medium" | "high";
  susceptibility: number;
  mode: string;
  eta: string;
  name: string | null;
  road_type: string | null;
  crossing: string | null;
  coords: [number, number][];
  explanations: Explanation[];
}

export interface Route {
  id: string;
  kind: "fastest" | "alternative" | "safer";
  duration_s: number;
  distance_m: number;
  via: string[];
  max_level: Level;
  min_confidence: number;
  confidence_label: string;
  alert: { count: number; exposure_m: number; segment_ids: number[]; first_eta: string | null };
  extra_duration_s?: number;
  extra_distance_m?: number;
  segments: RouteSegment[];
}

export interface RouteResult {
  routes: Route[];
  safer_route_id: string | null;
  fallback: { code: string; text: string } | null;
  trigger: Trigger | null;
  weather: WeatherStatus;
  disclaimer: string;
  compute_ms: number;
}

export interface ZoneRoad {
  segment_id: number;
  name: string | null;
  exposure: Level;
  level: Level;
  coords: [number, number][];
}

export interface ZoneMap {
  trigger: Trigger;
  zone: { south: number; west: number; north: number; east: number };
  items: ZoneRoad[];
  weather: WeatherStatus;
}

export interface Meta {
  area: { name: string; bbox: [number, number, number, number]; centre: [number, number] };
  weather_modes: string[];
  scenarios: Record<string, string>;
  attributions: string[];
  disclaimer: string;
}

export interface GeocodeItem {
  name: string;
  address: string;
  lat: number;
  lon: number;
}

export interface FeedbackItem {
  id: number;
  segment_id: number | null;
  kind: "flooded" | "not_flooded" | "drain_blocked";
  comment: string | null;
  lat: number;
  lon: number;
  created_at: string | null;
}

export interface TerrainTest {
  name: string;
  roc_auc?: number;
  baseline_roc_auc?: number;
  baseline?: string;
  recall_high?: number;
  precision_high?: number;
  status: string;
}

export interface Metrics {
  model: {
    name: string;
    zone_segments: number;
    level_counts: Partial<Record<Level, number>>;
    trigger_threshold_mm: number | null;
    trigger_status: string | null;
    validation: Record<string, unknown>;
    limits: string[];
    live_accuracy: string;
  };
  live: {
    trigger: Trigger | null;
    monitor_last_checked: string | null;
    weather: WeatherStatus | null;
    routes_served_since_start: number;
    users: number;
    devices_for_alerts: number;
  };
  terrain_validation: { tests: TerrainTest[]; limits: string[]; budget_high: string; source: string } | null;
  alerts: { started_at: string; max_rain_24h_mm: number; threshold_mm: number; devices_notified: number }[];
}

export interface StormHour {
  t: string;
  rain_24h_mm: number;
  fallen_12h_mm: number;
  forecast_12h_mm: number;
  trigger: boolean;
  zone_mm_h: number;
  cells_mm_h: Record<string, number>;
}

export interface Storm {
  event: { id: string; label: string; note: string };
  threshold_mm: number;
  zone_cells: string[];
  cells: { id: string; lat: number; lon: number }[];
  hours: StormHour[];
}

export type DemoState =
  | { active: false }
  | { active: true; index: number; hour: StormHour; event: { id: string; label: string }; threshold_mm: number };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function storeSession(token: string | null, user: User | null): void {
  try {
    if (token && user) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  } catch {
    // private mode: the session lasts as long as the page
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  const token = getToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, tr("Serveur injoignable. Vérifiez la connexion."));
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      // keep the status text
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export const api = {
  meta: () => request<Meta>("/meta"),
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  me: () => request<User>("/auth/me"),
  zoneMap: (minExposure: "moderate" | "high" | "very_high" = "moderate") =>
    request<ZoneMap>(`/zone/map?min_exposure=${minExposure}`),
  routes: (origin: [number, number], destination: [number, number], alertLevel: Level = "high") =>
    request<RouteResult>("/routes", {
      method: "POST",
      body: JSON.stringify({
        origin: { lat: origin[0], lon: origin[1] },
        destination: { lat: destination[0], lon: destination[1] },
        alert_level: alertLevel,
      }),
    }),
  segment: (id: number) => request<RouteSegment & { trigger: Trigger | null }>(`/segments/${id}`),
  geocode: (q: string) => request<{ items: GeocodeItem[] }>(`/geocode?q=${encodeURIComponent(q)}`),
  feedback: (kind: FeedbackItem["kind"], lat: number, lon: number, segmentId: number | null, comment?: string) =>
    request<{ id: number }>("/feedback", {
      method: "POST",
      body: JSON.stringify({ kind, lat, lon, segment_id: segmentId, comment: comment || null }),
    }),
  recentFeedback: () => request<{ hours: number; count: number }>("/feedback/recent"),
  storm: () => request<Storm>("/demo/storm"),
  demoState: () => request<DemoState>("/demo/state"),
  shareDemoHour: (index: number | null) => request<DemoState>("/demo/state", { method: "POST", body: JSON.stringify({ index }) }),
  demoRoutes: (origin: [number, number], destination: [number, number], rain24h: number, at: string) =>
    request<RouteResult>("/demo/routes", {
      method: "POST",
      body: JSON.stringify({
        origin: { lat: origin[0], lon: origin[1] },
        destination: { lat: destination[0], lon: destination[1] },
        rain_24h_mm: rain24h,
        at,
      }),
    }),
  metrics: () => request<Metrics>("/admin/metrics"),
  adminFeedback: () => request<{ items: FeedbackItem[] }>("/admin/feedback"),
  setWeatherMode: (mode: string) =>
    request<WeatherStatus>("/admin/weather-mode", { method: "POST", body: JSON.stringify({ mode }) }),
};
