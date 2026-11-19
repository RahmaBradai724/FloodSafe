"""FastAPI application - V2 API: terrain model + rain trigger, igraph routing.

Run:  uvicorn app.main_v2:app --reload --host 0.0.0.0 --port 8000
Docs: http://localhost:8000/docs

Two graph modes (env FLOOD_GRAPH):
  - local (default): the Nabeul pilot zone from files, SQLite, no PostGIS.
    Needs `python -m pipeline.build_local` once (data/processed/local_nabeul/ and data/zones/nabeul.csv).
  - national: PostGIS running (docker compose up -d), the national pipeline
    (python -m pipeline.national) and data/processed/national/graph.pickle.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import accounts, admin_api, alerts, demo_api
from .api.schemas import FeedbackRequest, RouteRequest, WeatherModeRequest
from .db.config import get_db_url, ensure_tables
from .engine import default_config
from .engine.config import LEVEL_RANK
from .routing.local_graph import LocalGraph
from .routing.national_graph import NationalGraph
from .routing.planner_v2 import PlannerV2, PlanningError, RiskScorer
from .weather.national_service import NationalWeatherService
from .weather.scenarios import SCENARIOS

log = logging.getLogger("flood")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


class State:
    cfg = None
    graph: NationalGraph | None = None
    weather: NationalWeatherService | None = None
    planner: PlannerV2 | None = None
    hotspot_cache: tuple[float, str, list] | None = None
    geocode_cache: dict[str, list] = {}
    admin_token: str = os.environ.get("ADMIN_TOKEN", "dev-admin-2024")
    nominatim_url: str = "https://nominatim.openstreetmap.org/search"
    user_agent: str = "FloodRouteRisk/2.0 (dev)"
    routes_served: int = 0
    monitor_task = None


S = State()

TUNISIA_BBOX = [7.5, 30.2, 11.6, 37.5]
DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parents[1] / "data"))
GRAPH_MODE = os.environ.get("FLOOD_GRAPH", "local")
GRAPH_PATH = DATA_DIR / "processed" / "national" / "graph.pickle"
LOCAL_DIR = DATA_DIR / "processed" / "local_nabeul"


MODEL_DIR = Path(__file__).resolve().parents[1] / "models" / "final"


def load_zone(cells):
    """Pilot-zone terrain model and rain trigger. Returns None when the files are missing."""
    zone_csv = DATA_DIR / "zones" / "nabeul.csv"
    model = MODEL_DIR / "v2_terrain.joblib"
    trigger = MODEL_DIR / "trigger.json"
    if not (zone_csv.is_file() and model.is_file() and trigger.is_file()):
        log.warning("zone model not loaded: need %s, %s and %s", zone_csv, model, trigger)
        return None
    from .routing.zone_model import ZoneModel
    return ZoneModel(zone_csv, model, trigger, cells)


@asynccontextmanager
async def lifespan(app: FastAPI):
    S.cfg = default_config()
    ensure_tables()

    db_url = get_db_url()
    if GRAPH_MODE == "local":
        if not (LOCAL_DIR / "graph.pickle").is_file():
            raise RuntimeError(f"No pilot graph at {LOCAL_DIR}. Build it first:\n  python -m pipeline.build_local")
        S.graph = LocalGraph(LOCAL_DIR)
    else:
        if not GRAPH_PATH.is_file():
            raise RuntimeError(
                f"No national graph at {GRAPH_PATH}. Run the national pipeline first:\n"
                f"  python -m pipeline.national")
        S.graph = NationalGraph(GRAPH_PATH, db_url)

    wcfg = S.cfg.section("weather")
    weather_mode = os.environ.get("WEATHER_MODE", "live")
    raw_weather_dir = DATA_DIR / "raw" / "weather"
    raw_weather_dir.mkdir(parents=True, exist_ok=True)

    S.weather = NationalWeatherService(
        wcfg, raw_weather_dir,
        rain_day_mm=float(S.cfg.section("drainage")["dry_spell"]["rain_day_mm"]),
        mode=weather_mode,
        bbox=S.graph.bbox if GRAPH_MODE == "local" else None)
    S.planner = PlannerV2(S.graph, S.weather, S.cfg, zone=load_zone(S.weather.cells))
    S.weather.start()

    accounts.init_accounts(db_url)
    monitor = alerts.AlertMonitor(lambda: S.planner.zone, lambda: S.weather)
    admin_api.init(S, monitor)
    demo_api.init(S, DATA_DIR)
    S.monitor_task = asyncio.create_task(monitor.run())

    log.info("V2 national API ready: %d vertices, %d edges, %d weather cells, mode %s",
             S.graph.graph.vcount(), S.graph.graph.ecount(),
             len(S.weather.cells), S.weather.mode)
    yield
    if S.monitor_task:
        S.monitor_task.cancel()
    await S.weather.stop()


app = FastAPI(title="Flood Route Risk - V2 National API", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(accounts.router)
app.include_router(admin_api.router)
app.include_router(demo_api.router)


def _require_admin(token: str | None) -> None:
    if token != S.admin_token:
        raise HTTPException(status_code=403, detail="admin token required")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": "2.0",
        "graph_vertices": S.graph.graph.vcount(),
        "graph_edges": S.graph.graph.ecount(),
        "weather": S.weather.status(),
    }


@app.get("/meta")
def meta():
    """Everything the client needs at start-up."""
    return {
        "area": {
            "name": S.graph.meta["name"] if GRAPH_MODE == "local" else "Tunisia",
            "bbox": S.graph.bbox,
            "centre": list(S.graph.centre),
            "synthetic": False,
        },
        "engine_version": S.cfg.version,
        "levels": S.cfg.level_cuts,
        "default_alert_level": S.cfg.section("alerts")["default_level"],
        "reevaluate_minutes": 5,
        "weather": S.weather.status(),
        "weather_modes": ["live", "outage"] + [f"scenario:{k}" for k in SCENARIOS]
                         + [f"replay:{f}" for f in S.weather.available_replays()],
        "scenarios": {k: v.description for k, v in SCENARIOS.items()},
        "attributions": [
            "© OpenStreetMap contributors (ODbL)",
            "Copernicus DEM GLO-30 © DLR/Airbus (adapted)",
            "© ESA WorldCover 2021 (CC BY 4.0)",
        ] + ([S.weather.status()["attribution"]] if S.weather.status().get("attribution") else []),
        "disclaimer": S.cfg.raw["disclaimer"],
    }


@app.post("/routes")
def routes(req: RouteRequest, user: accounts.CurrentUser = Depends(accounts.current_user)):
    t0 = time.perf_counter()
    try:
        result, log_rows = S.planner.plan(
            (req.origin.lat, req.origin.lon),
            (req.destination.lat, req.destination.lon),
            req.departure_time, req.alert_level,
            feedback=None)
    except PlanningError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    S.routes_served += 1
    result["weather"] = S.weather.status()
    result["compute_ms"] = round((time.perf_counter() - t0) * 1000)
    return result


@app.get("/segments/{segment_id}")
def segment(segment_id: int, eta: datetime | None = None):
    """Get risk details for a single segment."""
    if GRAPH_MODE == "local":
        rec = S.graph.segment(segment_id)
        if rec is None:
            raise HTTPException(404, "unknown segment")
        now = datetime.now(timezone.utc)
        at = (eta or now).astimezone(timezone.utc)
        scorer, trig = S.planner.make_scorer(now)
        risk = scorer.score(rec, at, 0.0)
        return risk.to_dict() | {
            "eta": at.isoformat(), "name": rec.name, "road_type": rec.road_type,
            "crossing": rec.static.crossing_kind, "cell_id": rec.cell_id,
            "coords": [[round(a, 6), round(b, 6)] for a, b in rec.coords],
            "trigger": trig, "weather": S.weather.status(),
        }
    from .db.config import get_session_factory
    from .db.models import Segment
    factory = get_session_factory()
    session = factory()
    try:
        row = session.query(Segment).filter(Segment.segment_id == segment_id).first()
        if row is None:
            raise HTTPException(404, "unknown segment")

        from .engine.types import SegmentStatic
        static = SegmentStatic(
            segment_id=row.segment_id,
            f_depression=row.f_depression,
            f_drainage_position=row.f_drainage_position,
            f_low_slope=row.f_low_slope,
            f_impervious=row.f_impervious,
            f_crossing=row.f_crossing,
            f_past_flood=row.f_past_flood,
            dv_urban=row.dv_urban,
            dv_blackspot=row.dv_blackspot,
            dv_drain_density_inv=row.dv_drain_density_inv,
            dv_maintenance=row.dv_maintenance,
            poorly_mapped=bool(row.poorly_mapped),
            past_flood_confirmed=bool(row.past_flood_confirmed),
            crossing_kind=row.crossing_kind,
        )
        from ..app.engine import evaluate_segment, EvalContext
        now = datetime.now(timezone.utc)
        at = (eta or now).astimezone(timezone.utc)
        rain = S.weather.window(row.cell_id or "", at - timedelta(minutes=30), at + timedelta(minutes=30),
                                now, int(S.cfg.section("rainfall")["antecedent_hours"]))
        ctx = EvalContext(refresh_interval_minutes=float(S.cfg.section("weather")["refresh_interval_minutes"]))
        from .engine import evaluate_segment as eval_seg
        risk = eval_seg(static, rain, ctx, S.cfg)
        return risk.to_dict() | {
            "eta": at.isoformat(),
            "name": row.name, "road_type": row.road_type,
            "cell_id": row.cell_id,
            "susceptibility_floored": row.susceptibility_floored,
            "weather": S.weather.status(),
        }
    finally:
        session.close()


@app.get("/alerts/status")
def alert_status(user=Depends(accounts.current_user)):
    """Zone rain trigger right now. The app calls this at sign-in to decide whether to alert."""
    _, trig = S.planner.make_scorer(datetime.now(timezone.utc))
    return {"trigger": trig}


@app.get("/hotspots")
def hotspots(
    min_level: str = Query("moderate", pattern="^(moderate|high|very_high)$"),
    limit: int = Query(400, le=2000),
    # Optional bounding box for viewport-based queries
    west: float | None = None, south: float | None = None,
    east: float | None = None, north: float | None = None,
):
    """Segments at or above a level right now — the dots on the map."""
    now = datetime.now(timezone.utc)
    key = f"{S.weather.mode}|{S.weather.status().get('retrieved_at')}|{min_level}|{west}|{south}|{east}|{north}"
    if S.hotspot_cache and S.hotspot_cache[1] == key and time.time() - S.hotspot_cache[0] < 300:
        return {"items": S.hotspot_cache[2][:limit], "cached": True}

    # Use viewport bbox if provided, otherwise scan all
    if all(v is not None for v in [west, south, east, north]):
        recs = S.graph.segments_in_bbox(west, south, east, north, limit=limit * 5)
    else:
        # Full scan is expensive at national scale — encourage viewport queries
        recs = S.graph.segments_in_bbox(*S.graph.bbox, limit=limit * 5)

    scorer, _ = S.planner.make_scorer(now)
    items = []
    for rec in recs:
        r = scorer.score(rec, now, 0.0)
        if LEVEL_RANK[r.level] >= LEVEL_RANK[min_level]:
            items.append({
                "segment_id": rec.static.segment_id,
                "lat": rec.mid[0], "lon": rec.mid[1],
                "score": round(r.score, 1), "level": r.level,
                "confidence_label": r.confidence_label,
            })
    items.sort(key=lambda x: -x["score"])
    S.hotspot_cache = (time.time(), key, items)
    return {"items": items[:limit], "cached": False}


SUSCEPTIBILITY_LEVELS = ["low", "moderate", "high", "very_high"]


@app.get("/zone/map")
def zone_map(min_exposure: str = Query("moderate", pattern="^(moderate|high|very_high)$")):
    """Pilot-zone roads at or above an exposure level, as lines, with their alert level right now.

    `exposure` is the terrain ranking whatever the weather (top 10 / 2 / 0.5 % of the zone);
    `level` is the alert, which stays "low" while the zone rain trigger is off.
    """
    if GRAPH_MODE != "local":
        raise HTTPException(501, "the zone map is served in the local pilot mode only")
    now = datetime.now(timezone.utc)
    scorer, trig = S.planner.make_scorer(now)
    if trig is None:
        raise HTTPException(503, "zone model not loaded")
    floor = SUSCEPTIBILITY_LEVELS.index(min_exposure)
    items = []
    for rec in S.graph.all_segments():
        r = scorer.score(rec, now, 0.0)
        if r.mode != "terrain_model":
            continue
        exposure = round(r.susceptibility * 3)
        if exposure >= floor:
            items.append({
                "segment_id": rec.static.segment_id, "name": rec.name,
                "exposure": SUSCEPTIBILITY_LEVELS[exposure], "level": r.level,
                "coords": [[round(a, 5), round(b, 5)] for a, b in rec.coords],
            })
    w, s, e, n = S.graph.bbox
    return {"trigger": trig, "zone": {"south": s, "west": w, "north": n, "east": e},
            "items": items, "weather": S.weather.status()}


@app.post("/feedback")
def feedback(req: FeedbackRequest):
    from .db.config import get_session_factory
    from .db.models import Feedback
    factory = get_session_factory()
    session = factory()
    try:
        fb = Feedback(
            segment_id=req.segment_id,
            kind=req.kind,
            comment=req.comment,
            lat=round(req.lat, 4),
            lon=round(req.lon, 4),
        )
        session.add(fb)
        session.commit()
        return {"id": fb.id, "segment_id": fb.segment_id}
    finally:
        session.close()


@app.get("/feedback/recent")
def feedback_recent(hours: int = Query(24, ge=1, le=168)):
    """How many reports were sent in the last hours (a count only: no position, no author)."""
    from datetime import datetime, timedelta
    from sqlalchemy import func as sa_func, select as sa_select
    from .db.config import get_session_factory
    from .db.models import Feedback
    since = datetime.utcnow() - timedelta(hours=hours)
    with get_session_factory()() as db:
        n = db.execute(sa_select(sa_func.count(Feedback.id)).where(Feedback.created_at >= since)).scalar_one()
    return {"hours": hours, "count": int(n)}


@app.get("/geocode")
def geocode(q: str = Query(min_length=2, max_length=120)):
    """Search a place inside Tunisia (Nominatim, bounded, cached)."""
    key = q.strip().lower()
    if key in S.geocode_cache:
        return {"items": S.geocode_cache[key]}
    w, s, e, n = TUNISIA_BBOX    # search the whole country; routing checks coverage separately
    try:
        r = httpx.get(S.nominatim_url, timeout=8,
                      headers={"User-Agent": S.user_agent},
                      params={"q": q, "format": "jsonv2", "limit": 6, "bounded": 1,
                              "viewbox": f"{w},{n},{e},{s}", "accept-language": "fr,ar,en"})
        r.raise_for_status()
        items = [{"name": it.get("name") or it["display_name"].split(",")[0],
                  "address": it["display_name"],
                  "lat": float(it["lat"]), "lon": float(it["lon"])}
                 for it in r.json()]
    except Exception as exc:
        raise HTTPException(503, f"geocoding unavailable: {exc}") from exc
    S.geocode_cache[key] = items
    return {"items": items}


# --- admin ----------------------------------------------------------------
@app.get("/admin/weather")
def weather_status():
    return S.weather.status() | {"modes": ["live", "outage"] + [f"scenario:{k}" for k in SCENARIOS]}


@app.post("/admin/weather")
def set_weather(req: WeatherModeRequest, x_admin_token: str | None = Header(default=None)):
    _require_admin(x_admin_token)
    try:
        S.weather.set_mode(req.mode)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    S.hotspot_cache = None
    if S.weather.mode == "live" and S.weather.store is None:
        S.weather.refresh()
    return S.weather.status()
