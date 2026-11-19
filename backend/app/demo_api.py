"""Storm replay for demonstrations: a real past storm over the pilot zone, hour by hour.

GET  /demo/storm   the storm timeline: hourly rain of each weather cell and, at each hour, the zone rain
                   trigger computed exactly as live (ZoneModel.trigger: 12 h fallen + 12 h ahead, ensemble
                   mean of the weather models, wettest zone cell)
POST /demo/routes  route planning with the trigger of one hour of the replay instead of the live one
POST /demo/state   admin: share the replay hour with every user (index) or stop it (null)
GET  /demo/state   the shared replay hour, polled by the user app

While a replay is shared, every user request (zone map, routes, segments, admin metrics) uses the trigger of
the replayed hour instead of the live rain. It stops when the admin leaves the demo page, or by itself
REPLAY_TIMEOUT_S after the last update.

The rain is the Open-Meteo historical forecast archive (what the ECMWF, ICON and GFS forecasts gave at the
time), cached in data/raw/weather/. It stands for both the rain already fallen and the forecast: in
operation the fallen part would come from gauges or radar. Nothing here changes the live system.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from . import accounts
from .api.schemas import LatLon
from .routing.planner_v2 import PlanningError

router = APIRouter()
_ctx: dict = {"S": None, "data_dir": None}

ARCHIVE_URL = "https://historical-forecast-api.open-meteo.com/v1/forecast"
EVENT = {
    "id": "nabeul_2026_01",
    "label": "Orage des 19 et 20 janvier 2026, Nabeul",
    "fetch_start": "2026-01-17", "fetch_end": "2026-01-22",
    "first": "2026-01-18T18:00:00+00:00", "last": "2026-01-21T06:00:00+00:00",
    "note": ("Pluie réelle de l'archive des prévisions Open-Meteo (moyenne ECMWF, ICON et GFS), "
             "à environ 10 km de résolution. Le passé et la prévision viennent de la même archive."),
}


REPLAY_TIMEOUT_S = 600
_state: dict = {"index": None, "updated": 0.0, "was_on": False}


def init(state, data_dir: Path) -> None:
    _ctx["S"] = state
    _ctx["data_dir"] = data_dir
    if state.planner is not None:
        state.planner.trigger_override = current_trigger


def _trigger(zone, rain_24h_mm: float, at: str | None = None) -> dict:
    return {"threshold_mm": zone.threshold_mm, "window": "12 h observed + 12 h forecast",
            "validation": zone.trigger_cfg.get("status", "provisional"),
            "status": "on" if rain_24h_mm >= zone.threshold_mm else "off",
            "max_rain_24h_mm": round(rain_24h_mm, 1), "replay": EVENT["id"], "replay_time": at}


def _shared_hour() -> tuple[int, dict] | None:
    if _state["index"] is None or "storm" not in _cache:
        return None
    if time.time() - _state["updated"] > REPLAY_TIMEOUT_S:
        _state["index"] = None
        return None
    return _state["index"], _cache["storm"]["hours"][_state["index"]]


def current_trigger() -> dict | None:
    """The trigger of the shared replay hour, or None when no replay runs (the planner then reads live rain)."""
    shared = _shared_hour()
    S = _ctx["S"]
    if shared is None or S is None or S.planner.zone is None:
        return None
    return _trigger(S.planner.zone, shared[1]["rain_24h_mm"], shared[1]["t"])


def _fetch(cells, models: list[str], cache: Path) -> dict:
    if cache.is_file():
        return json.loads(cache.read_text(encoding="utf-8"))
    params = {"latitude": ",".join(str(c.lat) for c in cells), "longitude": ",".join(str(c.lon) for c in cells),
              "hourly": "precipitation", "models": ",".join(models), "timezone": "GMT", "timeformat": "unixtime",
              "start_date": EVENT["fetch_start"], "end_date": EVENT["fetch_end"]}
    r = httpx.get(ARCHIVE_URL, params=params, timeout=60)
    r.raise_for_status()
    payload = r.json()
    payload = payload if isinstance(payload, list) else [payload]
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(payload), encoding="utf-8")
    return payload


def _timeline() -> dict:
    S = _ctx["S"]
    zone = S.planner.zone if S and S.planner else None
    if zone is None:
        raise HTTPException(503, "zone model not loaded")
    cells = S.weather.cells
    models = list(S.cfg.section("weather")["models"])
    cache = _ctx["data_dir"] / "raw" / "weather" / f"demo_{EVENT['id']}.json"
    try:
        payload = _fetch(cells, models, cache)
    except httpx.HTTPError as exc:
        raise HTTPException(503, f"storm archive unavailable: {exc}") from exc

    # hour-ending unix times, and per cell the ensemble mean in mm per hour (same as ZoneModel.trigger)
    times = np.array(payload[0]["hourly"]["time"], dtype=np.int64) + 3600
    ens = {}
    for cell, loc in zip(cells, payload):
        series = [np.array(loc["hourly"][f"precipitation_{m}"], dtype=float) for m in models
                  if f"precipitation_{m}" in loc["hourly"]]
        ens[cell.cell_id] = np.nan_to_num(np.nanmean(np.vstack(series), axis=0))

    first = int(datetime.fromisoformat(EVENT["first"]).timestamp())
    last = int(datetime.fromisoformat(EVENT["last"]).timestamp())
    hours = []
    for t in range(first, last + 1, 3600):
        window = (times > t - 12 * 3600) & (times <= t + 12 * 3600)
        fallen = (times > t - 12 * 3600) & (times <= t)
        best, best_fallen = 0.0, 0.0
        for cid in zone.cells:
            total = float(ens[cid][window].sum())
            if total > best:
                best, best_fallen = total, float(ens[cid][fallen].sum())
        now_idx = int(np.searchsorted(times, t))
        hours.append({
            "t": datetime.fromtimestamp(t, timezone.utc).isoformat(),
            "rain_24h_mm": round(best, 1),
            "fallen_12h_mm": round(best_fallen, 1),
            "forecast_12h_mm": round(best - best_fallen, 1),
            "trigger": best >= zone.threshold_mm,
            "zone_mm_h": round(max(float(ens[c][now_idx]) for c in zone.cells) if now_idx < len(times) else 0.0, 2),
            "cells_mm_h": {c.cell_id: round(float(ens[c.cell_id][now_idx]), 2) if now_idx < len(times) else 0.0
                           for c in cells},
        })
    return {"event": {k: EVENT[k] for k in ("id", "label", "note")},
            "threshold_mm": zone.threshold_mm, "zone_cells": zone.cells,
            "cells": [{"id": c.cell_id, "lat": c.lat, "lon": c.lon} for c in cells],
            "hours": hours}


_cache: dict = {}


@router.get("/demo/storm")
def storm(user: accounts.CurrentUser = Depends(accounts.current_user)):
    if "storm" not in _cache:
        _cache["storm"] = _timeline()
    return _cache["storm"]


class DemoRouteRequest(BaseModel):
    origin: LatLon
    destination: LatLon
    rain_24h_mm: float
    at: datetime


@router.post("/demo/routes")
def demo_routes(req: DemoRouteRequest, user: accounts.CurrentUser = Depends(accounts.current_user)):
    S = _ctx["S"]
    zone = S.planner.zone if S and S.planner else None
    if zone is None:
        raise HTTPException(503, "zone model not loaded")
    trigger = _trigger(zone, req.rain_24h_mm, req.at.isoformat())
    t0 = time.perf_counter()
    try:
        result, _ = S.planner.plan((req.origin.lat, req.origin.lon), (req.destination.lat, req.destination.lon),
                                   req.at, "high", feedback=None, trigger=trigger)
    except PlanningError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    result["compute_ms"] = round((time.perf_counter() - t0) * 1000)
    result["weather"] = {"mode": f"replay:{EVENT['id']}", "simulated": True, "available": True,
                         "last_error": None, "source": "open-meteo historical forecast"}
    return result


class DemoStateRequest(BaseModel):
    index: int | None


def _state_view() -> dict:
    shared = _shared_hour()
    if shared is None:
        return {"active": False}
    index, hour = shared
    return {"active": True, "index": index, "hour": hour, "event": {k: EVENT[k] for k in ("id", "label")},
            "threshold_mm": _cache["storm"]["threshold_mm"]}


@router.post("/demo/state")
def set_state(req: DemoStateRequest, user: accounts.CurrentUser = Depends(accounts.require_admin)):
    """Share one hour of the replay with every user, or stop sharing (index null)."""
    S = _ctx["S"]
    if req.index is None:
        _state.update(index=None, was_on=False)
    else:
        if "storm" not in _cache:
            _cache["storm"] = _timeline()
        hours = _cache["storm"]["hours"]
        if not 0 <= req.index < len(hours):
            raise HTTPException(422, f"index must be between 0 and {len(hours) - 1}")
        hour = hours[req.index]
        _state.update(index=req.index, updated=time.time())
        # the replay crossing the threshold is logged like a live alert (no push: none is sent in a demo)
        if hour["trigger"] and not _state["was_on"]:
            with accounts._sf()() as db:
                db.add(accounts.AlertEvent(max_rain_24h_mm=hour["rain_24h_mm"],
                                           threshold_mm=_cache["storm"]["threshold_mm"], pushes_sent=0))
                db.commit()
        _state["was_on"] = hour["trigger"]
    if S is not None:
        S.hotspot_cache = None
    return _state_view()


@router.get("/demo/state")
def get_state(user: accounts.CurrentUser = Depends(accounts.current_user)):
    return _state_view()
