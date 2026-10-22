# Place awareness

Branch: `feature/nearcast-place-awareness`. This extends the existing web app using the iPhone app as a feature reference. It has not been deployed to the existing public site.

## Included

- Up to 20 named places, selected by coordinates, map point, map centre or a user-requested browser location lookup. Edit, remove, switch, and choose a 1–250 km watch radius.
- Personal dashboard and comparison table using all loaded hazard categories, regardless of exploratory map filters. Distance is measured to published geometry, including polygon holes and road segments.
- Canadian AQHI observations; published BC evacuation notices; DriveBC road events and camera images; up to 30 locally pinned cameras.
- Attributed text briefs with copy and native share-sheet support where the browser provides it. Clipboard failures expose selectable text. Nearcast never sends the brief automatically.
- Twelve additional WebMCP tools and saved-place support in `create_situation_context`. Humans and agents use the same store and matching functions.

Preferences use versioned browser storage (`nearcast.places.v1`). There is no server-side place database or cross-device sync. Places are available to connected WebMCP agents. Nearby-feed matching happens in the browser. Explicit BC address searches send search text through Nearcast to the BC Address Geocoder. Explicit forecast/gauge requests send coordinates rounded to three decimals through Nearcast to MET Norway/ECCC. Saved place names are not sent with those requests. Basemap tiles and camera images are loaded from their public providers. Location access is requested only after clicking **Use my location**.

## Data and limitations

`GET /api/awareness` is additive. Existing `/api/hazards` and its normalized hazard contract are unchanged. The API Gateway route is included in Terraform for a future deployment.

| Feed | Public source | Cache | Interpretation |
|---|---|---|---|
| ECCC AQHI | [GeoMet real-time AQHI](https://api.weather.gc.ca/collections/aqhi-observations-realtime?f=html), `items?latest=true` | 3 minutes | Station observation, not an address-level measurement or forecast; values above 10 display as 10+. |
| BC evacuation notices | [Emergency Management BC ArcGIS layer](https://services6.arcgis.com/ubm4tcTYICKBpist/arcgis/rest/services/Evacuation_Orders_and_Alerts/FeatureServer/0) | 3 minutes | Published polygons. Rescinded notices are omitted; unknown stages remain unknown. Older than 30 days or undated is explicitly labelled. Confirm instructions with the issuing authority via EmergencyInfoBC. |
| DriveBC roads | [Open511 API](https://api.open511.gov.bc.ca/help) | 3 minutes | Active published events, road states and schedules; nearby is not equivalent to on-route. |
| DriveBC cameras | [Public camera catalogue](https://www.drivebc.ca/api/webcams/) | 15 minutes | Visible/on cameras only. Actual image modification time is separate from catalogue retrieval. Stale/delayed flags are retained. |

Pagination is bounded and incomplete snapshots are rejected. Malformed records produce a partial-feed warning; entirely unparseable responses fail. Providers have independent 20-second deadlines. A failed provider can retain a labelled snapshot for at most 30 minutes. A successful empty response replaces its previous snapshot, preventing ended records from reappearing after a later failure.

AQHI readings older than three hours and camera observations older than 30 minutes, or observations without a timestamp, carry the same warning in cards, details, tool results and copied briefs. These are application freshness thresholds, not guarantees of official validity. An old evacuation record is not evidence of a currently effective order. Empty results do not establish safe conditions.

Briefs summarize the loaded snapshot: at most 10 core hazards and five records from each added category, with explicit omission counts. Agent responses expose at most 10 per category and full counts. The existing core-hazard request is capped at 2,000 records; a personal brief is not an exhaustive search of every upstream database. No safe destination ranking, evacuation directions, background monitoring, or notification delivery is implemented.

## Expanded release

- BC address/place search with result precision; map/coordinate selection remains available elsewhere.
- JSON export and validated import (100 KB, 20 places, 30 pins). Import previews the count and requires an explicit replacement action; invalid files never change state.
- BC fire prohibitions and wildfire area restrictions, BCWS incident status/size/cause/response and matching published perimeters, and BC River Forecast Centre basin advisories. Their independent caches refresh every ten minutes. Unknown advisory codes are rejected; effective dates do not substitute for update timestamps.
- On-demand 72-hour MET Norway forecast: temperature, wind converted from m/s to km/h, and precipitation with its original 1- or 6-hour accumulation period. Source update/retrieval times and CC BY 4.0 attribution remain visible. Upstream Expires and Last-Modified headers drive caching and revalidation.
- On-demand ECCC river gauges within the place radius, capped at 120 km. Latest measurements and changes across the actual available observation window are shown separately. Missing values remain missing; station heights are not comparable flood thresholds. Up to 10,000 observations over 30 hours are queried; truncation is explicit.
- Twelve-item household preparation checklist, persisted separately under `nearcast.preparation.v1`, with PreparedBC and FireSmart links. Progress is not a readiness certification.
- Twenty WebMCP tools in total, including BC search, forecasts, gauges and checklist read/update actions. On-demand results enter the same store used by the human dashboard; edits and demo/live modes use separate location keys.

New API routes: `/api/places/search?q=...`, `/api/forecast?lat=...&lon=...`, and `/api/gauges?lat=...&lon=...&radiusKm=...`. Responses to these personal queries use `no-store` at the HTTP layer; bounded provider caches are internal. No query text or coordinates are included in application request logs.

Open511 returned HTTP 403 during live verification on October 22. The road loader now falls back to the [official DriveBC website event API](https://github.com/bcgov/DriveBC.ca/blob/main/src/backend/apps/event/serializers.py), with an explicit partial-source notice. `closed=false` becomes “NOT SPECIFIED (check event)”, never “OPEN”. Published schedules remain intact.

Sources: [BC Address Geocoder](https://www2.gov.bc.ca/gov/content/data/geographic-data-services/location-services/geocoder), [MET Norway API](https://docs.api.met.no/doc/GettingStarted), [ECCC hydrometric collection](https://api.weather.gc.ca/collections/hydrometric-realtime?f=json), [PreparedBC](https://www2.gov.bc.ca/gov/content/safety/emergency-management/preparedbc), [FireSmart BC](https://firesmartbc.ca/). Exact BC feed endpoints are in `backend/src/adapters/canada/extended-awareness.ts`.

The NWS repair proof does not validate these new feeds. New repair scenarios must retain their own original failure, semantic evidence and exact repair-pipeline results.

## Run and test

From the app root, with dependencies installed:

```sh
npm test
npm run typecheck
npm run build
npm run dev:api
# In another terminal:
npm run dev
```

If the backend watcher hits a local file-watch limit, run `node --experimental-strip-types backend/src/dev-server.ts` instead. Restart that process after backend edits.

Open `http://localhost:5173/?demo=true&webmcp=emulate` for deterministic synthetic records. An available native WebMCP host takes precedence over the emulator. Open `http://localhost:5173/` for live feeds. Preferences are per browser origin, so `localhost` and `127.0.0.1` have separate saved places.

### Manual acceptance checks

1. In demo mode, add the demo cabin. Verify one AQHI station, evacuation area, road event and illustrated camera. Each is explicitly demo data.
2. Add a second test place at Vancouver (49.28, -123.12), radius 25 km. Compare counts and inspect coverage. Edit its radius, switch places, reload, and verify persistence.
3. Pin the demo camera, reload, then unpin. Remove a test place and confirm only that place disappears.
4. Open each item, inspect timestamps/source links and map selection. Toggle added map layers; the brief should retain its records.
5. Preview and copy a brief. Confirm source links, demo label, data notices, watch radius and omission counts where applicable. Test native share manually without sending unintended messages.
6. In live mode, verify the eight independent source statuses. Older evacuation notices and stale camera images must remain labelled. Test outside BC to confirm coverage is explicit.
7. Ask a WebMCP agent to list saved places, focus one, get its context, compare two, and focus a returned road or camera id. Confirm the UI and Agent Activity change with those actions.
8. Test map selection, one-shot location permission (allow and deny), clipboard permission failures, a narrow screen, and temporary API unavailability in your target browsers.

Automated tests cover malformed feeds, unknown/rescinded notice status, independent failures, stale expiry, successful empty refreshes, geometry matching, persistence, UI CRUD/pinning/brief preview, unavailable comparison cells, tool parity, and registration cancellation. They do not replace the target-browser and on-device checks above.
