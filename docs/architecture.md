# Architecture

## Principle

The application is authoritative for application state. Government sources → source adapters → one normalized hazard model → Nearcast API → browser state ↔ WebMCP ↔ agent ↔ human. The LLM never scrapes, counts, computes bounds or parses source formats.

## AWS

```text
Route 53 (optional) ──► CloudFront distribution
                          ├─ default (/*)  → S3 bucket, private, OAC, Managed-CachingOptimized
                          └─ /api/*        → API Gateway HTTP API (regional) → Lambda nearcast-api
```

| Component | Choice | Notes |
|---|---|---|
| Region | `ca-central-1` for Lambda/API/S3; CloudFront global; ACM in `us-east-1` | Project originated in Canada |
| Frontend | Vite SPA in a private S3 bucket | No website hosting, no public ACLs, SSE-S3, bucket policy limited to the distribution ARN |
| API | One Lambda (`index.handler`, Node 22, arm64, 512 MB, 15 s) behind HTTP API routes `GET /api/health`, `/api/hazards`, `/api/hazards/summary`, `/api/hazards/{id}` | IAM role can only write its own log group |
| Caching | Lambda sets `Cache-Control: public, max-age=60, s-maxage=120`; CloudFront `/api/*` cache policy min 0 / default 60 / max 300 with query-string whitelist `type,country,region,minSeverity,minMagnitude,bbox,limit`; a 45 s in-memory snapshot cache inside the warm Lambda | Browser → CloudFront → (miss) API → Lambda → sources |
| Security headers | HSTS, nosniff, Referrer-Policy, CSP via a CloudFront response headers policy | No `X-Frame-Options`/`frame-ancestors` so agent browsers can embed the page |
| Logs | CloudWatch Logs, JSON lines, 14-day retention | requestId, route, duration, per-source status/duration/count |
| State | Local Terraform state (git-ignored) | Deliberate for the hackathon; switch to S3 backend if the project continues |

External hosts used by the browser: `https://tiles.openfreemap.org` (basemap style, vector tiles, glyphs, sprites). The CSP allows it in `img-src`/`connect-src`; MapLibre's worker needs `worker-src blob:`.

## Backend layout

```text
backend/src
  handlers/api.ts          Lambda entry: routing, validation → 400, JSON + cache headers, structured logs
  adapters/canada/*.ts     ECCC weather, CWFIF wildfires, NRCan earthquakes
  adapters/us/*.ts         NWS weather (+county centroid fallback), NIFC wildfires, USGS earthquakes
  domain/                  adapter contract, severity translation, place → region classification
  services/                source runner (allSettled + per-source timeout), snapshot cache, filters, summary
  utils/                   fetch with AbortController timeout + User-Agent, logging, time
  tests/                   vitest: adapter parsing on real fixtures, failures, filters, handler
```

Each adapter runs concurrently with its own timeout (5–8 s). Failures become `meta.sources[].status = error|timeout`; the API never returns 500 because a feed is down.

## Frontend layout

```text
frontend/src
  state/store.ts    single shared state (hazards, filters, view, camera request, selection, activity)
  map/HazardMap.tsx MapLibre: three clustered point sources (one per type), weather polygons, selection layer
  webmcp/tools.ts   eight tool specs (schema + pure run()) → bound to the store, MCP-style results
  webmcp/register.ts detect document/navigator.modelContext, register with AbortSignal cleanup
  components/       header, filters, sources, list, details, agent activity, legend, disclaimer
```

The UI loads `/api/hazards?limit=2000` once and every 3 minutes (plus manual refresh), then filters client-side so human and agent interactions are instant and share one dataset.

## Decisions and defaults chosen without asking

- Canadian earthquakes come from Earthquakes Canada; USGS only contributes US events (classified by the place string, then coordinates). This avoids cross-catalog duplicates.
- `minimumSeverity` applies to weather alerts only: wildfire agencies and USGS do not issue a comparable severity. Canadian stage-of-control (OC/BH/UC) is translated to severe/moderate/minor for wildfires so it still shows in the UI, but is not filtered by severity.
- NWS alerts without polygons (the majority) are placed at the mean U.S. Census centroid of their `SAME` county codes and flagged `locationPrecision: "approximate"`; marine-only alerts without county codes are dropped.
- Polygon coordinates are rounded to 3 decimals (~100 m) to keep the payload ~1.6 MB raw / ~300 KB compressed.
- Hazard ordering is deterministic: display significance, then `updatedAt`, then id.
- No React Router, so no CloudFront custom error responses (which would also have masked API 404s).
