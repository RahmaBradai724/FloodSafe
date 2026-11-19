"""Pilot-zone routing graph read from local files, for running the V2 API without PostGIS.

Same interface as NationalGraph (the planner and the endpoints cannot tell them apart), but the graph
and the segments come from data/processed/local_nabeul/, written by `python -m pipeline.build_local`.
Segments carry no algorithmic factors (f_* = 0): inside the pilot zone the terrain model scores them.
"""
from __future__ import annotations

import json
import logging
import math
import pickle
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

from ..engine.types import SegmentStatic
from .national_graph import NationalGraph, SegmentRecord

log = logging.getLogger(__name__)


def _record(d: dict) -> SegmentRecord:
    crossing = "underpass" if d["underpass"] else ("ford" if d["ford"] else None)
    return SegmentRecord(
        static=SegmentStatic(segment_id=d["segment_id"], f_crossing=1.0 if crossing else 0.0,
                             crossing_kind=crossing),
        edge_uid=d["edge_uid"], seq=d["seq"], length_m=d["length_m"], name=d["name"],
        road_type=d["road_type"], coords=list(d["coords"]), cell_id=d["cell_id"],
        mid=tuple(d["mid"]), susceptibility_floored=0.0)


class LocalGraph(NationalGraph):
    def __init__(self, directory: Path):
        with open(directory / "graph.pickle", "rb") as fh:
            self.graph = pickle.load(fh)
        with open(directory / "segments.pickle", "rb") as fh:
            raw = pickle.load(fh)
        self.meta = json.loads((directory / "meta.json").read_text(encoding="utf-8"))
        self._segment_cache = {uid: [_record(d) for d in recs] for uid, recs in raw.items()}
        self._by_id = {r.static.segment_id: r for recs in self._segment_cache.values() for r in recs}
        self._build_node_index()
        mids = np.array([r.mid for r in self._by_id.values()])
        self._seg_ids = np.array(list(self._by_id))
        self._seg_tree = cKDTree(np.column_stack([mids[:, 1] * self._kx, mids[:, 0] * self._ky]))
        log.info("local graph loaded: %d vertices, %d edges, %d segments",
                 self.graph.vcount(), self.graph.ecount(), len(self._by_id))

    def nearest_road(self, lat: float, lon: float) -> tuple[str | None, float] | None:
        d, i = self._seg_tree.query([lon * self._kx, lat * self._ky])
        if math.isinf(d):
            return None
        return self._by_id[int(self._seg_ids[i])].name, float(d)

    def segments_for_edge(self, u: int, v: int) -> list[SegmentRecord]:
        eid = self.graph.get_eid(u, v, error=False)
        if eid < 0:
            return []
        return self._segment_cache.get(self.graph.es[eid]["edge_uid"], [])

    def segments_in_bbox(self, west: float, south: float, east: float, north: float,
                         limit: int = 2000) -> list[SegmentRecord]:
        out = [r for r in self._by_id.values() if south <= r.mid[0] <= north and west <= r.mid[1] <= east]
        return out[:limit]

    def segment(self, segment_id: int) -> SegmentRecord | None:
        return self._by_id.get(segment_id)

    def all_segments(self) -> list[SegmentRecord]:
        return list(self._by_id.values())
