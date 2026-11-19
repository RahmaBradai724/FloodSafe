import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type DemoState, type Route, type RouteResult, type RouteSegment, type Trigger, type ZoneMap } from "../api";
import RainCanvas from "../components/RainCanvas";
import RiskMap from "../components/RiskMap";
import { weatherLabel } from "../components/ZoneBanner";
import SegmentSheet from "../components/SegmentSheet";
import PlaceInput from "../components/PlaceInput";
import Icon, { type IconName } from "../components/Icons";
import { LEVELS, LEVEL_LABEL, exposureOf, km, minutes, rank } from "../levels";
import { usePalette, useTheme } from "../theme";
import { useSession } from "../session";
import { LANG_NAME, locale, tr, useLang, useT } from "../i18n";

type Pick = "origin" | "destination" | null;
const REFRESH_MS = 5 * 60 * 1000;
const DEMO_POLL_MS = 2000;
const THEME_FR = { auto: "Automatique", light: "Clair", dark: "Sombre" } as const;

/** The alert that re-planned the current trip (the « Alerte » screen of the mock-up). */
type Rerouted = { avoided: number; extra_s: number | null; safer: boolean };

function firstName(email: string | undefined) {
  const n = (email ?? "").split(/[.@_\-+0-9]/)[0];
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : "";
}

const hhmm = (d: Date) => d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", hour12: false });

function routeTitle(r: Route) {
  if (r.kind === "safer") return tr("Plus sûr");
  if (r.kind === "fastest") return tr("Le plus rapide");
  return r.via.length ? tr("Par {via}", { via: r.via[0] }) : tr("Autre itinéraire");
}
const ROUTE_ICON: Record<Route["kind"], IconName> = { safer: "shield", fastest: "bolt", alternative: "route" };
/** Picks the singular or the plural text, then fills in {n}. */
const count = (n: number, one: string, many: string) => tr(n > 1 ? many : one, { n });

export default function UserMapPage() {
  const pal = usePalette();
  const { pref, cycle } = useTheme();
  const { user, logout } = useSession();
  const t = useT();
  const { lang, toggle: toggleLang } = useLang();
  const [zone, setZone] = useState<ZoneMap | null>(null);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [reports, setReports] = useState<number | null>(null);
  const [showExposed, setShowExposed] = useState(true);
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [destination, setDestination] = useState<[number, number] | null>(null);
  const [originLabel, setOriginLabel] = useState("");
  const [destLabel, setDestLabel] = useState("");
  const [picking, setPicking] = useState<Pick>("destination");
  const [result, setResult] = useState<RouteResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [segment, setSegment] = useState<RouteSegment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState<Date | null>(null);
  const [rerouted, setRerouted] = useState<Rerouted | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState<"profile" | "layers" | null>(null);
  const [demo, setDemo] = useState<DemoState>({ active: false });
  const [notif, setNotif] = useState<{ kind: "alert" | "end"; title: string; text: string } | null>(null);
  const trip = useRef({ origin, destination, hasResult: false });
  trip.current = { origin, destination, hasResult: result !== null };

  // the sheet's height places the map buttons just above it (phones)
  const sheetRef = useRef<HTMLElement>(null);
  const [sheetH, setSheetH] = useState(0);
  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSheetH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const loadZone = useCallback(() => {
    api
      .zoneMap("moderate")
      .then((z) => {
        setZone(z);
        setZoneError(null);
      })
      .catch((e) => setZoneError(e.message));
    api
      .recentFeedback()
      .then((r) => setReports(r.count))
      .catch(() => setReports(null));
  }, []);

  // The trigger is re-read every 5 minutes, as the backend refreshes the rain
  useEffect(() => {
    loadZone();
    const t = window.setInterval(loadZone, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [loadZone]);

  // A storm replay shared by the admin (demo page): the app follows it as if it were live
  useEffect(() => {
    const poll = () => api.demoState().then(setDemo).catch(() => undefined);
    poll();
    const t = window.setInterval(poll, DEMO_POLL_MS);
    return () => window.clearInterval(t);
  }, []);

  const demoTrigger: Trigger | null = demo.active
    ? { threshold_mm: demo.threshold_mm, window: "", validation: "provisional", status: demo.hour.trigger ? "on" : "off", max_rain_24h_mm: demo.hour.rain_24h_mm }
    : null;
  const demoOn = demo.active ? demo.hour.trigger : null;
  const lastDemoOn = useRef<boolean | null>(null);

  // When the replayed trigger flips: notify, refresh the zone, and re-plan the current trip
  useEffect(() => {
    const prev = lastDemoOn.current;
    lastDemoOn.current = demoOn;
    if (prev === demoOn) return;
    loadZone();
    const { origin: o, destination: d, hasResult } = trip.current;
    const planned = !!(o && d && hasResult && prev !== null);
    if (demoOn === true && prev !== null) {
      setNotif({
        kind: "alert",
        title: "FloodSafe · Alerte inondation",
        text: planned ? "Forte pluie prévue à Nabeul. Votre itinéraire a été recalculé." : "Forte pluie prévue à Nabeul. Les routes exposées passent en alerte.",
      });
      navigator.vibrate?.([200, 100, 200]);
    } else if (demoOn === false && prev === true) {
      setNotif({ kind: "end", title: "FloodSafe · Fin de l'alerte", text: "La pluie prévue repasse sous le seuil. Restez prudent sur les routes encore mouillées." });
      setRerouted(null);
    }
    if (planned && o && d) {
      api
        .routes(o, d, "high")
        .then((r) => {
          setResult(r);
          setSelectedId(r.safer_route_id ?? r.routes[0]?.id ?? null);
          setSegment(null);
          if (demoOn) {
            const fastest = r.routes.find((x) => x.kind === "fastest");
            const safer = r.routes.find((x) => x.id === r.safer_route_id);
            setRerouted({ avoided: fastest?.alert.count ?? 0, extra_s: safer?.extra_duration_s ?? null, safer: !!safer });
            setCollapsed(false);
          }
        })
        .catch(() => undefined);
    }
  }, [demoOn, loadZone]);

  // the notification slides away by itself
  useEffect(() => {
    if (!notif) return;
    const t = window.setTimeout(() => setNotif(null), 9000);
    return () => window.clearTimeout(t);
  }, [notif]);

  const trigger = demoTrigger ?? result?.trigger ?? zone?.trigger ?? null;
  const triggerOn = trigger?.status === "on";
  const weather = demo.active ? { mode: "replay", simulated: true, available: true, last_error: null } : result?.weather ?? zone?.weather;
  const routes = result?.routes ?? [];
  const selected = routes.find((r) => r.id === selectedId) ?? null;
  const focus = useMemo(() => (selected ? selected.segments.flatMap((s) => s.coords) : null), [selected]);
  const roadsShown = zone ? zone.items.filter((r) => (triggerOn ? rank(r.level) >= 2 : rank(r.exposure) >= 2)).length : null;

  function setPoint(which: "origin" | "destination", p: [number, number], label: string) {
    setResult(null);
    setSelectedId(null);
    setSegment(null);
    setStarted(null);
    setRerouted(null);
    setError(null);
    setCollapsed(false);
    if (which === "origin") {
      setOrigin(p);
      setOriginLabel(label);
      setPicking(destination ? null : "destination");
    } else {
      setDestination(p);
      setDestLabel(label);
      setPicking(origin ? null : "origin");
    }
  }

  function onMapClick(lat: number, lon: number) {
    if (result) return;
    const which = picking ?? (!destination ? "destination" : !origin ? "origin" : null);
    if (which) setPoint(which, [lat, lon], t("Point sur la carte"));
  }

  function locate() {
    if (!navigator.geolocation) return setError(t("La géolocalisation n'est pas disponible."));
    navigator.geolocation.getCurrentPosition(
      (pos) => setPoint("origin", [pos.coords.latitude, pos.coords.longitude], t("Ma position")),
      () => setError(t("Position refusée ou introuvable.")),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function plan() {
    if (!origin || !destination) return;
    setBusy(true);
    setError(null);
    setSegment(null);
    try {
      const r = await api.routes(origin, destination, "high");
      setResult(r);
      setSelectedId(r.safer_route_id ?? r.routes[0]?.id ?? null);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function openZoneRoad(id: number, lat?: number, lon?: number) {
    // once a trip is being set up, a tap on a road places the missing point; before that it opens the road's detail
    if ((origin || destination) && !result && picking && lat !== undefined && lon !== undefined) return onMapClick(lat, lon);
    try {
      setSegment(await api.segment(id));
      setCollapsed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function reset() {
    setOrigin(null);
    setDestination(null);
    setOriginLabel("");
    setDestLabel("");
    setResult(null);
    setSelectedId(null);
    setSegment(null);
    setStarted(null);
    setRerouted(null);
    setPicking("destination");
    setError(null);
  }

  function back() {
    if (segment) return setSegment(null);
    if (started) return setStarted(null);
    setResult(null);
    setSelectedId(null);
  }

  const view = segment ? "segment" : rerouted ? "alert" : started && selected ? "nav" : result ? "routes" : origin || destination ? "trip" : "home";
  const showSearch = view === "home" || view === "trip";
  const byKind = (k: Route["kind"]) => routes.find((r) => r.kind === k);

  // --- pieces of the sheet -------------------------------------------------------------
  const mm = trigger?.max_rain_24h_mm ?? 0;
  const threshold = trigger?.threshold_mm ?? 44;
  const gauge = (
    <div className="m-gauge" aria-label={t("{mm} mm sur un seuil de {s} mm", { mm: mm.toFixed(0), s: threshold })}>
      <b style={{ width: `${Math.min(100, (mm / (threshold * 1.5)) * 100)}%` }} />
      <i />
    </div>
  );
  const rainCard =
    !trigger || trigger.status === "unknown" ? (
      <div className="m-card">
        <b>{t("Alerte pluie non disponible")}</b>
        <div className="muted m-small">
          {t("Seules les routes exposées sont affichées.")} {weatherLabel(weather)}
        </div>
      </div>
    ) : triggerOn ? (
      <div className="m-card m-alert" role="alert">
        <div className="m-alert-title">
          <Icon name="water" />
          {t("Alerte pluie dans la zone")}
        </div>
        <div className="m-small">
          {t("{mm} mm en 24 h · seuil {s} mm", { mm: mm.toFixed(0), s: threshold })}
        </div>
        {gauge}
      </div>
    ) : (
      <div className="m-card">
        <div className="m-spread">
          <b>{t("Pluie sur 24 h")}</b>
          <span className="muted">
            {mm.toFixed(0)} / {threshold} mm
          </span>
        </div>
        {gauge}
        <div className="muted m-tiny">
          {t("12 h tombées + 12 h prévues · seuil provisoire")} · {weatherLabel(weather)}
        </div>
      </div>
    );

  return (
    <div className={`m-app view-${view}`} style={{ ["--sheet-h" as string]: `${sheetH}px` }}>
      <div className="m-map">
        <RiskMap
          zone={zone}
          showExposed={showExposed}
          routes={routes}
          selectedRouteId={selectedId}
          origin={origin}
          destination={destination}
          focus={focus}
          onMapClick={onMapClick}
          onSelectRoute={(id) => (setSelectedId(id), setSegment(null))}
          onSelectSegment={(s) => (setSegment(s), setCollapsed(false))}
          onSelectZoneRoad={openZoneRoad}
        />
        {demo.active && <RainCanvas mmPerHour={demo.hour.zone_mm_h} />}
      </div>

      {/* top: search + profile, or a back button */}
      <div className="m-top">
        {showSearch ? (
          <>
            <PlaceInput
              variant="search"
              placeholder={t("Où allez-vous ?")}
              value={destLabel}
              onPick={(lat, lon, l) => setPoint("destination", [lat, lon], l)}
            />
            <button className="m-fab" onClick={() => setMenu(menu === "profile" ? null : "profile")} aria-label={t("Mon compte")} aria-expanded={menu === "profile"}>
              <Icon name="user" />
            </button>
          </>
        ) : (
          view !== "alert" && (
            <button className="m-fab" onClick={back} aria-label={t("Retour")}>
              <Icon name="back" />
            </button>
          )
        )}
      </div>
      {showSearch && (
        <div className="m-pills">
          <span className={`m-pill ${triggerOn ? "on" : ""}`}>
            <span className="m-dot" style={{ background: zoneError ? pal.idle : triggerOn ? pal.level.very_high : pal.safe }} />
            {zoneError ? t("Serveur injoignable") : triggerOn ? t("Alerte pluie en cours") : t("Pas d'alerte pluie")}
          </span>
          {demo.active && (
            <span className="m-pill">
              {t("Rejeu orage · {t}", {
                t: new Date(demo.hour.t).toLocaleString(locale(), { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" }),
              })}
            </span>
          )}
        </div>
      )}

      {menu === "profile" && (
        <div className="m-pop m-profile">
          <div className="m-pop-head">
            <b>{firstName(user?.email) || t("Mon compte")}</b>
            <small className="muted">{user?.email}</small>
          </div>
          <button onClick={cycle}>
            {t("Thème")} <span className="muted">{t(THEME_FR[pref])}</span>
          </button>
          <button onClick={toggleLang}>
            {t("Langue")} <span className="muted">{LANG_NAME[lang]}</span>
          </button>
          {user?.role === "admin" && <Link to="/demo">{t("Démo orage")}</Link>}
          {user?.role === "admin" && <Link to="/admin">{t("Administration")}</Link>}
          <button onClick={logout}>{t("Déconnexion")}</button>
        </div>
      )}

      {/* map buttons, just above the sheet */}
      <div className="m-side">
        <button className={`m-fab ${menu === "layers" ? "on" : ""}`} onClick={() => setMenu(menu === "layers" ? null : "layers")} aria-label={t("Légende et calques")}>
          <Icon name="layers" />
        </button>
        <button className="m-fab" onClick={locate} aria-label={t("Partir de ma position")}>
          <Icon name="locate" />
        </button>
        {menu === "layers" && (
          <div className="m-pop m-legend" aria-label={t("Légende")}>
            {triggerOn ? (
              LEVELS.slice(1).map((l) => (
                <span key={l}>
                  <i style={{ background: pal.level[l], height: 3 + rank(l) }} />
                  {t(LEVEL_LABEL[l])}
                </span>
              ))
            ) : (
              <label>
                <input type="checkbox" checked={showExposed} onChange={(e) => setShowExposed(e.target.checked)} />
                <i className="dashed" style={{ borderColor: pal.exposed }} />
                {t("Routes exposées en cas de forte pluie")}
              </label>
            )}
            <span>
              <i style={{ background: pal.ink, height: 5 }} />
              {t("Itinéraire choisi")}
            </span>
          </div>
        )}
      </div>

      {notif && (
        <div className={`m-notif ${notif.kind}`} role="alert" onClick={() => setNotif(null)}>
          <span className="m-notif-ico">
            <Icon name="bell" />
          </span>
          <div>
            <small>{t("maintenant")}</small>
            <b>{t(notif.title)}</b>
            <p>{t(notif.text)}</p>
          </div>
        </div>
      )}

      {picking && view === "trip" && (
        <div className="m-hint">{picking === "origin" ? t("Touchez la carte pour placer le départ") : t("Touchez la carte pour placer l'arrivée")}</div>
      )}

      {/* the bottom sheet (a side panel on large screens) */}
      <aside ref={sheetRef} className={`m-sheet ${collapsed ? "collapsed" : ""}`}>
        <button className="m-grab" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? t("Agrandir") : t("Réduire")}>
          <span />
        </button>

        {view === "home" && (
          <>
            <h2 className="m-h">{t("Bonjour {name}", { name: firstName(user?.email) })}</h2>
            {rainCard}
            <div className="m-stats">
              <div className="m-card">
                <span className="m-dot" style={{ background: triggerOn ? pal.level.very_high : pal.exposed }} />
                <span>
                  <b>{roadsShown ?? "–"}</b> {triggerOn ? t("routes en alerte") : t("routes exposées")}
                </span>
              </div>
              <div className="m-card">
                <Icon name="flag" size={13} />
                <span>
                  <b>{reports ?? "–"}</b> {reports === 1 ? t("signalement") : t("signalements")}
                </span>
              </div>
            </div>
            <p className="m-tiny muted m-disclaimer">
              {t("Cherchez une destination ou touchez la carte. Indication de risque, pas une certitude : ne remplace pas les alertes officielles.")}
            </p>
          </>
        )}

        {view === "trip" && (
          <>
            <h2 className="m-h">{t("Votre trajet")}</h2>
            <div className="m-card m-trip">
              <PlaceInput
                variant="field"
                label={t("Départ")}
                placeholder={t("Rechercher ou toucher la carte")}
                dot={pal.safe}
                value={originLabel}
                picking={picking === "origin"}
                onPick={(lat, lon, l) => setPoint("origin", [lat, lon], l)}
                onPickOnMap={() => setPicking(picking === "origin" ? null : "origin")}
                onLocate={locate}
              />
              <PlaceInput
                variant="field"
                label={t("Arrivée")}
                placeholder={t("Rechercher ou toucher la carte")}
                dot={pal.ink}
                value={destLabel}
                picking={picking === "destination"}
                onPick={(lat, lon, l) => setPoint("destination", [lat, lon], l)}
                onPickOnMap={() => setPicking(picking === "destination" ? null : "destination")}
              />
            </div>
            <div className="m-actions">
              <button className="m-btn ghost" onClick={reset}>
                {t("Effacer")}
              </button>
              <button className="m-btn" disabled={!origin || !destination || busy} onClick={plan}>
                {busy ? t("Calcul…") : t("Voir les itinéraires")}
              </button>
            </div>
            {error && <p className="error m-small">{error}</p>}
          </>
        )}

        {view === "routes" && (
          <>
            <h2 className="m-h">{t("Choisir un itinéraire")}</h2>
            <div className="m-chips">
              {([
                ["safer", "shield", "Plus sûr"],
                ["fastest", "bolt", "Plus rapide"],
                ["alternative", "route", "Autres"],
              ] as const).map(([k, ic, label]) => {
                const r = byKind(k);
                return (
                  <button key={k} className={`m-chip ${selected?.kind === k ? "on" : ""}`} disabled={!r} onClick={() => r && setSelectedId(r.id)}>
                    <Icon name={ic} size={11} />
                    {t(label)}
                  </button>
                );
              })}
            </div>
            {result?.fallback && (
              <p className="m-card m-alert m-small">{t("Aucun itinéraire plus sûr trouvé. Reportez le trajet si possible et n'entrez jamais dans une route inondée.")}</p>
            )}
            {routes.map((r) => (
              <RouteCard key={r.id} route={r} triggerOn={triggerOn} selected={r.id === selectedId} onSelect={() => setSelectedId(r.id)} />
            ))}
            {selected && (
              <button className="m-btn wide" onClick={() => (setStarted(new Date()), setCollapsed(false))}>
                {t("Démarrer · arrivée {t}", { t: hhmm(new Date(Date.now() + selected.duration_s * 1000)) })}
              </button>
            )}
            <p className="m-tiny muted m-disclaimer">{t("Touchez un tronçon coloré pour voir pourquoi il est à risque.")}</p>
          </>
        )}

        {view === "nav" && selected && started && (
          <>
            <div className="m-spread">
              <div>
                <h2 className="m-h" style={{ margin: 0 }}>
                  {routeTitle(selected)}
                </h2>
                <small className="muted">
                  {t("Arrivée {t} · {d}", { t: hhmm(new Date(started.getTime() + selected.duration_s * 1000)), d: km(selected.distance_m) })}
                </small>
              </div>
              <button className="m-btn ghost" onClick={reset}>
                {t("Terminer")}
              </button>
            </div>
            {triggerOn && rainCard}
          </>
        )}

        {view === "alert" && rerouted && (
          <>
            {rainCard}
            {rerouted.safer && selected ? (
              <div className="m-card m-route sel">
                <span className="m-ricon">
                  <Icon name="shield" size={17} />
                </span>
                <div>
                  <div className="m-rt">{t("Itinéraire recalculé")}</div>
                  <div className="m-rs">{count(rerouted.avoided, "Évite {n} tronçon à risque élevé", "Évite {n} tronçons à risque élevé")}</div>
                </div>
                <div className="m-rv">
                  {rerouted.extra_s !== null ? `+${rerouted.extra_s < 60 ? `${Math.round(rerouted.extra_s)} s` : minutes(rerouted.extra_s)}` : ""}
                  <small>{minutes(selected.duration_s)}</small>
                </div>
              </div>
            ) : (
              <p className="m-card m-small">
                {t("Aucun itinéraire plus sûr trouvé. Reportez le trajet si possible et n'entrez jamais dans une route inondée.")}
              </p>
            )}
            <div className="m-actions">
              <button className="m-btn ghost" onClick={reset}>
                {t("Reporter")}
              </button>
              <button className="m-btn" onClick={() => setRerouted(null)}>
                {t("Continuer")}
              </button>
            </div>
          </>
        )}

        {view === "segment" && segment && <SegmentSheet segment={segment} triggerOn={triggerOn} />}
      </aside>
    </div>
  );
}

function RouteCard({ route, triggerOn, selected, onSelect }: { route: Route; triggerOn: boolean; selected: boolean; onSelect: () => void }) {
  const pal = usePalette();
  const t = useT();
  const exposed = route.segments.filter((s) => rank(exposureOf(s.susceptibility)) >= 2).length;
  const [dot, sub] = triggerOn
    ? route.alert.count > 0
      ? [pal.level[route.max_level], count(route.alert.count, "{n} tronçon à risque élevé", "{n} tronçons à risque élevé")]
      : rank(route.max_level) >= 1
        ? [pal.level[route.max_level], t("{level} au plus", { level: t(LEVEL_LABEL[route.max_level]) })]
        : [pal.safe, t("0 tronçon à risque")]
    : exposed > 0
      ? [pal.exposed, count(exposed, "Pas d'alerte · {n} tronçon exposé", "Pas d'alerte · {n} tronçons exposés")]
      : [pal.safe, t("Pas d'alerte · 0 tronçon exposé")];
  return (
    <button className={`m-card m-route ${selected ? "sel" : ""}`} onClick={onSelect} aria-pressed={selected}>
      <span className="m-ricon">
        <Icon name={ROUTE_ICON[route.kind]} size={17} />
      </span>
      <div>
        <div className="m-rt">{routeTitle(route)}</div>
        <div className="m-rs">
          <span className="m-dot" style={{ background: dot }} />
          {sub}
        </div>
      </div>
      <div className="m-rv">
        {minutes(route.duration_s)}
        <small>{km(route.distance_m)}</small>
      </div>
    </button>
  );
}
