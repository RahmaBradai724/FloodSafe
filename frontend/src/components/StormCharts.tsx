import type { Storm } from "../api";
import { locale, useT } from "../i18n";

const W = 340;
const PAD_L = 30;
const PAD_R = 8;

interface Props {
  storm: Storm;
  index: number;
  onSeek?: (i: number) => void;
  /** false: a read-only chart (no cursor seeking, no hint) */
  interactive?: boolean;
}

/** Two small charts sharing the time axis: hourly rain, and the 24 h total the trigger reads against 44 mm. */
export default function StormCharts({ storm, index, onSeek, interactive = true }: Props) {
  const t = useT();
  const hours = storm.hours;
  const n = hours.length;
  const x = (i: number) => PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R);
  const seek = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!interactive || !onSeek) return;
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    onSeek(Math.max(0, Math.min(n - 1, Math.round(((px - PAD_L) / (W - PAD_L - PAD_R)) * (n - 1)))));
  };

  // hourly rain
  const H1 = 92;
  const maxH = Math.max(4, Math.ceil(Math.max(...hours.map((h) => h.zone_mm_h))));
  const y1 = (v: number) => 10 + (1 - v / maxH) * (H1 - 26);
  const barW = Math.max(2, (W - PAD_L - PAD_R) / n - 2);

  // 24 h total
  const H2 = 120;
  const max24 = Math.max(storm.threshold_mm * 1.5, Math.ceil(Math.max(...hours.map((h) => h.rain_24h_mm)) / 20) * 20);
  const y2 = (v: number) => 10 + (1 - v / max24) * (H2 - 30);
  const line = hours.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y2(h.rain_24h_mm).toFixed(1)}`).join("");
  const on = hours.map((h, i) => (h.trigger ? i : -1)).filter((i) => i >= 0);
  const day = (i: number) =>
    new Date(hours[i].t).toLocaleDateString(locale(), { weekday: "short", day: "numeric", timeZone: "Africa/Tunis" });
  const ticks = hours.map((h, i) => (new Date(h.t).getUTCHours() === 23 ? i : -1)).filter((i) => i >= 0);

  return (
    <div className="storm-charts">
      <h3>{t("Pluie heure par heure (mm/h)")}</h3>
      <svg viewBox={`0 0 ${W} ${H1}`} onClick={seek} role="img" aria-label={t("Pluie horaire sur la zone")}>
        {[0, maxH / 2, maxH].map((v) => (
          <g key={v}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y1(v)} y2={y1(v)} className="grid" />
            <text x={PAD_L - 4} y={y1(v) + 3} className="tick" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {hours.map((h, i) => {
          const top = y1(h.zone_mm_h);
          const height = y1(0) - top;
          return (
            <rect
              key={h.t}
              x={x(i) - barW / 2}
              y={top}
              width={barW}
              height={Math.max(0, height)}
              rx={Math.min(2, barW / 2)}
              className={i <= index ? "bar" : "bar future"}
            >
              <title>{`${new Date(h.t).toLocaleString(locale(), { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" })} : ${h.zone_mm_h.toFixed(1)} mm/h`}</title>
            </rect>
          );
        })}
        <line x1={x(index)} x2={x(index)} y1={6} y2={y1(0)} className="cursor" />
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H1 - 4} className="tick" textAnchor="middle">
            {day(Math.min(n - 1, i + 1))}
          </text>
        ))}
      </svg>

      <h3>{t("Cumul sur 24 h : 12 h tombées + 12 h prévues (mm)")}</h3>
      <svg viewBox={`0 0 ${W} ${H2}`} onClick={seek} role="img" aria-label={t("Cumul 24 heures face au seuil de 44 mm")}>
        {on.length > 0 && (
          <rect x={x(on[0])} y={6} width={x(on[on.length - 1]) - x(on[0])} height={y2(0) - 6} className="alert-band">
            <title>{t("Période d'alerte")}</title>
          </rect>
        )}
        {[0, storm.threshold_mm, max24].map((v) => (
          <g key={v}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y2(v)} y2={y2(v)} className={v === storm.threshold_mm ? "threshold" : "grid"} />
            <text x={PAD_L - 4} y={y2(v) + 3} className={v === storm.threshold_mm ? "tick strong" : "tick"} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <text x={W - PAD_R} y={y2(storm.threshold_mm) - 4} className="tick strong" textAnchor="end">
          {t("seuil {s} mm", { s: storm.threshold_mm })}
        </text>
        <path d={line} className="total future" />
        <path d={line} className="total" style={{ clipPath: `inset(0 ${(((W - x(index)) / W) * 100).toFixed(2)}% 0 0)` }} />
        <circle cx={x(index)} cy={y2(hours[index].rain_24h_mm)} r={4.5} className={hours[index].trigger ? "dot on" : "dot"} />
        <line x1={x(index)} x2={x(index)} y1={6} y2={y2(0)} className="cursor" />
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H2 - 6} className="tick" textAnchor="middle">
            {day(Math.min(n - 1, i + 1))}
          </text>
        ))}
      </svg>
      {interactive && <small className="muted">{t("Touchez un graphique pour aller à une heure.")}</small>}
    </div>
  );
}
