import type { Trigger, WeatherStatus } from "../api";
import { clock } from "../levels";
import { tr, useT } from "../i18n";

const SCENARIO_FR: Record<string, string> = { storm: "orage", showers: "averses", dry: "temps sec" };

export function weatherLabel(w: WeatherStatus | null | undefined): string {
  if (!w) return "";
  if (w.mode === "replay") return tr("Rejeu : pluie archivée");
  if (w.mode.startsWith("scenario:")) return tr("Scénario simulé : {s}", { s: tr(SCENARIO_FR[w.mode.slice(9)] ?? w.mode.slice(9)) });
  if (w.mode === "outage" || w.simulated_outage) return tr("Données pluie anciennes (panne simulée)");
  if (!w.available) return tr("Données pluie indisponibles");
  return tr("Données pluie : {t}", { t: clock(w.retrieved_at) });
}

/** Zone rain trigger: the only thing that turns exposed roads into alerts. */
export default function ZoneBanner({ trigger, weather }: { trigger: Trigger | null; weather?: WeatherStatus | null }) {
  const t = useT();
  if (!trigger || trigger.status === "unknown") {
    return (
      <div className="banner neutral" role="status">
        <strong>{t("Alerte pluie non disponible")}</strong>
        <span>
          {t("Seules les routes exposées sont affichées.")} {weatherLabel(weather)}
        </span>
      </div>
    );
  }
  const mm = trigger.max_rain_24h_mm ?? 0;
  const pct = Math.min(100, (mm / (trigger.threshold_mm * 1.5)) * 100);
  const mark = (1 / 1.5) * 100;
  const on = trigger.status === "on";
  const vars = { mm: mm.toFixed(0), s: trigger.threshold_mm };
  return (
    <div className={`banner ${on ? "alert" : "calm"}`} role={on ? "alert" : "status"}>
      <div className="banner-head">
        <span className="banner-icon" aria-hidden>
          {on ? (
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M12 3 2 20h20L12 3Zm0 5.5 1 6.5h-2l1-6.5Zm0 8.5a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M12 2.5c3.6 4.6 6.5 8.3 6.5 11.6A6.5 6.5 0 0 1 5.5 14.1C5.5 10.8 8.4 7.1 12 2.5Z" fill="currentColor" />
            </svg>
          )}
        </span>
        <strong>{on ? t("Alerte pluie dans la zone") : t("Pas d'alerte pluie")}</strong>
      </div>
      <span>
        {on ? t("{mm} mm en 24 h (seuil {s} mm) : évitez les routes en rouge et orange.", vars) : t("{mm} mm en 24 h, sous le seuil de {s} mm.", vars)}
      </span>
      <div className="gauge" aria-label={t("{mm} mm sur un seuil de {s} mm", vars)}>
        <div className="gauge-fill" style={{ width: `${pct}%` }} />
        <div className="gauge-mark" style={{ left: `${mark}%` }} title={t("seuil {s} mm", vars)} />
      </div>
      <small>
        {t("12 h tombées + 12 h prévues · seuil provisoire")} · {weatherLabel(weather)}
      </small>
    </div>
  );
}
