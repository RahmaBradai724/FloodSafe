import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CircleMarker, MapContainer, Polyline, Rectangle, Tooltip, useMap } from "react-leaflet";
import { api, type DemoState, type FeedbackItem, type Level, type Meta, type Metrics, type Storm, type ZoneMap } from "../api";
import { weatherLabel } from "../components/ZoneBanner";
import StormCharts from "../components/StormCharts";
import Icon, { type IconName } from "../components/Icons";
import { LEVELS, LEVEL_SHORT, dateTime, rank } from "../levels";
import { BaseTiles, usePalette, useTheme } from "../theme";
import { useSession } from "../session";
import { LANG_NAME, locale, useLang, useT } from "../i18n";

const REFRESH_MS = 60 * 1000;
const DEMO_POLL_MS = 3000;
const MODE_FR: Record<string, string> = {
  live: "Réel",
  "scenario:storm": "Orage simulé",
  "scenario:showers": "Averses simulées",
  "scenario:dry": "Temps sec",
  outage: "Panne de données",
};
// the three sources shown in the header, as in the mock-up; the others stay under « Source de pluie »
const HEADER_MODES = ["live", "scenario:storm", "scenario:dry"];
const FEEDBACK_FR: Record<FeedbackItem["kind"], string> = {
  flooded: "Route inondée",
  not_flooded: "Pas d'eau",
  drain_blocked: "Avaloir bouché",
};
const THEME_FR = { auto: "Automatique", light: "Clair", dark: "Sombre" } as const;

type Tab = "overview" | "map" | "alerts" | "reports" | "model";
const NAV: { id: Tab; label: string; icon: IconName }[] = [
  { id: "overview", label: "Vue d'ensemble", icon: "grid" },
  { id: "map", label: "Carte de la zone", icon: "map" },
  { id: "alerts", label: "Alertes", icon: "bell" },
  { id: "reports", label: "Signalements", icon: "flag" },
  { id: "model", label: "Modèle", icon: "chart" },
];

function pct(x: number | undefined) {
  return x === undefined ? "–" : `${Math.round(x * 100)} %`;
}

// trigger.json gives counts with English notes, e.g. "25/28 (missed: ...)": keep the count
function head(x: unknown): string {
  return x === undefined || x === null ? "–" : String(x).split(" (")[0].replace(/\.(\d)/g, ",$1");
}

const tunisTime = (iso: string) => new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Tunis" });
const utc = (iso: string | null) => (iso && !/[zZ]$|[+-]\d\d:?\d\d$/.test(iso) ? `${iso}Z` : iso ?? "");

/** Leaflet measures its box once: re-measure when the panel is resized, so the map fills it. */
function FillPanel() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

export default function AdminPage() {
  const pal = usePalette();
  const { pref, cycle } = useTheme();
  const { user, logout } = useSession();
  const t = useT();
  const { lang, toggle: toggleLang } = useLang();
  const [tab, setTab] = useState<Tab>("overview");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [zone, setZone] = useState<ZoneMap | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [storm, setStorm] = useState<Storm | null>(null);
  const [demo, setDemo] = useState<DemoState>({ active: false });
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(() => {
    Promise.all([api.metrics(), api.adminFeedback(), api.zoneMap("moderate")])
      .then(([m, f, z]) => {
        setMetrics(m);
        setFeedback(f.items);
        setZone(z);
        setError(null);
      })
      .catch((e) => setError(e.message));
    setNow(new Date());
  }, []);

  useEffect(() => {
    load();
    api.meta().then(setMeta).catch(() => undefined);
    api.storm().then(setStorm).catch(() => undefined);
    const t = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [load]);

  // follow the shared storm replay (demo page), as the user app does
  useEffect(() => {
    let last: string | null = null;
    const poll = () =>
      api
        .demoState()
        .then((d) => {
          setDemo(d);
          const key = d.active ? `${d.index}` : "off";
          if (last !== null && key !== last) load();
          last = key;
        })
        .catch(() => undefined);
    poll();
    const t = window.setInterval(poll, DEMO_POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  async function switchMode(mode: string) {
    setSwitching(mode);
    try {
      await api.setWeatherMode(mode);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSwitching(null);
    }
  }

  const live = metrics?.live;
  const trigger = demo.active
    ? { threshold_mm: demo.threshold_mm, status: demo.hour.trigger ? "on" : "off", max_rain_24h_mm: demo.hour.rain_24h_mm }
    : live?.trigger ?? null;
  const triggerOn = trigger?.status === "on";
  const mm = trigger?.max_rain_24h_mm ?? 0;
  const threshold = trigger?.threshold_mm ?? 44;
  const counts = metrics?.model.level_counts ?? {};
  const total = LEVELS.reduce((a, l) => a + (counts[l] ?? 0), 0);
  const maxCount = Math.max(1, ...LEVELS.map((l) => counts[l] ?? 0));
  const modes = (meta?.weather_modes ?? Object.keys(MODE_FR)).filter((m) => !m.startsWith("replay:"));
  const trig = metrics?.model.validation as Record<string, unknown> | undefined;
  const tnGauges = (trig?.tunisian_gauges_exploratory ?? {}) as Record<string, string>;
  const z = zone?.zone;
  const alertRoads = (zone?.items ?? []).filter((r) => (zone?.trigger.status === "on" ? rank(r.level) >= 2 : false)).length;

  // event log: the replay's trigger, past alerts and the latest reports
  const replayEvents: { t: string; text: string }[] = [];
  const events: { t: string; text: string }[] = [];
  if (demo.active && storm) {
    const first = storm.hours.findIndex((h) => h.trigger);
    if (first >= 0 && demo.index >= first)
      replayEvents.push({ t: storm.hours[first].t, text: t("Rejeu · seuil franchi : {n} tronçons passent en alerte élevée", { n: alertRoads }) });
  }
  (metrics?.alerts ?? []).forEach((a) => events.push({ t: utc(a.started_at), text: t("Seuil franchi : {mm} mm en 24 h (seuil {s} mm)", { mm: a.max_rain_24h_mm.toFixed(0), s: a.threshold_mm }) }));
  feedback.forEach((f) => events.push({ t: utc(f.created_at), text: t("Signalement « {kind} »", { kind: t(FEEDBACK_FR[f.kind]).toLowerCase() }) + (f.segment_id ? t(", tronçon {id}", { id: f.segment_id }) : "") }));
  events.sort((a, b) => (a.t < b.t ? 1 : -1));
  const log = [...replayEvents, ...events];

  const zoneMap = (big: boolean) => (
    <MapContainer
      bounds={z ? [[z.south, z.west], [z.north, z.east]] : [[36.41, 10.67], [36.5, 10.79]]}
      preferCanvas
      zoomControl={big}
      className="map"
    >
      <BaseTiles />
      <FillPanel />
      {z && <Rectangle bounds={[[z.south, z.west], [z.north, z.east]]} pathOptions={{ color: pal.ink, weight: 1.5, dashArray: "6 6", fill: false }} />}
      {(zone?.items ?? [])
        .filter((r) => (zone?.trigger.status === "on" ? rank(r.level) >= 1 : rank(r.exposure) >= 1))
        .sort((a, b) => rank(a.level) - rank(b.level))
        .map((r) => {
          const on = zone?.trigger.status === "on";
          const lvl: Level = on ? r.level : r.exposure;
          return (
            <Polyline key={r.segment_id} positions={r.coords} pathOptions={{ color: pal.level[lvl], weight: 2 + rank(lvl), opacity: 0.9 }}>
              <Tooltip sticky>
                {r.name ?? t("Route sans nom")} · {t(on ? "alerte {level}" : "exposition {level}", { level: t(LEVEL_SHORT[lvl]).toLowerCase() })}
              </Tooltip>
            </Polyline>
          );
        })}
      {feedback.map((f) => (
        <CircleMarker
          key={f.id}
          center={[f.lat, f.lon]}
          radius={7}
          pathOptions={{ color: pal.casing, weight: 2, fillColor: f.kind === "flooded" ? pal.level.very_high : f.kind === "not_flooded" ? pal.safe : pal.exposed, fillOpacity: 1 }}
        >
          <Tooltip>
            {t(FEEDBACK_FR[f.kind])} · {dateTime(f.created_at)}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );

  const alertKpi = (
    <div className={`a-kpi a-kpi-alert ${triggerOn ? "on" : ""}`}>
      <small className="a-kpi-state">
        ● {trigger?.status === "unknown" || !trigger ? t("Alerte pluie non disponible") : triggerOn ? t("Alerte pluie active") : t("Pas d'alerte pluie")}
      </small>
      <strong>
        {mm.toFixed(0)} mm <span>{t("/ {s} mm en 24 h", { s: threshold })}</span>
      </strong>
      <div className="m-gauge">
        <b style={{ width: `${Math.min(100, (mm / (threshold * 1.5)) * 100)}%` }} />
        <i />
      </div>
      <small className="muted">{demo.active ? t("Rejeu de l'orage du 19 janv. 2026") : weatherLabel(live?.weather)}</small>
    </div>
  );

  return (
    <div className="a-desk">
      <aside className="a-side">
        <div className="a-logo">
          <i>
            <Icon name="drop" size={16} />
          </i>
          FloodSafe
        </div>
        <nav className="a-nav">
          {NAV.map((n) => (
            <button key={n.id} className={tab === n.id ? "on" : ""} onClick={() => setTab(n.id)} aria-current={tab === n.id ? "page" : undefined}>
              <Icon name={n.icon} size={17} />
              {t(n.label)}
            </button>
          ))}
          <Link to="/demo">
            <Icon name="play" size={17} />
            {t("Démo orage")}
          </Link>
        </nav>
        <div className="a-side-foot">
          <Link to="/">
            <Icon name="route" size={16} />
            {t("Application usager")}
          </Link>
          <button onClick={cycle}>
            <Icon name="layers" size={16} />
            {t("Thème")} : {t(THEME_FR[pref]).toLowerCase()}
          </button>
          <button onClick={toggleLang}>
            <Icon name="flag" size={16} />
            {t("Langue")} : {LANG_NAME[lang]}
          </button>
          <button onClick={logout}>
            <Icon name="back" size={16} />
            {t("Déconnexion")}
          </button>
          <small className="muted">{user?.email}</small>
        </div>
      </aside>

      <main className="a-main">
        <div className="a-topline">
          <div>
            <div className="muted a-date">
              {now.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Tunis" })} ·{" "}
              {now.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Tunis" })}
            </div>
            <h1>{t(NAV.find((n) => n.id === tab)?.label ?? "")} · Nabeul</h1>
          </div>
          <div className="m-chips a-modes">
            {HEADER_MODES.map((m) => (
              <button key={m} className={`m-chip ${live?.weather?.mode === m ? "on" : ""}`} disabled={switching !== null} onClick={() => switchMode(m)}>
                {switching === m ? "…" : t(MODE_FR[m])}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="error">{error}</p>}

        {tab === "overview" && (
          <>
            <section className="a-kpis">
              {alertKpi}
              <Kpi label={t("Utilisateurs")} value={live?.users} />
              <Kpi label={t("Itinéraires calculés")} value={live?.routes_served_since_start} note={t("depuis le démarrage du serveur")} />
              <Kpi label={t("Signalements")} value={feedback.length} note={t("dont {n} « inondée »", { n: feedback.filter((f) => f.kind === "flooded").length })} />
            </section>
            <section className="a-grid">
              <div className="a-panel">
                <h3>{demo.active ? t("Orage en cours · rejeu") : t("Orage de référence · 19 et 20 janv. 2026")}</h3>
                {storm ? (
                  <StormCharts storm={storm} index={demo.active ? demo.index : storm.hours.length - 1} interactive={false} />
                ) : (
                  <p className="muted">{t("Chargement de l'orage…")}</p>
                )}
                <table className="a-table">
                  <thead>
                    <tr>
                      <th>{t("Heure")}</th>
                      <th>{t("Événement")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.slice(0, 4).map((e, i) => (
                      <tr key={i}>
                        <td>{tunisTime(e.t)}</td>
                        <td>{e.text}</td>
                      </tr>
                    ))}
                    {log.length === 0 && (
                      <tr>
                        <td>–</td>
                        <td className="muted">{t("Aucun événement pour l'instant.")}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="a-panel a-mappanel">
                {zoneMap(false)}
                <span className="a-mapbadge">{zone?.trigger.status === "on" ? t("Routes en alerte · signalements") : t("Routes exposées · signalements")}</span>
              </div>
            </section>
          </>
        )}

        {tab === "map" && (
          <section className="a-panel a-mappanel a-bigmap">
            {zoneMap(true)}
            <div className="a-legend">
              {LEVELS.slice(1).map((l) => (
                <span key={l}>
                  <i style={{ background: pal.level[l] }} />
                  {t(zone?.trigger.status === "on" ? "Alerte {level}" : "Exposition {level}", { level: t(LEVEL_SHORT[l]).toLowerCase() })}
                </span>
              ))}
              <span>
                <i className="dot" style={{ background: pal.level.very_high }} /> {t("Inondée")}
              </span>
              <span>
                <i className="dot" style={{ background: pal.safe }} /> {t("Pas d'eau")}
              </span>
              <span>
                <i className="dot" style={{ background: pal.exposed }} /> {t("Avaloir bouché")}
              </span>
            </div>
          </section>
        )}

        {tab === "alerts" && (
          <section className="a-grid">
            <div className="a-panel">
              <h3>{t("Source de pluie")}</h3>
              <p className="muted">
                {t("Actuelle :")} <strong>{t(MODE_FR[live?.weather?.mode ?? ""] ?? live?.weather?.mode ?? "–")}</strong> · {weatherLabel(live?.weather)}
                {live?.weather?.last_error && <span className="error"> · {live.weather.last_error}</span>}
              </p>
              <div className="m-chips">
                {modes.map((m) => (
                  <button key={m} className={`m-chip ${live?.weather?.mode === m ? "on" : ""}`} disabled={switching !== null} onClick={() => switchMode(m)}>
                    {switching === m ? "…" : t(MODE_FR[m] ?? m)}
                  </button>
                ))}
              </div>
              <p className="muted m-small">
                {t("Les scénarios servent aux démonstrations : ils sont signalés comme simulés dans l'application. Revenez sur « Réel » après.")}
              </p>
              <p className="muted m-small">{t("Dernière vérification de l'alerte : {t}", { t: dateTime(live?.monitor_last_checked) })}</p>
            </div>
            <div className="a-panel">
              <h3>{t("Historique des alertes")}</h3>
              {metrics?.alerts.length ? (
                <table className="a-table">
                  <thead>
                    <tr>
                      <th>{t("Début")}</th>
                      <th className="num">{t("Pluie 24 h (mm)")}</th>
                      <th className="num">{t("Seuil (mm)")}</th>
                      <th className="num">{t("Notifiés")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.alerts.map((a) => (
                      <tr key={a.started_at}>
                        <td>{dateTime(a.started_at)}</td>
                        <td className="num">{a.max_rain_24h_mm.toFixed(1)}</td>
                        <td className="num">{a.threshold_mm}</td>
                        <td className="num">{a.devices_notified}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">{t("Aucune alerte depuis la mise en service.")}</p>
              )}
            </div>
          </section>
        )}

        {tab === "reports" && (
          <section className="a-panel">
            <h3>{t("Signalements des usagers")}</h3>
            {feedback.length ? (
              <table className="a-table">
                <thead>
                  <tr>
                    <th>{t("Date")}</th>
                    <th>{t("Type")}</th>
                    <th>{t("Tronçon")}</th>
                    <th>{t("Commentaire")}</th>
                  </tr>
                </thead>
                <tbody>
                  {feedback.slice(0, 100).map((f) => (
                    <tr key={f.id}>
                      <td>{dateTime(f.created_at)}</td>
                      <td>{t(FEEDBACK_FR[f.kind])}</td>
                      <td>{f.segment_id ?? "–"}</td>
                      <td>{f.comment ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">{t("Aucun signalement pour l'instant.")}</p>
            )}
          </section>
        )}

        {tab === "model" && (
          <>
            <section className="a-grid">
              <div className="a-panel">
                <h3>{t("Exposition des routes de la zone")}</h3>
                <p className="muted m-small">
                  {t("Classement du modèle terrain, quel que soit le temps : {n} tronçons. Budgets : 10 % modéré ou plus, 2 % élevé ou plus, 0,5 % très élevé.", {
                    n: total.toLocaleString(locale()),
                  })}
                </p>
                <div className="bars" role="table" aria-label={t("Tronçons par niveau d'exposition")}>
                  {LEVELS.map((l: Level) => (
                    <div className="bar-row" role="row" key={l}>
                      <span role="cell">{t(LEVEL_SHORT[l])}</span>
                      <span role="cell" className="bar-track">
                        <span className="bar-fill" style={{ width: `${((counts[l] ?? 0) / maxCount) * 100}%`, background: pal.level[l] }} />
                      </span>
                      <span role="cell" className="bar-value">
                        {(counts[l] ?? 0).toLocaleString(locale())} <small className="muted">({total ? (((counts[l] ?? 0) / total) * 100).toFixed(1) : 0} %)</small>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="a-panel">
                <h3>{t("Seuil de pluie (44 mm en 24 h, provisoire)")}</h3>
                <ul className="facts">
                  <li>
                    {t("Zones méditerranéennes où il a été ajusté :")} <strong>{head(trig?.flood_zones_caught)}</strong> {t("inondations détectées")}
                  </li>
                  <li>
                    {t("Inondations tunisiennes, pluviomètres INM (non ajusté sur elles) :")} <strong>{head(tnGauges.floods_caught_zone_dates)}</strong> {t("détectées")}
                  </li>
                  <li>
                    {t("Déclenchements sans inondation cartographiée : environ {n} par zone et par an", {
                      n: String(trig?.false_triggers_per_zone_per_year ?? "–").replace(".", lang === "fr" ? "," : "."),
                    })}
                  </li>
                </ul>
              </div>
            </section>
            <section className="a-panel">
              <h3>{t("Modèle : ce qui a été validé")}</h3>
              <p className="muted m-small">
                {t("Précision en service :")} <strong>{t("non mesurée")}</strong>
                {t(", il n'y a pas encore d'inondations confirmées dans la zone. Les chiffres ci-dessous viennent des tests hors ligne. ROC-AUC : 0,5 = hasard, 1 = classement parfait. « Élevé » = 2 % des routes de chaque zone.")}
              </p>
              <table className="a-table">
                <thead>
                  <tr>
                    <th>{t("Test du modèle terrain")}</th>
                    <th className="num">ROC-AUC</th>
                    <th className="num">{t("Référence")}</th>
                    <th className="num">{t("Rappel (élevé)")}</th>
                    <th className="num">{t("Précision (élevé)")}</th>
                    <th>{t("Statut")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(metrics?.terrain_validation?.tests ?? []).map((x) => (
                    <tr key={x.name}>
                      <td>{t(x.name)}</td>
                      <td className="num">{x.roc_auc?.toFixed(3) ?? "–"}</td>
                      <td className="num" title={x.baseline ? t(x.baseline) : undefined}>
                        {x.baseline_roc_auc?.toFixed(3) ?? "–"}
                      </td>
                      <td className="num">{pct(x.recall_high)}</td>
                      <td className="num">{pct(x.precision_high)}</td>
                      <td>{t(x.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3>{t("Limites à garder en tête")}</h3>
              <ul className="facts">
                {(metrics?.terrain_validation?.limits ?? []).map((l) => (
                  <li key={l}>{t(l)}</li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: number | undefined; note?: string }) {
  return (
    <div className="a-kpi">
      <small className="muted">{label}</small>
      <strong>{value === undefined ? "–" : value.toLocaleString(locale())}</strong>
      {note && <small className="muted">{note}</small>}
    </div>
  );
}
