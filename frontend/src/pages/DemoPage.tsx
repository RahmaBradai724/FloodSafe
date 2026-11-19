import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, Rectangle, Tooltip } from "react-leaflet";
import { api, type Route, type RouteResult, type Storm, type ZoneMap } from "../api";
import RainCanvas from "../components/RainCanvas";
import StormCharts from "../components/StormCharts";
import ZoneBanner from "../components/ZoneBanner";
import { LEVEL_SHORT, LEVEL_WEIGHT, km, minutes, rank } from "../levels";
import { BaseTiles, usePalette, ThemeToggle } from "../theme";
import { LangToggle, locale, useLang, useT } from "../i18n";

// The demo trip, picked among 121 tested pairs: with the trigger on, the fastest route crosses 15 high-risk
// segments and the safer one none, for about 20 s more
const TRIP = {
  from: [36.45091, 10.76237] as [number, number],
  to: [36.44871, 10.69209] as [number, number],
  label: "Nabeul est → Nabeul ouest",
};
const DRIVE_MS = 12000;
const SPEEDS = [
  { ms: 1500, label: "Lent" },
  { ms: 800, label: "Normal" },
  { ms: 350, label: "Rapide" },
];

const carIcon = L.divIcon({
  className: "car-icon",
  html: '<svg viewBox="0 0 24 24" width="30" height="30"><circle cx="12" cy="12" r="11" fill="#fff"/><path d="M6 15.5V12l1.6-3.6A2 2 0 0 1 9.4 7h5.2a2 2 0 0 1 1.8 1.4L18 12v3.5a1 1 0 0 1-1 1h-.6a1.6 1.6 0 0 1-3.2 0h-2.4a1.6 1.6 0 0 1-3.2 0H7a1 1 0 0 1-1-1Zm2.2-3.5h7.6l-1.2-2.8a.8.8 0 0 0-.7-.5H10.1a.8.8 0 0 0-.7.5L8.2 12Z" fill="#111111"/></svg>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function tunis(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleString(locale(), { ...opts, timeZone: "Africa/Tunis" });
}
const hourLabel = (iso: string) => tunis(iso, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

interface StoryEvent {
  index: number;
  kind: "info" | "rain" | "alert" | "peak" | "end";
  text: string;
}

function pathLength(coords: [number, number][]) {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    const [a, b] = [coords[i - 1], coords[i]];
    const dy = (b[0] - a[0]) * 111320;
    const dx = (b[1] - a[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180);
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  return cum;
}

function pointAt(coords: [number, number][], cum: number[], f: number): [number, number] {
  const target = f * cum[cum.length - 1];
  let i = cum.findIndex((c) => c >= target);
  if (i <= 0) return coords[0];
  const t = (target - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
  return [coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]), coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1])];
}

export default function DemoPage() {
  const pal = usePalette();
  const t = useT();
  const { lang } = useLang();
  const [storm, setStorm] = useState<Storm | null>(null);
  const [zone, setZone] = useState<ZoneMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(SPEEDS[1].ms);
  const [pausedAtAlert, setPausedAtAlert] = useState(false);
  const [trip, setTrip] = useState<{ result: RouteResult; chosen: Route; at: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [routing, setRouting] = useState(false);
  const alertShown = useRef(false);

  useEffect(() => {
    Promise.all([api.storm(), api.zoneMap("moderate")])
      .then(([s, z]) => {
        setStorm(s);
        setZone(z);
      })
      .catch((e) => setError(e.message));
  }, []);

  const hours = storm?.hours ?? [];
  const hour = hours[index];
  const firstAlert = hours.findIndex((h) => h.trigger);

  // The storm clock: one replayed hour per tick
  useEffect(() => {
    if (!playing || !storm) return;
    const t = window.setInterval(() => {
      setIndex((i) => {
        const next = Math.min(hours.length - 1, i + 1);
        if (next === hours.length - 1) setPlaying(false);
        if (next === firstAlert && !alertShown.current) {
          alertShown.current = true;
          setPlaying(false);
          setPausedAtAlert(true);
        }
        return next;
      });
    }, speed);
    return () => window.clearInterval(t);
  }, [playing, speed, storm, hours.length, firstAlert]);

  // Share the replayed hour with every user app; stop sharing when leaving the page
  useEffect(() => {
    if (!storm) return;
    api.shareDemoHour(index).catch(() => undefined);
    const keepAlive = window.setInterval(() => api.shareDemoHour(index).catch(() => undefined), 60_000);
    return () => window.clearInterval(keepAlive);
  }, [storm, index]);
  useEffect(() => () => void api.shareDemoHour(null).catch(() => undefined), []);

  // The car: drives the chosen route in DRIVE_MS while the storm clock waits
  const chosenCoords = useMemo(() => trip?.chosen.segments.flatMap((s) => s.coords) ?? [], [trip]);
  const cum = useMemo(() => pathLength(chosenCoords), [chosenCoords]);
  useEffect(() => {
    if (!trip) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const f = Math.min(1, (now - start) / DRIVE_MS);
      setProgress(f);
      if (f < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [trip]);

  const exposed = zone?.items ?? [];
  const alertCounts = useMemo(() => {
    const c = { moderate: 0, high: 0, very_high: 0 };
    for (const r of exposed) if (r.exposure !== "low") c[r.exposure] += 1;
    return c;
  }, [exposed]);

  const story = useMemo<StoryEvent[]>(() => {
    if (!storm) return [];
    const ev: StoryEvent[] = [];
    const h = storm.hours;
    ev.push({ index: 0, kind: "info", text: t("Début du rejeu. Pluie prévue sur 24 h : {mm} mm, sous le seuil de {s} mm.", { mm: h[0].rain_24h_mm.toFixed(0), s: storm.threshold_mm }) });
    const rain = h.findIndex((x) => x.zone_mm_h >= 0.5);
    if (rain >= 0) ev.push({ index: rain, kind: "rain", text: t("La pluie commence sur Nabeul.") });
    h.forEach((x, i) => {
      if (i > 0 && x.trigger && !h[i - 1].trigger)
        ev.push({
          index: i,
          kind: "alert",
          text: t("Seuil franchi : {mm} mm en 24 h ({f} tombés + {p} prévus). Alerte zone : {h} tronçons à risque élevé ou très élevé, {m} modéré.", {
            mm: x.rain_24h_mm.toFixed(0),
            f: x.fallen_12h_mm.toFixed(0),
            p: x.forecast_12h_mm.toFixed(0),
            h: alertCounts.high + alertCounts.very_high,
            m: alertCounts.moderate,
          }),
        });
      if (i > 0 && !x.trigger && h[i - 1].trigger) ev.push({ index: i, kind: "end", text: t("Fin de l'alerte : le cumul repasse sous {s} mm.", { s: storm.threshold_mm }) });
    });
    const peak = h.reduce((best, x, i) => (x.zone_mm_h > h[best].zone_mm_h ? i : best), 0);
    const lead = firstAlert >= 0 ? peak - firstAlert : null;
    ev.push({
      index: peak,
      kind: "peak",
      text:
        lead !== null && lead > 0
          ? t("Pic de pluie : {v} mm/h, {lead} h après le déclenchement de l'alerte.", { v: h[peak].zone_mm_h.toFixed(1), lead })
          : t("Pic de pluie : {v} mm/h.", { v: h[peak].zone_mm_h.toFixed(1) }),
    });
    return ev.sort((a, b) => a.index - b.index);
    // the texts change with the language
  }, [storm, alertCounts, firstAlert, lang, t]);

  async function launchTrip() {
    if (!hour) return;
    setPlaying(false);
    setPausedAtAlert(false);
    setRouting(true);
    setError(null);
    try {
      const r = await api.demoRoutes(TRIP.from, TRIP.to, hour.rain_24h_mm, hour.t);
      const chosen = r.routes.find((x) => x.id === r.safer_route_id) ?? r.routes[0];
      setProgress(0);
      setTrip({ result: r, chosen, at: index });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRouting(false);
    }
  }

  function restart() {
    setIndex(0);
    setTrip(null);
    setPlaying(false);
    setPausedAtAlert(false);
    alertShown.current = false;
  }

  if (error && !storm) return <div className="splash error">{error}</div>;
  if (!storm || !hour) return <div className="splash">{t("Chargement de l'orage…")}</div>;

  const z = zone?.zone;
  const triggerOn = hour.trigger;
  const fastest = trip?.result.routes[0];
  const car = trip && chosenCoords.length > 1 ? pointAt(chosenCoords, cum, progress) : null;
  const drivingDone = trip !== null && progress >= 1;
  const zoneRoads = exposed
    .filter((r) => (triggerOn ? rank(r.exposure) >= 1 : rank(r.exposure) >= 2))
    .sort((a, b) => rank(a.exposure) - rank(b.exposure));

  return (
    <div className="app demo">
      <header className="topbar">
        <div className="brand small">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M12 2.5c3.6 4.6 6.5 8.3 6.5 11.6A6.5 6.5 0 0 1 5.5 14.1C5.5 10.8 8.4 7.1 12 2.5Z" fill="currentColor" />
            </svg>
          </span>
          <div>
            <strong>{t("Rejeu d'un orage réel")}</strong>
            <small>{t(storm.event.label)}</small>
          </div>
        </div>
        <nav className="topnav">
          <LangToggle />
          <ThemeToggle />
          <Link to="/admin">{t("Admin")}</Link>
          <Link to="/">{t("Carte")}</Link>
        </nav>
      </header>

      <div className="layout">
        <div className="map-wrap">
          <MapContainer
            bounds={
              z
                ? [
                    [z.south, z.west],
                    [z.north, z.east],
                  ]
                : [
                    [36.41, 10.67],
                    [36.5, 10.79],
                  ]
            }
            boundsOptions={window.innerWidth >= 900 ? { paddingTopLeft: [400, 90] } : { paddingTopLeft: [10, 90], paddingBottomRight: [10, Math.round(window.innerHeight * 0.42)] }}
            className="map"
            zoomControl={false}
            preferCanvas
          >
            <BaseTiles />
            {z && (
              <Rectangle
                bounds={[
                  [z.south, z.west],
                  [z.north, z.east],
                ]}
                pathOptions={{ color: pal.ink, weight: 1.5, dashArray: "6 6", fill: false }}
              />
            )}
            {zoneRoads.map((r) => (
              <Polyline
                key={r.segment_id}
                positions={r.coords}
                pathOptions={
                  triggerOn
                    ? { color: pal.level[r.exposure], weight: LEVEL_WEIGHT[r.exposure] - 2, opacity: trip ? 0.45 : 0.9 }
                    : { color: pal.exposed, weight: 3, dashArray: "4 6", opacity: trip ? 0.35 : 0.75 }
                }
              />
            ))}
            {trip &&
              trip.result.routes
                .filter((r) => r.id !== trip.chosen.id)
                .map((r) => (
                  <Polyline key={r.id} positions={r.segments.flatMap((s) => s.coords)} pathOptions={{ color: pal.idle, weight: 5, opacity: 0.7, dashArray: "2 8" }}>
                    <Tooltip sticky>
                      {t("{kind} : {n} tronçons à risque élevé", { kind: t(r.kind === "fastest" ? "Le plus rapide" : "Autre itinéraire"), n: r.alert.count })}
                    </Tooltip>
                  </Polyline>
                ))}
            {trip && (
              <>
                <Polyline positions={chosenCoords} pathOptions={{ color: pal.casing, weight: 11, opacity: 1 }} />
                {trip.chosen.segments.map((s) => (
                  <Polyline key={s.segment_id} positions={s.coords} pathOptions={{ color: s.level === "low" ? pal.ink : pal.level[s.level], weight: 7 }}>
                    <Tooltip sticky>
                      {s.name ?? t("Route sans nom")} · {t(LEVEL_SHORT[s.level])}
                    </Tooltip>
                  </Polyline>
                ))}
              </>
            )}
            <CircleMarker center={TRIP.from} radius={8} pathOptions={{ color: pal.casing, weight: 3, fillColor: pal.safe, fillOpacity: 1 }}>
              <Tooltip>{t("Départ")}</Tooltip>
            </CircleMarker>
            <CircleMarker center={TRIP.to} radius={8} pathOptions={{ color: pal.casing, weight: 3, fillColor: pal.ink, fillOpacity: 1 }}>
              <Tooltip>{t("Arrivée")}</Tooltip>
            </CircleMarker>
            {car && <Marker position={car} icon={carIcon} />}
          </MapContainer>
          <RainCanvas mmPerHour={trip ? 0 : hour.zone_mm_h} />

          <div className="clockbar">
            <div className="clock">
              <strong>{tunis(hour.t, { weekday: "long", day: "numeric", month: "long" })}</strong>
              <span className="clock-time">{tunis(hour.t, { hour: "2-digit", minute: "2-digit" })}</span>
              <small>{t("{v} mm/h en ce moment", { v: hour.zone_mm_h.toFixed(1) })}</small>
            </div>
            <div className="clock-controls">
              <button className="btn primary" onClick={() => (setTrip(null), setPausedAtAlert(false), setPlaying(!playing))} disabled={index === hours.length - 1 && !playing}>
                {playing ? t("Pause") : index === 0 ? t("Lancer l'orage") : t("Reprendre")}
              </button>
              <button className="btn ghost" onClick={restart}>
                {t("Recommencer")}
              </button>
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label={t("Vitesse")}>
                {SPEEDS.map((s) => (
                  <option key={s.ms} value={s.ms}>
                    {t(s.label)}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="range"
              min={0}
              max={hours.length - 1}
              value={index}
              onChange={(e) => (setIndex(Number(e.target.value)), setTrip(null))}
              aria-label={t("Heure du rejeu")}
            />
          </div>
        </div>

        <aside className={`panel ${window.innerWidth >= 900 ? "open" : ""}`}>
          <ZoneBanner
            trigger={{ threshold_mm: storm.threshold_mm, window: "", validation: "provisional", status: triggerOn ? "on" : "off", max_rain_24h_mm: hour.rain_24h_mm }}
            weather={{ mode: "replay", simulated: true, available: true, last_error: null }}
          />
          <p className="split">
            <span>
              {t("Tombés (12 h)")} <strong>{hour.fallen_12h_mm.toFixed(0)} mm</strong>
            </span>
            <span>
              {t("Prévus (12 h)")} <strong>{hour.forecast_12h_mm.toFixed(0)} mm</strong>
            </span>
          </p>

          {pausedAtAlert && (
            <div className="callout">
              <strong>{t("Le seuil vient d'être franchi.")}</strong>
              <span>{t("Les routes que le modèle classe comme les plus exposées passent en alerte. Lancez un trajet pour voir l'itinéraire proposé.")}</span>
            </div>
          )}

          <section className="card">
            <h2>{t("Un conducteur part maintenant")}</h2>
            <p className="muted">{t(TRIP.label)}</p>
            <button className="btn primary wide" onClick={launchTrip} disabled={routing}>
              {routing ? t("Calcul…") : t("Lancer le trajet à {t}", { t: tunis(hour.t, { hour: "2-digit", minute: "2-digit" }) })}
            </button>
            {trip && fastest && (
              <div className="trip">
                {trip.result.trigger?.status === "on" ? (
                  trip.chosen.id !== fastest.id ? (
                    <p>
                      <strong>{t("Alerte active : itinéraire plus sûr.")}</strong>{" "}
                      {t("Le plus rapide passe par {n} tronçons à risque élevé ({d}) ; le trajet proposé en a {m}, pour {extra} de plus.", {
                        n: fastest.alert.count,
                        d: km(fastest.alert.exposure_m),
                        m: trip.chosen.alert.count,
                        extra: minutes(Math.max(0, trip.chosen.duration_s - fastest.duration_s)),
                      })}
                    </p>
                  ) : (
                    <p>
                      <strong>{t("Alerte active.")}</strong>{" "}
                      {t("Aucun itinéraire plus sûr : {n} tronçons à risque élevé sur le trajet. Reportez le départ si possible.", { n: fastest.alert.count })}
                    </p>
                  )
                ) : (
                  <p>
                    <strong>{t("Pas d'alerte :")}</strong>{" "}
                    {t("itinéraire le plus rapide, {t}. Les routes exposées restent en tirets, sans alerte.", { t: minutes(fastest.duration_s) })}
                  </p>
                )}
                <small className="muted">{drivingDone ? t("Arrivé.") : t("En route… {p} %", { p: Math.round(progress * 100) })}</small>
              </div>
            )}
            {error && <p className="error">{error}</p>}
          </section>

          <section className="card">
            <StormCharts storm={storm} index={index} onSeek={(i) => (setIndex(i), setTrip(null))} />
          </section>

          <section className="card">
            <h2>{t("Ce qui se passe")}</h2>
            <ol className="feed">
              {story
                .filter((e) => e.index <= index)
                .reverse()
                .map((e) => (
                  <li key={`${e.index}${e.kind}`} className={`ev-${e.kind}`}>
                    <time>{hourLabel(hours[e.index].t)}</time>
                    <span>{e.text}</span>
                  </li>
                ))}
            </ol>
          </section>

          <p className="disclaimer">
            {t(storm.event.note)} {t("Le seuil de 44 mm est provisoire. Rejeu à but de démonstration.")}
          </p>
        </aside>
      </div>
    </div>
  );
}
