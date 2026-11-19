import { useEffect } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Polyline, Rectangle, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import type { Route, RouteSegment, ZoneMap } from "../api";
import { LEVEL_SHORT, LEVEL_WEIGHT, rank } from "../levels";
import { BaseTiles, usePalette } from "../theme";
import { useT } from "../i18n";

interface Props {
  zone: ZoneMap | null;
  showExposed: boolean;
  routes: Route[];
  selectedRouteId: string | null;
  origin: [number, number] | null;
  destination: [number, number] | null;
  focus: [number, number][] | null;
  onMapClick: (lat: number, lon: number) => void;
  onSelectRoute: (id: string) => void;
  onSelectSegment: (s: RouteSegment) => void;
  onSelectZoneRoad?: (segmentId: number, lat: number, lon: number) => void;
}

function Clicks({ onMapClick }: { onMapClick: Props["onMapClick"] }) {
  const map = useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
  // development only: lets the screenshot script click exact map points
  if (import.meta.env.DEV) (window as unknown as { __fsMap?: typeof map }).__fsMap = map;
  return null;
}

function FitTo({ points }: { points: [number, number][] | null }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length < 2) return;
    // keep the route clear of the side panel (large screens) or the bottom sheet (phones)
    const wide = window.innerWidth >= 900;
    map.fitBounds(points, {
      paddingTopLeft: wide ? [460, 60] : [30, 130],
      paddingBottomRight: wide ? [40, 40] : [30, Math.round(window.innerHeight * 0.45)],
      maxZoom: 16,
    });
  }, [map, points]);
  return null;
}

export default function RiskMap(p: Props) {
  const pal = usePalette();
  const t = useT();
  const z = p.zone?.zone;
  const bounds: LatLngBoundsExpression = z
    ? [
        [z.south, z.west],
        [z.north, z.east],
      ]
    : [
        [36.41, 10.67],
        [36.5, 10.79],
      ];
  const triggerOn = p.zone?.trigger.status === "on";
  const selected = p.routes.find((r) => r.id === p.selectedRouteId) ?? null;

  // Zone layer: alerts when the trigger is on; otherwise exposed roads, drawn quietly (never as alerts)
  const zoneRoads = (p.zone?.items ?? [])
    .filter((r) => (triggerOn ? rank(r.level) >= 1 : p.showExposed && rank(r.exposure) >= 2))
    .sort((a, b) => rank(a.level) - rank(b.level));

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={
        window.innerWidth >= 900
          ? { paddingTopLeft: [460, 20] }
          : { paddingTopLeft: [10, 120], paddingBottomRight: [10, Math.round(window.innerHeight * 0.42)] }
      }
      className="map"
      zoomControl={false}
      preferCanvas
    >
      <BaseTiles />
      <Clicks onMapClick={p.onMapClick} />
      <FitTo points={p.focus} />
      {z && <Rectangle bounds={bounds} pathOptions={{ color: pal.ink, weight: 1.5, dashArray: "6 6", fill: false }} />}

      {zoneRoads.map((r) => (
        <Polyline
          key={`z${r.segment_id}`}
          positions={r.coords}
          pathOptions={
            triggerOn
              ? { color: pal.level[r.level], weight: LEVEL_WEIGHT[r.level] - 2, opacity: selected ? 0.35 : 0.85 }
              : { color: pal.exposed, weight: 3, dashArray: "4 6", opacity: selected ? 0.3 : 0.75 }
          }
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e);
              p.onSelectZoneRoad?.(r.segment_id, e.latlng.lat, e.latlng.lng);
            },
          }}
        >
          <Tooltip sticky>
            {r.name ?? t("Route sans nom")} · {triggerOn ? t(LEVEL_SHORT[r.level]) : t("exposée")}
          </Tooltip>
        </Polyline>
      ))}

      {p.routes
        .filter((r) => r.id !== p.selectedRouteId)
        .map((r) => (
          <Polyline
            key={`r${r.id}`}
            positions={r.segments.flatMap((s) => s.coords)}
            pathOptions={{ color: pal.idle, weight: 6, opacity: 0.8 }}
            eventHandlers={{ click: (e) => (L.DomEvent.stopPropagation(e), p.onSelectRoute(r.id)) }}
          />
        ))}

      {selected && (
        <>
          <Polyline positions={selected.segments.flatMap((s) => s.coords)} pathOptions={{ color: pal.casing, weight: 11, opacity: 1 }} />
          {selected.segments.map((s) => (
            <Polyline
              key={`s${s.segment_id}`}
              positions={s.coords}
              pathOptions={{ color: s.level === "low" ? pal.ink : pal.level[s.level], weight: 7, opacity: 1 }}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  p.onSelectSegment(s);
                },
              }}
            >
              <Tooltip sticky>
                {s.name ?? t("Route sans nom")} · {t(LEVEL_SHORT[s.level])}
              </Tooltip>
            </Polyline>
          ))}
        </>
      )}

      {p.origin && (
        <CircleMarker center={p.origin} radius={9} pathOptions={{ color: pal.casing, weight: 3, fillColor: pal.safe, fillOpacity: 1 }}>
          <Tooltip>{t("Départ")}</Tooltip>
        </CircleMarker>
      )}
      {p.destination && (
        <CircleMarker center={p.destination} radius={9} pathOptions={{ color: pal.casing, weight: 3, fillColor: pal.ink, fillOpacity: 1 }}>
          <Tooltip>{t("Arrivée")}</Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
