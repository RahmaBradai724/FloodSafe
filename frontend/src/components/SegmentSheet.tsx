import { useState } from "react";
import { api, type FeedbackItem, type Level, type RouteSegment } from "../api";
import { LEVEL_SHORT, clock, exposureOf, factorsFr, rank } from "../levels";
import { usePalette } from "../theme";
import { useT } from "../i18n";
import Icon, { type IconName } from "./Icons";

const CONFIDENCE_FR = { high: "Élevée", medium: "Moyenne", low: "Faible" } as const;
const CROSSING_FR: Record<string, string> = { underpass: "Passage inférieur", ford: "Gué", low_crossing: "Traversée basse" };
// zone budgets of the terrain model: 10 % moderate or more, 2 % high or more, 0.5 % very high
const ZONE_RANK: Record<Level, string> = { very_high: "Top 0,5 %", high: "Top 2 %", moderate: "Top 10 %", low: "Hors top 10 %" };

const REPORTS: { kind: FeedbackItem["kind"]; label: string; icon: IconName }[] = [
  { kind: "flooded", label: "Inondée", icon: "water" },
  { kind: "not_flooded", label: "Pas d'eau", icon: "ok" },
  { kind: "drain_blocked", label: "Avaloir bouché", icon: "drain" },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « Détail du tronçon »: why this road, and a report from the spot. */
export default function SegmentSheet({ segment, triggerOn }: { segment: RouteSegment; triggerOn: boolean }) {
  const pal = usePalette();
  const t = useT();
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exposure = exposureOf(segment.susceptibility);
  // factorsFr gives the factors in the current language
  const reasons = [
    ...segment.explanations.flatMap((e) => factorsFr(e.text)).flatMap((f) => f.split(", ")),
    ...(segment.crossing ? [t(CROSSING_FR[segment.crossing] ?? segment.crossing)] : []),
  ];
  const mid = segment.coords[Math.floor(segment.coords.length / 2)] ?? segment.coords[0];

  // In an alert the badge is the alert level; otherwise how exposed the road is in heavy rain
  const badge =
    triggerOn || rank(exposure) < 2
      ? { text: t(LEVEL_SHORT[triggerOn ? segment.level : "low"]), color: pal.level[triggerOn ? segment.level : "low"] }
      : { text: t("Exposée · {level}", { level: t(LEVEL_SHORT[exposure]).toLowerCase() }), color: pal.exposed };

  async function report(kind: FeedbackItem["kind"], label: string) {
    setError(null);
    try {
      await api.feedback(kind, mid[0], mid[1], segment.segment_id);
      setSent(label);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section aria-label={t("Détail du tronçon")}>
      <div className="m-seg-head">
        <div>
          <h2 className="m-h">{segment.name ?? t("Route sans nom")}</h2>
          {segment.eta && <small className="muted">{t("Passage prévu vers {t}", { t: clock(segment.eta) })}</small>}
        </div>
        <span className="m-badge" style={{ color: badge.color, background: `${badge.color}22` }}>
          ● {badge.text}
        </span>
      </div>

      <p className="m-label">{t("Pourquoi ce tronçon ?")}</p>
      <div className="m-reasons">
        {reasons.length ? reasons.map((r) => <span key={r}>{cap(r)}</span>) : <span>{t("Aucun facteur dominant")}</span>}
      </div>

      <div className="m-card m-kv">
        <div>
          <span className="muted">{t("Confiance")}</span>
          <b>{t(CONFIDENCE_FR[segment.confidence_label] ?? segment.confidence_label)}</b>
        </div>
        <div>
          <span className="muted">{t("Classement de la zone")}</span>
          <b>{t(ZONE_RANK[exposure])}</b>
        </div>
      </div>

      <p className="m-label">{t("Vous êtes sur place ?")}</p>
      <div className="m-report">
        {REPORTS.map((r) => (
          <button key={r.kind} disabled={!!sent} onClick={() => report(r.kind, r.label)} className={sent === r.label ? "on" : ""}>
            <Icon name={r.icon} size={18} />
            {t(r.label)}
          </button>
        ))}
      </div>
      {sent && <p className="ok m-small">{t("Merci : « {label} » envoyé.", { label: t(sent) })}</p>}
      {error && <p className="error m-small">{error}</p>}
    </section>
  );
}
