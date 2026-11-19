# FloodSafe: pilot web app (V2 model, Nabeul)

This folder holds the working pilot: the V2 API (`backend/app/main_v2.py`) and a mobile-friendly web app
(`frontend/`) for drivers and for the admin. The V2 API uses the terrain model and the 44 mm rain trigger from
the model repo (`backend/models/final/`, `backend/flood_risk/`). The rest of this README (from "Flood Route Risk —
Version 1" on) is the teammate's original V1 documentation; its Expo `mobile/` app was never delivered and is
replaced by `frontend/`.

## Run it

```bash
# 1. backend (Python 3.11+), once
cd backend
python -m venv .venv && .venv\Scripts\activate          # Linux/macOS: source .venv/bin/activate
pip install fastapi uvicorn pydantic pyyaml numpy pandas scipy shapely geopandas sqlalchemy httpx \
            python-igraph geoalchemy2 joblib scikit-learn==1.8.0 rasterio scikit-image requests
python -m pipeline.build_local          # Nabeul roads + zone terrain table (needs internet, a few minutes)

# 2. backend, each time
uvicorn app.main_v2:app --host 0.0.0.0 --port 8000                      # real rain (Open-Meteo)
WEATHER_MODE=scenario:storm uvicorn app.main_v2:app --port 8000         # demo: simulated storm

# 3. frontend
cd frontend && npm install && npm run dev        # http://localhost:5173 (proxies /api to port 8000)
```

First admin: create an account in the app, then `python -m app.accounts make-admin <email>` in `backend/`.

## What each side shows

| Page | For | Content |
|---|---|---|
| `/` | drivers | zone rain trigger (24 h rain against 44 mm); map of exposed roads; route search (place search or tap the map), up to 3 routes plus a safer one, each segment coloured by level; segment details with the model's main factors; reports (flooded, no water, drain blocked) |
| `/admin` | admins | trigger and rain source, switch between real rain and demo scenarios, users, routes served, reports, alert history, exposure of the zone's roads, map of exposed roads and reports, the model's validation and limits |
| `/demo` | admins, for presentations | replay of the real storm of 19–20 January 2026 over Nabeul, hour by hour: falling rain on the map, hourly rain and 24 h total against 44 mm, the roads switching to alerts when the threshold is crossed, an event log, and a trip whose route is planned with the trigger of that hour (a car drives it) |

While `/demo` is open, the replayed hour is shared with every user (`POST /demo/state`): the user app polls
`GET /demo/state` every 2 s, shows the rain and a "Démo : rejeu" badge on its map, raises an in-app flood alert
when the replay crosses the threshold, and re-plans the user's current trip. The zone map, routes, segments and
admin metrics all use the replayed trigger meanwhile. Sharing stops when the admin leaves `/demo`, or 10 minutes
after the last update. Open only one `/demo` page at a time.

The storm replay (`app/demo_api.py`) uses the Open-Meteo historical forecast archive (mean of ECMWF, ICON and GFS),
cached in `data/raw/weather/demo_nabeul_2026_01.json`, and computes the trigger exactly as the live system does.
On this storm the 24 h total crosses 44 mm on 19 January at 05:00 (Tunis time) and the hourly rain peaks
28 hours later. The archive stands for both the rain fallen and the forecast, so this is a replay of what the
system would have done, not a test of its lead time. Demo trip: east to west Nabeul; with the alert on, the
fastest route crosses 15 high-risk segments and the safer one none, for about 20 s more.

Rules from the model contract, built into the screens:
- a road is shown in alert colours **only when the zone trigger is on**; otherwise it is at most "exposed in heavy
  rain" (dashed indigo), never an alert;
- levels are always written in words next to the colour; no probability is shown;
- no timed forecast ("flooded in 20 minutes"); the disclaimer is always visible.

## Look and theme

The web app uses style D « Minimal » (chosen from `design/FloodSafe_interfaces_clair_sombre.pdf`): black and white, Manrope font, and only the risk levels, alerts and the route in colour.

- **Light and dark.** The round button in the top bar cycles through automatique (follows the phone or computer setting), clair and sombre. The choice is remembered in the browser.
- **Colours.** In dark mode the risk colours are lighter (`src/theme.tsx`), so they stay readable on the dark map. The level name is always written next to the colour.
- **Basemap.** The basemap is standard OpenStreetMap, shown grey by day and inverted grey by night with a CSS filter. It needs no API key; CARTO's dark tiles now require one.

## Languages

The web app is in French and English. The first visit follows the browser's language; the FR / EN switch (login page, profile menu, admin sidebar, demo page) changes it, and the choice is remembered in the browser.

- **How it works.** French is the source text. Components write `t("texte français")` and `src/i18n.tsx` holds the French → English dictionary. A text missing from the dictionary is shown in French.
- **Adding a text.** Wrap it in `t(...)` and add its English line to the `EN` table in `src/i18n.tsx`.
- **Not translated.** Road and place names (OpenStreetMap) and error messages sent by the backend.

## Changes to the teammate's backend

| File | Change |
|---|---|
| `app/routing/local_graph.py` (new) | `LocalGraph`: same interface as `NationalGraph`, read from files instead of PostGIS |
| `pipeline/build_local.py` (new) | builds the Nabeul graph (Overpass, cut at junctions, clipped to the zone box) and `data/zones/nabeul.csv` |
| `app/main_v2.py` | `FLOOD_GRAPH=local` (default) or `national`; `/segments/{id}` in local mode; new `GET /zone/map` (exposed roads as lines with their alert level); `/meta` names the pilot zone |
| `app/admin_api.py` | `GET /admin/feedback`, `POST /admin/weather-mode` (admin account instead of the static token), terrain validation in `/admin/metrics` |
| `app/db/models.py`, `app/db/config.py`, `app/accounts.py` | SQLite in local mode (`data/floodsafe.sqlite3`): only the tables without PostGIS geometry, JSON instead of JSONB |
| `app/weather/national_service.py` | `bbox`: in local mode, poll only the 9 weather cells around Nabeul instead of ~500 |
| `models/final/terrain_validation.json` (new) | the terrain model's published validation, shown on the admin page |
| `flood_risk/` | replaced by the current model code (the copy in the zip was older) |

`models/final/evaluation.json` is the teammate's older threshold sweep (counts per rain spell); the admin page
shows `trigger.json` and `terrain_validation.json` instead.

## Limits of the pilot

- One zone (Nabeul, 10.67–10.79 E, 36.41–36.50 N): routes outside it are refused.
- Rain: Open-Meteo forecast models at about 10 km, not INM gauges; the 44 mm threshold stays provisional.
- Alerts are shown in the app; phone push notifications (Expo, in `app/alerts.py`) need a native app.
- Not prepared for deployment: no HTTPS, development servers only.

---

# Flood Route Risk — Version 1 (pilot)

Route-level flood risk for drivers in one Tunisian pilot area (default: **Nabeul**).
Version 1 is **purely algorithmic**: a transparent weighted multi-criteria engine, no machine learning.
Built from the Requirements Specification v1.0 and the *Version 1 Implementation Guide* (21 Oct 2026).

```
flood-route-risk/
├── backend/            Python 3.11+: engine, routing, API, data pipeline, validation
│   ├── app/engine/     the risk engine (pure functions) + AHP weighting tool
│   ├── app/routing/    precomputed area loader + risk-aware route planner
│   ├── app/weather/    Open-Meteo grid cache, synthetic scenarios, replay files
│   ├── app/storage/    prediction log, feedback, events (SQLite default, PostGIS optional)
│   ├── app/main.py     FastAPI endpoints
│   ├── config/         engine.yaml (all weights & thresholds), AHP expert template
│   ├── pipeline/       OSM + Copernicus DEM + WorldCover → per-segment factors
│   ├── evaluation/     replay validation with baselines (guide Section 8)
│   ├── sql/            PostGIS schema
│   └── tests/          engine properties + API end-to-end
└── mobile/             Expo (SDK 58) React Native app, TypeScript
```

Not prepared for deployment on purpose: no production server config, no HTTPS, no store builds.

---

## 1. The engine (what "algorithmic" means here)

Everything lives in `backend/app/engine/core.py` and `backend/config/engine.yaml`:

```
Score   = 100 · H · S'                    0–100, never a water depth
S'      = s_min + (1 − s_min) · S         floor: any road can flood in an extreme storm
S       = Σ wᵢ fᵢ                          6 static factors, percentile-normalised to [0,1]
R_eff   = I_W + κ · A_6h                   max hourly rain in the ETA window + antecedent rain
DV      = Σ vⱼ proxyⱼ                      urban density, black spots, dry spell, drain density
T_eff   = T0 · (1 − β · DV)                clogged drains lower the threshold (FR-09)
H       = min(1, R_eff / T_eff)
```

- **Levels**: Low < 25 ≤ Moderate < 50 ≤ High < 75 ≤ Very high.
- **Confidence** starts at 1 and loses points for interpolated hourly rain, model disagreement, stale data, poorly mapped roads and unknown drain state. It gains points for confirmed past floods and consistent user reports.
- **Explanations**: every score carries coded reasons (rain vs threshold, top two terrain factors, the drainage reduction, confidence reasons). The app translates them.
- **No rain data at all** gives degraded mode: terrain susceptibility only, capped below High, with low confidence (FR-15).
- **Rain is the trigger, terrain the modulator**: no rain means a score of 0, whatever the terrain.

All numbers are placeholders for calibration. Change them in `engine.yaml` (Git history = FR-24 change log) and bump `version`.

**Expert weights (AHP):** each expert fills a copy of `config/ahp_expert_template.yaml`, then:
```bash
python -m app.engine.ahp experts/*.yaml --mc 2000   # weights, consistency ratio, Monte-Carlo stability
```

## 2. Run the backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt

# A) offline demo, no downloads (synthetic town, same file format as real data)
python -m pipeline.make_demo_area
FLOOD_AREA=demo WEATHER_MODE=scenario:storm uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# B) real Nabeul data (needs internet: OSM, AWS public buckets, Open-Meteo)
python -m pipeline.run --area nabeul                      # ~10–20 min the first time
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000  # live Open-Meteo by default
```

API docs: http://localhost:8000/docs · Tests: `pytest` (build the demo area first).

| Env var | Default | Meaning |
|---|---|---|
| `FLOOD_AREA` | `nabeul` | folder in `data/processed/` |
| `WEATHER_MODE` | `live` | `live`, `scenario:dry/showers/storm`, `replay:<file>`, `outage` |
| `DATABASE_URL` | SQLite in `data/` | e.g. `postgresql+psycopg://user:pw@localhost/flood` |
| `ADMIN_TOKEN` | `dev-admin` | needed to switch weather modes from the app |

**Endpoints:** `POST /routes` (up to 3 routes + safer alternative or fallback), `GET /hotspots`, `GET /segments/{id}`, `POST /feedback`, `GET /geocode`, `GET /meta`, `POST /admin/weather`.

### Pipeline steps (`python -m pipeline.run --area nabeul [--from STEP | --only STEP]`)
1. **osm**: drivable graph (OSMnx) with speeds and travel times, waterways, storm drains.
2. **rasters**: Copernicus GLO-30 DEM and ESA WorldCover 2021, read as windows from the public AWS buckets.
3. **terrain**: reprojects to UTM 32N. Computes depth in sink (before filling), flow accumulation, streams, slope, TWI, HAND and distance to drainage.
4. **features**: cuts roads into segments of 200 m or less, samples rasters in buffers, then derives impervious share, underpass/ford/low-crossing flags, past-flood proximity and normalisation.

Look at `data/interim/<area>/*.tif` and `data/processed/<area>/segments_qa.gpkg` in **QGIS** before trusting them.

### Events, authority data, validation
```bash
# historical floods / black spots (FR-23); --test-set keeps them OUT of f6/DV (no circularity)
python -m pipeline.import_events --area nabeul events.csv
python -m pipeline.import_events --area nabeul emsr319.geojson --source "Copernicus EMS EMSR319" \
       --date 2018-09-22T18:00:00Z --reliability high --test-set
# authority drainage data (FR-10): data/raw/<area>/drainage/inlets.geojson and
# maintenance.geojson (with a last_cleaned date), then:
python -m pipeline.run --area nabeul --only features

# the rain that was available at the time, then replay validation with baselines
python -m pipeline.fetch_event_rain --area nabeul --start 2024-01-10 --end 2024-01-12            # forecast archive
python -m pipeline.fetch_event_rain --area nabeul --start 2018-09-21 --end 2018-09-23 --source era5
python -m evaluation.replay_eval --area nabeul --rain openmeteo_forecast_2024-01-10.json
```
The report gives recall at High (with 95% CI), false-alarm share, median lead time and a precision-recall table. It covers the full model and both baselines (static-only, rain-only). Report forecast-archive and ERA5 events **separately**.

## 3. Run the mobile app (Expo)

```bash
cd mobile
npm install
npx expo start            # scan the QR code with Expo Go (Android / iOS)
```
- The app finds the API automatically on the same machine as Metro (`http://<your-LAN-IP>:8000`). Start uvicorn with `--host 0.0.0.0`. To override, use `EXPO_PUBLIC_API_URL=http://192.168.1.20:8000 npx expo start` or the app's Settings.
- Maps: Google Maps on Android, Apple Maps on iOS, both through `react-native-maps` (works in Expo Go). A standalone Android build will need a Google Maps API key. That is part of deployment, so it is not set up here.
- **Using it:** search a destination or long-press the map. Pick a departure time. Routes appear coloured by risk, each with an icon and a label as well as colour (NFR-09). Then:
  - An alert card offers the **safer route** (+time, +distance), or says no safer route exists.
  - Tap any route segment for its reasons and the age of the data, and to send feedback (flooded / not flooded / drain blocked).
  - **GO** starts trip mode. It re-checks every 5 minutes and whenever you leave the route.
- **Demo (guide 2.3):** Settings → *Demo weather* → `storm`, then `outage` to "unplug" the source (confidence drops, the app says why), then `dry`.
- Languages: Français / English / العربية. Arabic switches to right-to-left after the restart prompt.
- Trip traces are never sent or stored (NFR-07). The server logs only segment scores.

## 4. Known limits (be honest about them in the report)
- Rain is hourly model data at about 10 km. 15-minute values are interpolated, and small storm cells can be missed.
- A 30 m surface DEM cannot see kerbs or inlets. Terrain factors flag broad low zones and wadi corridors only.
- Drain condition is not observable. DV is a proxy until authority data arrive.
- Few labelled events exist: treat validation numbers as indicative, never as proven performance.
- The free Open-Meteo tier is **non-commercial**. See `LICENCES.md`.
