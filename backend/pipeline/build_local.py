"""Pilot data for the API without PostGIS: the Nabeul road graph, its segments and the zone terrain table.

    python -m pipeline.build_local

Writes
  data/processed/local_nabeul/graph.pickle    igraph.Graph; vertices: lat, lon; edges: travel_time [s],
                                              length [m], edge_uid, name, highway
  data/processed/local_nabeul/segments.pickle {edge_uid: [segment dicts]}, <= 150 m pieces of each edge,
                                              coordinates (lat, lon) in the OSM direction of the way
  data/processed/local_nabeul/meta.json       box, counts, sources
  data/zones/nabeul.csv                       terrain table of the zone, scored by the V2 terrain model

Roads come from Overpass (flood_risk.real.osm.fetch, `out body geom`, which keeps the OSM node ids).
Ways are cut at every node shared by two ways, so each graph edge runs from one junction to the next.
Edges whose middle lies outside the zone box are dropped: outside it the terrain model does not score
roads. Only the largest connected part of the network is kept, so every snapped point can reach every other.
The zone table is built by flood_risk.real.build_zone, from the same Overpass cache.
"""
from __future__ import annotations

import json
import math
import pickle
from collections import Counter
from pathlib import Path

import igraph as ig
from pyproj import Transformer
from shapely.geometry import LineString
from shapely.ops import substring

from flood_risk.real import osm
from flood_risk.real.build_zone import NABEUL_BOX, build as build_zone_table

from app.weather.national_service import build_national_grid

DATA = Path(__file__).resolve().parents[1] / "data"
OUT = DATA / "processed" / "local_nabeul"
CACHE = DATA / "raw" / "zones"
SEGMENT_M = 150.0

# km/h when the way has no usable maxspeed tag
SPEED_KMH = {"motorway": 90, "trunk": 80, "primary": 60, "secondary": 50, "tertiary": 40,
             "unclassified": 30, "residential": 25, "living_street": 10}
LINK_KMH = 40


def speed_kmh(tags: dict) -> float:
    raw = str(tags.get("maxspeed", "")).split()[0] if tags.get("maxspeed") else ""
    if raw.isdigit() and 5 <= int(raw) <= 130:
        return float(raw)
    hw = tags.get("highway", "")
    return float(LINK_KMH if hw.endswith("_link") else SPEED_KMH.get(hw, 30))


def directions(tags: dict) -> tuple[bool, bool]:
    """(forward, backward) along the OSM order of the way's nodes."""
    ow = str(tags.get("oneway", "")).lower()
    if ow == "-1":
        return False, True
    if ow in ("yes", "true", "1") or tags.get("junction") in ("roundabout", "circular") \
            or tags.get("highway") == "motorway":
        return True, False
    return True, True


def build_graph(roads: dict) -> tuple[ig.Graph, dict]:
    ways = [el for el in roads["elements"]
            if el["type"] == "way" and len(el.get("nodes", [])) > 1
            and len(el.get("geometry", [])) == len(el.get("nodes", []))]
    use = Counter(n for w in ways for n in w["nodes"])
    for w in ways:                       # way ends are always cut points
        use[w["nodes"][0]] += 2
        use[w["nodes"][-1]] += 2

    to_utm = Transformer.from_crs(4326, NABEUL_BOX["crs"], always_xy=True)
    to_ll = Transformer.from_crs(NABEUL_BOX["crs"], 4326, always_xy=True)
    cells = build_national_grid()

    def inside(p: dict) -> bool:
        """Overpass returns whole ways: keep only the pieces inside the zone the terrain model scores."""
        return NABEUL_BOX["south"] <= p["lat"] <= NABEUL_BOX["north"] \
            and NABEUL_BOX["west"] <= p["lon"] <= NABEUL_BOX["east"]

    def cell_of(lat: float, lon: float) -> str:
        return min(cells, key=lambda c: (c.lat - lat) ** 2 + (c.lon - lon) ** 2).cell_id

    vid: dict[int, int] = {}
    v_lat, v_lon = [], []
    edges, attrs = [], {"travel_time": [], "length": [], "edge_uid": [], "name": [], "highway": []}
    segments: dict[str, list[dict]] = {}
    next_seg = 1

    def vertex(node: int, lat: float, lon: float) -> int:
        if node not in vid:
            vid[node] = len(v_lat)
            v_lat.append(lat)
            v_lon.append(lon)
        return vid[node]

    for w in ways:
        tags = w.get("tags", {})
        fwd, bwd = directions(tags)
        kmh = speed_kmh(tags)
        name = tags.get("name:fr") or tags.get("name") or tags.get("ref")
        cuts = [i for i, n in enumerate(w["nodes"]) if use[n] >= 2]
        for k, (a, b) in enumerate(zip(cuts, cuts[1:])):
            pts = w["geometry"][a:b + 1]
            line = LineString([to_utm.transform(p["lon"], p["lat"]) for p in pts])
            if line.length < 1 or not inside(pts[len(pts) // 2]):
                continue
            uid = f"{w['id']}_{k}"
            u = vertex(w["nodes"][a], pts[0]["lat"], pts[0]["lon"])
            v = vertex(w["nodes"][b], pts[-1]["lat"], pts[-1]["lon"])
            tt = line.length / (kmh / 3.6)
            for src, dst, on in ((u, v, fwd), (v, u, bwd)):
                if on:
                    edges.append((src, dst))
                    attrs["travel_time"].append(tt)
                    attrs["length"].append(line.length)
                    attrs["edge_uid"].append(uid)
                    attrs["name"].append(name)
                    attrs["highway"].append(tags.get("highway"))
            n = max(1, math.ceil(line.length / SEGMENT_M))
            step = line.length / n
            recs = []
            for i in range(n):
                piece = substring(line, i * step, (i + 1) * step)
                coords = [(lat, lon) for lon, lat in (to_ll.transform(x, y) for x, y in piece.coords)]
                mid_lon, mid_lat = to_ll.transform(*piece.interpolate(0.5, normalized=True).coords[0])
                recs.append({"segment_id": next_seg, "edge_uid": uid, "seq": i, "length_m": piece.length,
                             "name": name, "road_type": tags.get("highway"), "coords": coords,
                             "mid": (mid_lat, mid_lon), "cell_id": cell_of(mid_lat, mid_lon),
                             "underpass": osm._is_underpass(tags), "ford": int(tags.get("ford") == "yes")})
                next_seg += 1
            segments[uid] = recs

    g = ig.Graph(n=len(v_lat), edges=edges, directed=True)
    g.vs["lat"], g.vs["lon"] = v_lat, v_lon
    for key, values in attrs.items():
        g.es[key] = values

    # keep the largest strongly connected part: every vertex in it can reach every other one
    giant = g.connected_components(mode="strong").giant()
    keep = set(giant.es["edge_uid"])
    segments = {uid: recs for uid, recs in segments.items() if uid in keep}
    return giant, segments


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    roads, _, _ = osm.fetch(NABEUL_BOX, CACHE)

    graph, segments = build_graph(roads)
    with open(OUT / "graph.pickle", "wb") as fh:
        pickle.dump(graph, fh)
    with open(OUT / "segments.pickle", "wb") as fh:
        pickle.dump(segments, fh)
    n_seg = sum(len(v) for v in segments.values())
    meta = {"name": "Nabeul (pilot)", "box": {k: NABEUL_BOX[k] for k in ("south", "north", "west", "east")},
            "vertices": graph.vcount(), "edges": graph.ecount(), "segments": n_seg,
            "sources": ["© OpenStreetMap contributors (ODbL), Overpass API"]}
    (OUT / "meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    print(f"graph: {graph.vcount()} vertices, {graph.ecount()} edges, {n_seg} segments -> {OUT}")

    zone_csv = DATA / "zones" / "nabeul.csv"
    zone_csv.parent.mkdir(parents=True, exist_ok=True)
    table = build_zone_table(NABEUL_BOX, CACHE)
    table.to_csv(zone_csv, index=False)
    print(f"zone table: {len(table)} segments -> {zone_csv}")


if __name__ == "__main__":
    main()
