# Devpost submission draft — Nearcast WebMCP

**Tagline:** A shared hazard map where humans and AI agents investigate real-world wildfires, weather alerts and earthquakes together, through WebMCP tools instead of DOM guessing.

## Inspiration

Nearcast started as a Canadian iPhone app that pulls official hazard data. Hazard maps are exactly the kind of interface that generic browser agents struggle with: hundreds of clustered markers, a dozen filter combinations, geographic bounds, a selection, and six agencies' worth of heterogeneous records. WebMCP lets the page say what it can do instead of making the agent infer it.

## What it does

Nearcast WebMCP shows current wildfires, weather alerts and earthquakes across Canada and the United States on one MapLibre map, normalized from six official sources (ECCC, NRCan CWFIS, Earthquakes Canada, NWS, NIFC, USGS) with explicit attribution and freshness. It exposes eight WebMCP tools — `get_current_view`, `get_visible_hazards`, `set_focus_area`, `set_hazard_filters`, `focus_hazard`, `get_hazard_details`, `compare_regions`, `create_situation_context` — that read and mutate the *same* application state the human is looking at. An **Agent Activity** panel shows every tool call.

## Why this is a strong WebMCP use case

Map-based hazard applications contain large amounts of visual state, filters, selections, geographic bounds, and heterogeneous information. Traditional browser agents must infer these interactions from the DOM. WebMCP gives the agent explicit access to the application's semantic operations while keeping the human and agent inside the same visible workspace.

## Better UX

Instead of manually selecting countries, filtering hazard types, scanning hundreds of markers, and correlating multiple government sources, the human can describe an intent naturally — *"focus on BC and Washington and show only wildfires and important weather alerts"* — while still seeing and controlling the resulting map.

## What humans and agents do together

- **Human:** visually explores, selects incidents, validates context, controls decisions.
- **Agent:** manipulates filters, compares regions, retrieves structured incident details, surfaces relevant information, writes the narrative.
- **Application:** provides authoritative normalized data, performs deterministic geographic calculations and counts, maintains visual state, never makes safety claims.

## How we built it

React + TypeScript + Vite + MapLibre GL (OpenFreeMap basemap, no tokens). One TypeScript Lambda behind API Gateway HTTP API with six independent source adapters (`Promise.allSettled`, per-source timeouts), normalized hazard model, severity translation kept alongside raw agency classifications. CloudFront serves the SPA from a private S3 bucket (OAC) and routes `/api/*` to API Gateway so everything is same-origin; Terraform provisions all of it. Tools are registered with `document.modelContext.registerTool` and wrap the app's own store actions — the same functions a click uses.

## Challenges

- Government feeds are inconsistent: CWFIF's national fire layer is temporal (189k rows; only rows whose validity window includes "now" are current), NWS alerts mostly lack polygons (placed at Census county centroids and flagged approximate), Earthquakes Canada is pipe-delimited text.
- Keeping severity honest: earthquakes and US wildfires have no agency severity, so Nearcast exposes magnitude/hectares and a separately labelled *display significance* rather than inventing one.
- Making the demo robust: a clearly labelled demo-data mode guarantees the experience even if a feed is down during judging.

## Accomplishments

Live, cross-border, six-source hazard workspace with graceful per-source failure; eight well-described tools; shared human/agent state proven by `get_current_view` reflecting manual pans and clicks; 43 unit tests; reproducible Terraform deployment.

## What we learned

Tool descriptions and strict schemas matter more than tool count. Deterministic, structured outputs (counts, ids, source status) let the agent explain without hallucinating, and a visible activity log makes the collaboration legible to people.

## What's next

Evacuation orders (BC first), air quality, region-aware summaries with time windows, and an origin-trial deployment for Chrome.

## Testing instructions

Open the live URL in ChatGPT's in-app browser or Chrome 149+ with `chrome://flags/#enable-webmcp-testing`. No login. Suggested prompts: "What am I currently looking at?", "Focus on British Columbia and Washington and show only wildfires and important weather alerts.", click any marker then "Tell me about the hazard I just selected.", "Compare British Columbia and Washington.", "Give me a situation brief for the region I am viewing." Append `?demo=true` for synthetic, clearly labelled demo data.
