# Data sources and normalization

All sources are official public government services. No commercial hazard APIs, scraping, or social feeds. Every hazard carries `source.{id, agency, country, url}`, `updatedAt` and, where the feed provides one, a source freshness timestamp in `meta.sources[].sourceUpdatedAt`.

| id | Agency | Endpoint | Refresh / notes |
|---|---|---|---|
| `eccc` | Environment and Climate Change Canada / MSC | `https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=1000` | Alerts with `status_en = ended` or past `expiration_datetime` are dropped. Tier → severity: warning→severe, watch→moderate, advisory→minor, statement→info (`rawSeverity` keeps the tier and `risk_colour_en`). Polygons rounded to 3 decimals. |
| `cwfis` | Natural Resources Canada — CWFIS / CWFIF | `https://geoserver.cwfif.nrcan.gc.ca/geoserver/wfs` layer `public:cwfif_national_activefires`, `cql_filter=record_end > now AND stage_of_control_status <> 'OUT'` | The layer is temporal; current rows have `record_end` in the future. Uses the feed's WGS84 `latitude`/`longitude` (geometry is EPSG:3978). OC/BH/UC → Out of control / Being held / Under control (severity severe/moderate/minor). `percent_contained = -1` → unknown. Parks Canada (`PC`) fires are located by coordinates. |
| `nrcan` | Natural Resources Canada — Earthquakes Canada | `https://www.earthquakescanada.nrcan.gc.ca/fdsnws/event/1/query?format=text` (7 days, M2.0+, Canada bbox) | Pipe-delimited text. English location only. Events whose place resolves to a US state (e.g. `…, AK`) are left to USGS. Mining events are kept and labelled. |
| `nws` | U.S. National Weather Service | `https://api.weather.gov/alerts/active?status=actual&message_type=alert,update` (GeoJSON, custom `User-Agent`) | CAP severity used as-is (Extreme/Severe/Moderate/Minor/Unknown). Alerts without polygons are placed at the mean U.S. Census 2023 Gazetteer centroid of their `SAME` county codes (`locationPrecision: approximate`); alerts with no county codes (marine zones) are dropped. `Test Message` and expired alerts dropped. |
| `nifc` | National Interagency Fire Center — WFIGS | ArcGIS FeatureServer `WFIGS_Incident_Locations_Current/FeatureServer/0`, `IncidentTypeCategory='WF' AND FireOutDateTime IS NULL`, 2000 most recently modified | Acres → hectares (0.404686). No agency severity: `severity = unknown`, `rawSeverity = FireBehaviorGeneral`; display significance from size. |
| `usgs` | U.S. Geological Survey | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson` | Country/region from `place` (", Alaska", ", CA", ", Canada"), then coordinates; Mexico and non-CA/US events dropped; Canadian events dropped in favour of Earthquakes Canada. `severity = unknown`; `rawSeverity` = PAGER alert when present. |

## Severity model

`severity` ∈ info, minor, moderate, severe, extreme, unknown is Nearcast's translation of an agency classification, always accompanied by `rawSeverity`. `significance` ∈ low, moderate, high is a *display* bucket computed by Nearcast (magnitude ≥ 5 → high, ≥ 4 → moderate; wildfires by hectares and control status; weather mirrors severity). It is labelled as such in the UI and tool output and is never presented as an official rating. Significant earthquake counts use M4.0+.

## Identifiers

`<source>:<source-event-id>` — e.g. `usgs:uu80153696`, `nws:urn:oid:2.49…`, `eccc:<feature id>`, `cwfis:2026_BC_2026-K62162`, `nrcan:20260902.0437001`, `nifc:2026-ORVAD-260201`. Never derived from array positions.

## Licensing and attribution

- ECCC, NRCan/CWFIS and Earthquakes Canada data are published under the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada).
- NWS, USGS and NIFC data are U.S. federal government works in the public domain; NWS asks for a descriptive `User-Agent` and responsible polling — Nearcast identifies itself and relies on CloudFront + in-Lambda caching so upstream calls happen at most about once a minute.
- U.S. Census Bureau Gazetteer county centroids are public domain.
- Basemap: [OpenFreeMap](https://openfreemap.org) (© OpenMapTiles, © OpenStreetMap contributors, ODbL). Attribution is displayed on the map and in the footer.
- Text attribution only; no agency logos are used.
