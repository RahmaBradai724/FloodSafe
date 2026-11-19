import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * Two languages. French is the source text: components write t("texte français") and English is looked up
 * in EN below. A text missing from EN is shown in French, so nothing ever breaks.
 * Variables: t("Bonjour {name}", { name }).
 */
export type Lang = "fr" | "en";
const KEY = "floodsafe.lang";

function readLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "fr" || v === "en") return v;
  } catch {
    /* private window */
  }
  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "fr";
}

let current: Lang = readLang();
document.documentElement.lang = current;

export const getLang = () => current;
/** Locale for dates and numbers. */
export const locale = () => (current === "en" ? "en-GB" : "fr-FR");

export type Vars = Record<string, string | number>;

export function tr(fr: string, vars?: Vars): string {
  let s = current === "en" ? EN[fr] ?? fr : fr;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
  return s;
}

interface LangValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
}
const LangContext = createContext<LangValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);
  const value = useMemo<LangValue>(() => {
    const setLang = (l: Lang) => {
      current = l;
      try {
        localStorage.setItem(KEY, l);
      } catch {
        /* the choice simply isn't remembered */
      }
      setLangState(l);
    };
    return { lang, setLang, toggle: () => setLang(lang === "fr" ? "en" : "fr") };
  }, [lang]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangValue {
  const v = useContext(LangContext);
  if (!v) throw new Error("useLang outside LangProvider");
  return v;
}

/** The translate function; calling the hook makes the component re-render when the language changes. */
export function useT() {
  useLang();
  return tr;
}

export const LANG_NAME: Record<Lang, string> = { fr: "Français", en: "English" };

/** Small FR / EN switch. */
export function LangToggle() {
  const { lang, toggle } = useLang();
  const label = lang === "fr" ? "Switch to English" : "Passer en français";
  return (
    <button className="iconbtn lang-toggle" onClick={toggle} title={label} aria-label={label}>
      {lang === "fr" ? "FR" : "EN"}
    </button>
  );
}

const EN: Record<string, string> = {
  // --- general
  "Chargement…": "Loading…",
  "Serveur injoignable. Vérifiez la connexion.": "Server unreachable. Check your connection.",
  "Thème": "Theme",
  "Langue": "Language",
  "Automatique": "Automatic",
  "Clair": "Light",
  "Sombre": "Dark",
  "Thème : automatique": "Theme: automatic",
  "Thème : clair": "Theme: light",
  "Thème : sombre": "Theme: dark",
  "Déconnexion": "Sign out",
  "Démo orage": "Storm demo",
  "Administration": "Administration",
  "Retour": "Back",
  "Départ": "Start",
  "Arrivée": "Destination",
  "Route sans nom": "Unnamed road",
  "exposée": "exposed",
  "Calcul…": "Computing…",

  // --- levels
  "Risque faible": "Low risk",
  "Risque modéré": "Moderate risk",
  "Risque élevé": "High risk",
  "Risque très élevé": "Very high risk",
  "Faible": "Low",
  "Modéré": "Moderate",
  "Élevé": "High",
  "Très élevé": "Very high",
  "Route exposée en cas de forte pluie": "Road exposed in heavy rain",
  "point bas, cuvette": "low point, basin",
  "proche d'un oued": "near a wadi",
  "passage inférieur": "underpass",
  "zone très bâtie": "heavily built-up area",
  "drainage fragile": "weak drainage",
  "inondations passées": "past floods",

  // --- rain banner
  "Rejeu : pluie archivée": "Replay: archived rain",
  "Scénario simulé : {s}": "Simulated scenario: {s}",
  "orage": "storm",
  "averses": "showers",
  "temps sec": "dry weather",
  "Données pluie anciennes (panne simulée)": "Old rain data (simulated outage)",
  "Données pluie indisponibles": "Rain data unavailable",
  "Données pluie : {t}": "Rain data: {t}",
  "Alerte pluie non disponible": "Rain alert unavailable",
  "Seules les routes exposées sont affichées.": "Only exposed roads are shown.",
  "Alerte pluie dans la zone": "Rain alert in the zone",
  "Pas d'alerte pluie": "No rain alert",
  "{mm} mm en 24 h (seuil {s} mm) : évitez les routes en rouge et orange.": "{mm} mm in 24 h (threshold {s} mm): avoid the red and orange roads.",
  "{mm} mm en 24 h, sous le seuil de {s} mm.": "{mm} mm in 24 h, below the {s} mm threshold.",
  "{mm} mm sur un seuil de {s} mm": "{mm} mm against a {s} mm threshold",
  "seuil {s} mm": "threshold {s} mm",
  "12 h tombées + 12 h prévues · seuil provisoire": "12 h fallen + 12 h forecast · provisional threshold",
  "{mm} mm en 24 h · seuil {s} mm": "{mm} mm in 24 h · threshold {s} mm",
  "Pluie sur 24 h": "Rain over 24 h",

  // --- login
  "Zone pilote · Nabeul": "Pilot zone · Nabeul",
  "Sachez quelles routes s'inondent en premier, avant de partir.": "Know which roads flood first, before you leave.",
  "tronçons classés par un modèle entraîné sur 13 inondations méditerranéennes": "road segments ranked by a model trained on 13 Mediterranean floods",
  "Alerte quand la pluie sur 24 h dépasse": "Alert when 24 h rain exceeds",
  "Itinéraire plus sûr proposé automatiquement": "A safer route is proposed automatically",
  "Routes sûres,": "Safe roads,",
  "même sous la pluie.": "even in the rain.",
  "Bon retour 👋": "Welcome back 👋",
  "Créer un compte": "Create an account",
  "Les routes inondables de Nabeul, avant de partir.": "Nabeul's flood-prone roads, before you leave.",
  "E-mail": "E-mail",
  "nom@exemple.tn": "name@example.tn",
  "Mot de passe": "Password",
  "8 caractères au minimum": "At least 8 characters",
  "Se connecter": "Sign in",
  "Créer le compte": "Create account",
  "Pas de compte ? ": "No account? ",
  "Déjà un compte ? ": "Already have an account? ",
  "Indication de risque, pas une certitude. Ne remplace pas les alertes officielles (INM, Protection civile).":
    "A risk indication, not a certainty. It does not replace official alerts (INM, Civil Protection).",

  // --- user app
  "Plus sûr": "Safer",
  "Le plus rapide": "Fastest",
  "Plus rapide": "Faster",
  "Autres": "Others",
  "Par {via}": "Via {via}",
  "Autre itinéraire": "Other route",
  "FloodSafe · Alerte inondation": "FloodSafe · Flood alert",
  "Forte pluie prévue à Nabeul. Votre itinéraire a été recalculé.": "Heavy rain forecast in Nabeul. Your route has been recalculated.",
  "Forte pluie prévue à Nabeul. Les routes exposées passent en alerte.": "Heavy rain forecast in Nabeul. Exposed roads are now on alert.",
  "FloodSafe · Fin de l'alerte": "FloodSafe · Alert over",
  "La pluie prévue repasse sous le seuil. Restez prudent sur les routes encore mouillées.": "Forecast rain is back below the threshold. Stay careful on roads that are still wet.",
  "Point sur la carte": "Point on the map",
  "Ma position": "My location",
  "La géolocalisation n'est pas disponible.": "Geolocation is not available.",
  "Position refusée ou introuvable.": "Location denied or not found.",
  "Où allez-vous ?": "Where are you going?",
  "Mon compte": "My account",
  "Serveur injoignable": "Server unreachable",
  "Alerte pluie en cours": "Rain alert in progress",
  "Rejeu orage · {t}": "Storm replay · {t}",
  "Légende et calques": "Legend and layers",
  "Partir de ma position": "Start from my location",
  "Légende": "Legend",
  "Routes exposées en cas de forte pluie": "Roads exposed in heavy rain",
  "Itinéraire choisi": "Chosen route",
  "maintenant": "now",
  "Touchez la carte pour placer le départ": "Tap the map to set the start",
  "Touchez la carte pour placer l'arrivée": "Tap the map to set the destination",
  "Agrandir": "Expand",
  "Réduire": "Collapse",
  "Bonjour {name}": "Hello {name}",
  "routes en alerte": "roads on alert",
  "routes exposées": "exposed roads",
  "signalement": "report",
  "signalements": "reports",
  "Cherchez une destination ou touchez la carte. Indication de risque, pas une certitude : ne remplace pas les alertes officielles.":
    "Search for a destination or tap the map. A risk indication, not a certainty: it does not replace official alerts.",
  "Votre trajet": "Your trip",
  "Rechercher ou toucher la carte": "Search or tap the map",
  "Touchez la carte…": "Tap the map…",
  "Choisir sur la carte": "Pick on the map",
  "Effacer": "Clear",
  "Voir les itinéraires": "See routes",
  "Choisir un itinéraire": "Choose a route",
  "Aucun itinéraire plus sûr trouvé. Reportez le trajet si possible et n'entrez jamais dans une route inondée.":
    "No safer route found. Postpone the trip if you can, and never drive into a flooded road.",
  "Démarrer · arrivée {t}": "Start · arrive {t}",
  "Touchez un tronçon coloré pour voir pourquoi il est à risque.": "Tap a coloured segment to see why it is at risk.",
  "Arrivée {t} · {d}": "Arrive {t} · {d}",
  "Terminer": "End trip",
  "Itinéraire recalculé": "Route recalculated",
  "Évite {n} tronçon à risque élevé": "Avoids {n} high-risk segment",
  "Évite {n} tronçons à risque élevé": "Avoids {n} high-risk segments",
  "Reporter": "Postpone",
  "Continuer": "Continue",
  "{n} tronçon à risque élevé": "{n} high-risk segment",
  "{n} tronçons à risque élevé": "{n} high-risk segments",
  "{level} au plus": "{level} at most",
  "0 tronçon à risque": "0 segments at risk",
  "Pas d'alerte · {n} tronçon exposé": "No alert · {n} exposed segment",
  "Pas d'alerte · {n} tronçons exposés": "No alert · {n} exposed segments",
  "Pas d'alerte · 0 tronçon exposé": "No alert · 0 exposed segments",

  // --- segment detail
  "Détail du tronçon": "Segment details",
  "Passage prévu vers {t}": "Expected passage around {t}",
  "Exposée · {level}": "Exposed · {level}",
  "Pourquoi ce tronçon ?": "Why this segment?",
  "Aucun facteur dominant": "No dominant factor",
  "Confiance": "Confidence",
  "Élevée": "High",
  "Moyenne": "Medium",
  "Classement de la zone": "Rank in the zone",
  "Top 0,5 %": "Top 0.5%",
  "Top 2 %": "Top 2%",
  "Top 10 %": "Top 10%",
  "Hors top 10 %": "Outside top 10%",
  "Passage inférieur": "Underpass",
  "Gué": "Ford",
  "Traversée basse": "Low crossing",
  "Vous êtes sur place ?": "Are you on site?",
  "Inondée": "Flooded",
  "Pas d'eau": "No water",
  "Avaloir bouché": "Blocked drain",
  "Merci : « {label} » envoyé.": "Thank you: “{label}” sent.",

  // --- storm charts
  "Pluie heure par heure (mm/h)": "Rain hour by hour (mm/h)",
  "Pluie horaire sur la zone": "Hourly rain over the zone",
  "Cumul sur 24 h : 12 h tombées + 12 h prévues (mm)": "24 h total: 12 h fallen + 12 h forecast (mm)",
  "Cumul 24 heures face au seuil de 44 mm": "24-hour total against the 44 mm threshold",
  "Période d'alerte": "Alert period",
  "Touchez un graphique pour aller à une heure.": "Tap a chart to jump to an hour.",

  // --- admin
  "Vue d'ensemble": "Overview",
  "Carte de la zone": "Zone map",
  "Alertes": "Alerts",
  "Signalements": "Reports",
  "Modèle": "Model",
  "Application usager": "User app",
  "Réel": "Live",
  "Orage simulé": "Simulated storm",
  "Averses simulées": "Simulated showers",
  "Temps sec": "Dry weather",
  "Panne de données": "Data outage",
  "Route inondée": "Flooded road",
  "Alerte pluie active": "Rain alert active",
  "/ {s} mm en 24 h": "/ {s} mm in 24 h",
  "Rejeu de l'orage du 19 janv. 2026": "Replay of the 19 Jan 2026 storm",
  "Utilisateurs": "Users",
  "Itinéraires calculés": "Routes computed",
  "depuis le démarrage du serveur": "since the server started",
  "dont {n} « inondée »": "of which {n} “flooded”",
  "Orage en cours · rejeu": "Storm in progress · replay",
  "Orage de référence · 19 et 20 janv. 2026": "Reference storm · 19 and 20 Jan 2026",
  "Chargement de l'orage…": "Loading the storm…",
  "Heure": "Time",
  "Événement": "Event",
  "Aucun événement pour l'instant.": "No events yet.",
  "Rejeu · seuil franchi : {n} tronçons passent en alerte élevée": "Replay · threshold crossed: {n} segments go to high alert",
  "Seuil franchi : {mm} mm en 24 h (seuil {s} mm)": "Threshold crossed: {mm} mm in 24 h (threshold {s} mm)",
  "Signalement « {kind} »": "Report “{kind}”",
  ", tronçon {id}": ", segment {id}",
  "Routes en alerte · signalements": "Roads on alert · reports",
  "Routes exposées · signalements": "Exposed roads · reports",
  "alerte {level}": "alert: {level}",
  "exposition {level}": "exposure: {level}",
  "Alerte {level}": "Alert: {level}",
  "Exposition {level}": "Exposure: {level}",
  "Source de pluie": "Rain source",
  "Actuelle :": "Current:",
  "Les scénarios servent aux démonstrations : ils sont signalés comme simulés dans l'application. Revenez sur « Réel » après.":
    "Scenarios are for demonstrations: the app flags them as simulated. Switch back to “Live” afterwards.",
  "Dernière vérification de l'alerte : {t}": "Last alert check: {t}",
  "Historique des alertes": "Alert history",
  "Début": "Start",
  "Pluie 24 h (mm)": "24 h rain (mm)",
  "Seuil (mm)": "Threshold (mm)",
  "Notifiés": "Notified",
  "Aucune alerte depuis la mise en service.": "No alert since the service started.",
  "Signalements des usagers": "User reports",
  "Date": "Date",
  "Type": "Type",
  "Tronçon": "Segment",
  "Commentaire": "Comment",
  "Aucun signalement pour l'instant.": "No reports yet.",
  "Exposition des routes de la zone": "Exposure of the zone's roads",
  "Classement du modèle terrain, quel que soit le temps : {n} tronçons. Budgets : 10 % modéré ou plus, 2 % élevé ou plus, 0,5 % très élevé.":
    "Ranking by the terrain model, whatever the weather: {n} segments. Budgets: 10% moderate or above, 2% high or above, 0.5% very high.",
  "Tronçons par niveau d'exposition": "Segments by exposure level",
  "Seuil de pluie (44 mm en 24 h, provisoire)": "Rain threshold (44 mm in 24 h, provisional)",
  "Zones méditerranéennes où il a été ajusté :": "Mediterranean zones where it was fitted:",
  "inondations détectées": "floods detected",
  "Inondations tunisiennes, pluviomètres INM (non ajusté sur elles) :": "Tunisian floods, INM rain gauges (not fitted on them):",
  "détectées": "detected",
  "Déclenchements sans inondation cartographiée : environ {n} par zone et par an": "Triggers with no mapped flood: about {n} per zone per year",
  "Modèle : ce qui a été validé": "Model: what has been validated",
  "Précision en service :": "Accuracy in service:",
  "non mesurée": "not measured",
  ", il n'y a pas encore d'inondations confirmées dans la zone. Les chiffres ci-dessous viennent des tests hors ligne. ROC-AUC : 0,5 = hasard, 1 = classement parfait. « Élevé » = 2 % des routes de chaque zone.":
    ": there are no confirmed floods in the zone yet. The figures below come from offline tests. ROC-AUC: 0.5 = chance, 1 = perfect ranking. “High” = 2% of each zone's roads.",
  "Test du modèle terrain": "Terrain model test",
  "Référence": "Baseline",
  "Rappel (élevé)": "Recall (high)",
  "Précision (élevé)": "Precision (high)",
  "Statut": "Status",
  "Limites à garder en tête": "Limits to keep in mind",

  // --- admin: texts that come from the backend (models/final/terrain_validation.json)
  "13 inondations méditerranéennes, une laissée de côté à la fois": "13 Mediterranean floods, one left out at a time",
  "6 pays, un laissé de côté à la fois": "6 countries, one left out at a time",
  "Nabeul 2018, Tunisie exclue de l'entraînement": "Nabeul 2018, Tunisia excluded from training",
  "Enfidha, janvier 2026 (carte radar, jamais vue)": "Enfidha, January 2026 (radar map, never seen)",
  "Bizerte, janvier 2026 (même orage)": "Bizerte, January 2026 (same storm)",
  "solide": "solid",
  "indice multicritère V1": "V1 multi-criteria index",
  "règle : bas et proche d'un oued": "rule: low and near a wadi",
  "signal positif, non interprété : 29 routes inondées en 3 endroits, sous le minimum de 30 fixé à l'avance":
    "positive signal, not interpreted: 29 flooded roads in 3 places, below the minimum of 30 set in advance",
  "pas de résultat exploitable : la carte radar montrait surtout un marais, 7 routes inondées": "no usable result: the radar map mostly showed a marsh, 7 flooded roads",
  "échoue sur les crues urbaines torrentielles (Derna 2023, Mandra 2017) : l'eau suit les rues, pas les points bas":
    "fails on urban flash floods (Derna 2023, Mandra 2017): water follows the streets, not the low points",
  "les probabilités ne sont pas calibrées inondation par inondation : afficher des niveaux, jamais des probabilités":
    "probabilities are not calibrated flood by flood: show levels, never probabilities",
  "dit où l'eau s'accumule, pas quand : aucune prévision minutée": "says where water collects, not when: no timed forecast",
  "pas encore validé en Tunisie : il faut une liste des routes coupées (Protection civile, ministère de l'Équipement)":
    "not yet validated in Tunisia: a list of cut roads is needed (Civil Protection, Ministry of Equipment)",
  "seuil de 44 mm ajusté sur des données satellite (IMERG) : à revérifier avec les pluviomètres et la prévision en temps réel":
    "44 mm threshold fitted on satellite data (IMERG): to be rechecked with rain gauges and real-time forecasts",

  // --- demo page
  "Rejeu d'un orage réel": "Replay of a real storm",
  "Orage des 19 et 20 janvier 2026, Nabeul": "Storm of 19 and 20 January 2026, Nabeul",
  "Pluie réelle de l'archive des prévisions Open-Meteo (moyenne ECMWF, ICON et GFS), à environ 10 km de résolution. Le passé et la prévision viennent de la même archive.":
    "Real rain from the Open-Meteo forecast archive (mean of ECMWF, ICON and GFS), at about 10 km resolution. Past rain and forecast come from the same archive.",
  "Le seuil de 44 mm est provisoire. Rejeu à but de démonstration.": "The 44 mm threshold is provisional. Replay for demonstration purposes.",
  "Admin": "Admin",
  "Carte": "Map",
  "Nabeul est → Nabeul ouest": "East Nabeul → West Nabeul",
  "Lent": "Slow",
  "Normal": "Normal",
  "Rapide": "Fast",
  "Vitesse": "Speed",
  "Heure du rejeu": "Replay hour",
  "{v} mm/h en ce moment": "{v} mm/h right now",
  "Pause": "Pause",
  "Lancer l'orage": "Start the storm",
  "Reprendre": "Resume",
  "Recommencer": "Restart",
  "Tombés (12 h)": "Fallen (12 h)",
  "Prévus (12 h)": "Forecast (12 h)",
  "Le seuil vient d'être franchi.": "The threshold has just been crossed.",
  "Les routes que le modèle classe comme les plus exposées passent en alerte. Lancez un trajet pour voir l'itinéraire proposé.":
    "The roads the model ranks as most exposed go on alert. Launch a trip to see the proposed route.",
  "Un conducteur part maintenant": "A driver leaves now",
  "Lancer le trajet à {t}": "Launch the trip at {t}",
  "Alerte active : itinéraire plus sûr.": "Alert active: safer route.",
  "Le plus rapide passe par {n} tronçons à risque élevé ({d}) ; le trajet proposé en a {m}, pour {extra} de plus.":
    "The fastest route crosses {n} high-risk segments ({d}); the proposed route has {m}, for {extra} more.",
  "Alerte active.": "Alert active.",
  "Aucun itinéraire plus sûr : {n} tronçons à risque élevé sur le trajet. Reportez le départ si possible.":
    "No safer route: {n} high-risk segments on the way. Postpone your departure if you can.",
  "Pas d'alerte :": "No alert:",
  "itinéraire le plus rapide, {t}. Les routes exposées restent en tirets, sans alerte.": "fastest route, {t}. Exposed roads stay dashed, with no alert.",
  "Arrivé.": "Arrived.",
  "En route… {p} %": "On the way… {p}%",
  "Ce qui se passe": "What is happening",
  "{kind} : {n} tronçons à risque élevé": "{kind}: {n} high-risk segments",
  "Début du rejeu. Pluie prévue sur 24 h : {mm} mm, sous le seuil de {s} mm.": "Replay starts. Rain forecast over 24 h: {mm} mm, below the {s} mm threshold.",
  "La pluie commence sur Nabeul.": "Rain starts over Nabeul.",
  "Seuil franchi : {mm} mm en 24 h ({f} tombés + {p} prévus). Alerte zone : {h} tronçons à risque élevé ou très élevé, {m} modéré.":
    "Threshold crossed: {mm} mm in 24 h ({f} fallen + {p} forecast). Zone alert: {h} segments at high or very high risk, {m} moderate.",
  "Fin de l'alerte : le cumul repasse sous {s} mm.": "Alert over: the total is back below {s} mm.",
  "Pic de pluie : {v} mm/h.": "Rain peak: {v} mm/h.",
  "Pic de pluie : {v} mm/h, {lead} h après le déclenchement de l'alerte.": "Rain peak: {v} mm/h, {lead} h after the alert was triggered.",
};
