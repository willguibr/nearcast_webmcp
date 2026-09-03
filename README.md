# Nearcast WebMCP

Nearcast turns fragmented official hazard information from Canada and the United States into one shared map that humans and AI agents can investigate together, with the agent working through explicit WebMCP tools instead of guessing its way through the interface.

Built for the [OpenAI WebMCP Challenge](https://webmcp.devpost.com/). Not affiliated with any government agency.

**Live:** https://hazards.securitygeek.io (CloudFront origin: https://dof7zqxufissn.cloudfront.net)

## What it does

- One interactive MapLibre map of current **wildfires**, **weather alerts** and **earthquakes** across Canada, the contiguous US and Alaska.
- Data comes only from official public sources (ECCC, NRCan CWFIS, Earthquakes Canada, NWS, NIFC, USGS), normalized by a small Lambda API into one hazard model with explicit source attribution and freshness.
- Every source fails independently; the app keeps working and shows which feeds are unavailable.
- Filters (country, hazard type, weather severity, earthquake magnitude), clustering, polygon rendering, hazard selection and a details panel with the issuing agency, timestamps and the official link.
- Eight WebMCP tools expose that exact application state to AI agents, and an **Agent Activity** panel shows every tool call as it happens.

## Why WebMCP

A hazard map has a lot of state that is hard for a generic browser agent to manipulate reliably: map bounds, zoom, a dozen filter combinations, hundreds of clustered markers, a selection, and heterogeneous records from six agencies. Screen-scraping and DOM clicking is brittle and slow. WebMCP lets the page publish its semantic operations ("what is in view", "focus on British Columbia and Washington", "compare BC with WA") as typed, described tools. The agent calls them; the application does the deterministic work.

## Human + Agent Experience

There is exactly one application state (`frontend/src/state/store.ts`). The UI renders it; the WebMCP tools read and mutate it. There is no separate "agent state".

```text
Human zooms to BC and clicks a wildfire
      ↓
Agent calls get_current_view → sees BC bounds + the selected fire
      ↓
Agent calls set_hazard_filters / set_focus_area / focus_hazard
      ↓
Map, filters and details panel change on screen
      ↓
Human refines by hand; the agent sees that too on its next call
```

## Supported Hazards

| Hazard | Canada | United States |
|---|---|---|
| Wildfires | NRCan CWFIS/CWFIF national active fires | NIFC WFIGS current incident locations |
| Weather alerts | ECCC / MSC GeoMet `weather-alerts` | NWS `alerts/active` |
| Earthquakes | Earthquakes Canada FDSN (7 days, M2.0+) | USGS M2.5+ past-week feed |

Evacuation alerts were out of scope for the MVP.

## Supported Countries

Canada (all provinces and territories) and the United States (all states + DC). Hawaii data is included where feeds report it, but the initial view is Canada + contiguous US + Alaska.

## Data Sources

See [docs/data-sources.md](docs/data-sources.md) for endpoints, field mappings, severity translation and licensing notes. Short version:

- **Environment and Climate Change Canada / MSC** — GeoMet OGC API, collection `weather-alerts`.
- **Natural Resources Canada — Canadian Wildland Fire Information System (CWFIF GeoServer)** — `public:cwfif_national_activefires`.
- **Natural Resources Canada — Earthquakes Canada** — FDSN event service.
- **U.S. National Weather Service** — `api.weather.gov/alerts/active`. Zone-based alerts without polygons are placed at U.S. Census county centroids and flagged `approximate`.
- **National Interagency Fire Center (WFIGS)** — current wildland fire incident locations (`IncidentTypeCategory = WF`).
- **U.S. Geological Survey** — `2.5_week.geojson` summary feed (US events; Canadian events come from Earthquakes Canada).

Earthquake "severity" is never invented from magnitude: magnitude is exposed as magnitude and a separate, clearly labelled *display significance* drives map styling.

## Architecture

```text
 Browser ── WebMCP ── AI agent (ChatGPT in-app browser / Chrome)
    │  same-origin /api/*
    ▼
 CloudFront (HTTPS, OAC, security headers, API cache 0–300 s)
    ├── /*      → private S3 bucket (Vite SPA)
    └── /api/*  → API Gateway HTTP API → Lambda (nearcast-api, Node 22)
                                            ├── ECCC   ├── NWS
                                            ├── CWFIS  ├── NIFC
                                            └── NRCan  └── USGS
```

Details in [docs/architecture.md](docs/architecture.md). No database, no auth, no AI API keys — WebMCP is the AI integration.

## WebMCP Tools

Registered with `document.modelContext.registerTool(...)` (falls back to `navigator.modelContext`). Full schemas in [docs/webmcp.md](docs/webmcp.md).

| Tool | Purpose |
|---|---|
| `get_current_view` | Map centre/bounds/zoom, active filters, selected hazard, counts in view, source freshness |
| `get_visible_hazards` | Concise list of hazards in the current view after all filters |
| `set_focus_area` | Move the map to regions (`["BC","WA"]`), explicit bounds, or a point + zoom |
| `set_hazard_filters` | Change countries, hazard types, minimum weather severity, minimum magnitude |
| `focus_hazard` | Select a hazard: highlight, pan/zoom, open details (same path as a human click) |
| `get_hazard_details` | Full normalized record with agency classifications and official link |
| `compare_regions` | Deterministic counts for two or more provinces/states |
| `create_situation_context` | Structured facts for the current view or regions; the agent writes the prose |

## Running Locally

```bash
npm install
npm test                 # backend + frontend unit tests
npm run dev:api          # Lambda handler on http://localhost:8787 (live government feeds)
npm run dev              # Vite on http://localhost:5173, proxies /api → :8787
```

Demo mode with synthetic, clearly labelled fixtures (no network needed): open `http://localhost:5173/?demo=true` or set `VITE_USE_MOCK_DATA=true`. Regenerate fixtures with `node examples/generate-mock-hazards.mjs`.

To point the local UI at a deployed API instead: `VITE_API_PROXY_TARGET=https://<distribution>.cloudfront.net npm run dev`.

## AWS Deployment

Prerequisites: AWS credentials, Terraform ≥ 1.6, Node ≥ 20, AWS CLI.

```bash
cp infra/terraform.tfvars.example infra/terraform.tfvars   # optional
scripts/deploy.sh                # tests → build → terraform apply → s3 sync → invalidation
```

Or step by step:

```bash
npm run build -w backend
cd infra && terraform init && terraform plan && terraform apply
cd .. && npm run build -w frontend
aws s3 sync frontend/dist s3://$(cd infra && terraform output -raw frontend_bucket_name) --delete
aws cloudfront create-invalidation --distribution-id $(cd infra && terraform output -raw cloudfront_distribution_id) --paths "/*"
```

Terraform outputs `application_url`, `api_health_url`, `cloudfront_domain_name`, `api_gateway_endpoint`, `frontend_bucket_name`. Terraform state is local for the hackathon and git-ignored.

## Custom Domain

Optional and never on the critical path. Register the domain or create the hosted zone manually, then:

```hcl
enable_custom_domain = true
domain_name          = "hazards.securitygeek.io"   # the production deployment uses this
hosted_zone_id       = "Z..."                        # Route 53 zone that is authoritative for the parent domain
```

Terraform creates the ACM certificate in `us-east-1` with DNS validation and A/AAAA alias records to CloudFront. The `*.cloudfront.net` URL keeps working either way.

## Testing WebMCP

1. Open the deployed URL in ChatGPT's in-app browser, or in Chrome 146+ (Canary/Dev/Beta) with `chrome://flags/#enable-webmcp-testing` enabled and graphics acceleration on. Safari and stable Chrome run the app but expose no WebMCP host.
2. The header shows **WebMCP ● Available · 8 tools** when registration succeeded.
3. Try: *"What am I looking at?"*, *"Focus on British Columbia and Washington and show only wildfires and important weather alerts."*, click a marker, *"Tell me about the hazard I just selected."*, *"Compare British Columbia and Washington."*
4. Watch the **Agent Activity** panel: every call is logged with time, tool name and a short summary.

Without WebMCP the app works normally and the indicator reads *Browser support not detected*. See [docs/webmcp.md](docs/webmcp.md) for a console harness that exercises the tools by hand.

## Safety / Disclaimer

Nearcast aggregates public information from official sources for situational awareness. Information may be delayed, incomplete, unavailable, or superseded. Nearcast is not an emergency notification service and does not replace official alerts or instructions from emergency authorities. The application and its tools never make "safe / all clear" statements or routing recommendations. Always follow instructions from local emergency authorities.

## License

MIT — see [LICENSE](LICENSE).
