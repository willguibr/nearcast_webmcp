# Nearcast WebMCP — Complete Implementation Specification

## ROLE

You are a senior full-stack engineer, AWS serverless architect, geospatial application developer, Terraform engineer, and WebMCP implementation specialist.

Your job is to DESIGN, IMPLEMENT, TEST, DEPLOY, and DOCUMENT a production-quality but intentionally small WebMCP-powered web application called:

# Nearcast WebMCP

Nearcast WebMCP is a browser-based situational-awareness application that aggregates authoritative public hazard information from official government sources across Canada and the United States and exposes the application's live state and interactive capabilities to AI agents through WebMCP.

This project is being built for the OpenAI WebMCP Challenge.

The most important goal is NOT to reproduce every feature of the existing Nearcast iPhone application.

The goal is to demonstrate a compelling human + agent collaborative experience using WebMCP.

The implementation must therefore prioritize:

1. WebMCP quality.
2. Interactive visual experience.
3. Reliable authoritative data.
4. Clear human-agent collaboration.
5. Small/simple infrastructure.
6. Fast deployment.
7. Strong demoability.
8. Responsible public-safety UX.

Do not overengineer this project.

---

# 1. PRODUCT CONCEPT

Nearcast WebMCP provides one interactive map for exploring current hazards across Canada and the United States.

Initial supported hazards:

* Wildfires
* Weather alerts
* Earthquakes

Potential fourth hazard if implementation time permits:

* Evacuation alerts, starting with British Columbia only.

Do NOT block the initial release on evacuation support.

The application's differentiator is not simply aggregating government data.

Its differentiator is that an AI agent can interact with the same live hazard workspace the human is viewing.

Examples:

> Show me significant hazards affecting British Columbia.

> Compare wildfire activity between British Columbia and Washington.

> Focus on the Vancouver-to-Seattle region and show only important weather alerts and active wildfires.

> What hazards are currently visible on this map?

> Show only earthquakes magnitude 4.0 or greater.

> Focus on this wildfire.

> Compare Alberta and British Columbia.

> Give me a situation brief for the region I am currently viewing.

The agent should manipulate the application through WebMCP tools.

The human must visibly see those changes reflected in the application.

---

# 2. IMPORTANT PRODUCT PRINCIPLE

The application itself is authoritative for application state.

The LLM is NOT responsible for:

* scraping government websites,
* calculating map bounds,
* counting hazards,
* computing distances,
* parsing GeoJSON,
* interpreting raw CAP XML,
* deciding what markers are visible,
* filtering raw source formats,
* determining map selection,
* calculating deterministic statistics.

Those responsibilities belong to application code.

The LLM should primarily perform:

* semantic interpretation,
* natural-language reasoning,
* deciding which WebMCP tools to call,
* summarization,
* comparison,
* explanation.

Architecture principle:

```text
Government sources
        ↓
Source adapters
        ↓
Normalized hazard model
        ↓
Nearcast API
        ↓
Nearcast browser state
        ↕
WebMCP
        ↕
AI agent
        ↕
Human
```

---

# 3. PROJECT NON-GOALS

Do NOT implement the following for the hackathon MVP:

* User accounts
* Authentication
* OAuth
* Push notifications
* SMS notifications
* Email notifications
* DynamoDB
* PostgreSQL
* RDS
* Redis
* ElastiCache
* ECS
* EKS
* EC2
* WebSockets
* Kafka
* SQS unless absolutely required
* EventBridge ingestion
* Historical warehouse
* Long-term event storage
* Mobile apps
* Native iOS integration
* Android
* Route planning
* Evacuation route recommendations
* AI-generated emergency instructions
* Automatic safety decisions
* Social/community reporting
* User-submitted incidents
* Machine-learning risk prediction
* Hurricane forecast modeling
* Flood modeling
* Air quality unless all core features are complete
* Road conditions unless all core features are complete

The MVP must remain small.

---

# 4. TECHNOLOGY STACK

Use the following stack unless there is an unavoidable technical reason not to.

## Frontend

* React
* TypeScript
* Vite
* MapLibre GL JS preferred
* React hooks
* Native Fetch API
* CSS or lightweight Tailwind if useful
* No heavy application framework unless justified

Avoid Next.js.

This application is primarily a static SPA and does not require SSR.

## Backend

Use:

* AWS Lambda
* TypeScript
* Node.js current supported Lambda runtime
* API Gateway HTTP API

Keep Lambda dependencies minimal.

## Infrastructure

Use:

* Terraform
* Amazon Route 53
* AWS Certificate Manager
* Amazon CloudFront
* Amazon S3
* Amazon API Gateway HTTP API
* AWS Lambda
* CloudWatch Logs
* IAM

No database.

---

# 5. AWS ARCHITECTURE

Implement this architecture:

```text
                        Internet
                           │
                           ▼
                     Route 53 DNS
                           │
                           ▼
                 CloudFront Distribution
                    example-domain
                     /           \
                    /             \
                   ▼               ▼
            default /*          /api/*
                 │                 │
                 ▼                 ▼
          Private S3          API Gateway
          SPA assets           HTTP API
                                   │
                                   ▼
                                Lambda
                                   │
                ┌──────────────────┼─────────────────┐
                ▼                  ▼                 ▼
             Canada              USA               USA
              data               data              data
```

CloudFront must have TWO origins.

### Origin 1 — frontend

Private S3 bucket.

CloudFront accesses the bucket using Origin Access Control.

The S3 bucket must NOT be public.

Default CloudFront behavior:

```text
/*
```

routes to S3.

### Origin 2 — backend

Regional API Gateway HTTP API endpoint.

CloudFront behavior:

```text
/api/*
```

routes to API Gateway.

This allows browser requests such as:

```text
GET /api/hazards
GET /api/hazards/summary
GET /api/hazards/{id}
```

to remain same-origin from the user's perspective.

Do NOT create a separate API custom domain unless absolutely necessary.

---

# 6. WHY SINGLE-DOMAIN ROUTING IS REQUIRED

This architecture intentionally avoids:

```text
app.example.com
api.example.com
```

Instead use:

```text
example.com
example.com/api/*
```

Benefits:

* one certificate,
* one DNS name,
* simpler browser security,
* fewer CORS problems,
* simpler hackathon deployment,
* simpler WebMCP execution context,
* fewer AWS resources.

During local development, configure Vite proxying so:

```text
/api/*
```

is proxied to the deployed API or local backend.

---

# 7. DOMAIN REGISTRATION STRATEGY

A custom domain must NOT block deployment.

Support two deployment modes.

## MODE A — FAST/HACKATHON MODE

Use the generated CloudFront hostname.

Example conceptually:

```text
<distribution>.cloudfront.net
```

The application MUST be completely functional this way.

This is the mandatory fallback.

## MODE B — CUSTOM DOMAIN

If a custom domain is available, configure it.

Terraform variables:

```text
enable_custom_domain
domain_name
hosted_zone_id
```

Suggested patterns:

```text
nearcast.app
nearcast.live
nearcastmap.com
nearcastalerts.com
web.nearcast...
```

DO NOT assume any domain is available.

Do not automatically purchase a domain through Terraform.

Domain registration is a manual bootstrap step.

If the user chooses Route 53 Domains:

1. Search availability.
2. Register domain manually.
3. Wait for registration confirmation.
4. Confirm Route 53 hosted zone.
5. Pass hosted zone ID into Terraform.
6. Terraform manages DNS records from that point onward.

If the user already has a suitable domain, use a subdomain instead.

Example:

```text
hazards.example.com
```

Domain registration should never become a dependency for application testing.

---

# 8. TLS CERTIFICATE

When custom domain mode is enabled:

Create ACM public certificate.

Because this certificate is for CloudFront:

```text
AWS region = us-east-1
```

Use DNS validation.

Terraform must create the Route 53 DNS validation records and wait for certificate validation.

Certificate should cover:

```text
domain_name
```

and optionally:

```text
www.domain_name
```

if required.

Do NOT create an API Gateway certificate.

CloudFront is the public TLS termination point.

---

# 9. ROUTE 53

When custom domains are enabled:

Create Route 53 alias records pointing to CloudFront.

Prefer:

```text
A Alias
AAAA Alias
```

where appropriate.

Root domain:

```text
example.com → CloudFront
```

Optional:

```text
www.example.com → CloudFront
```

If both are configured, canonicalize one.

Prefer the root domain unless otherwise specified.

---

# 10. FRONTEND S3 BUCKET

Create an S3 bucket dedicated to the compiled SPA.

Example logical name:

```text
nearcast-web-frontend
```

Requirements:

* Block all public access.
* Enable server-side encryption.
* Disable ACL usage.
* Do not configure S3 static website hosting.
* CloudFront accesses the normal S3 REST endpoint through OAC.

Terraform must configure the appropriate bucket policy allowing only the CloudFront distribution to retrieve objects.

Deployment uploads:

```text
dist/*
```

generated by:

```text
npm run build
```

---

# 11. CLOUDFRONT CONFIGURATION

Configure:

## Default root object

```text
index.html
```

## Viewer protocol

Redirect HTTP to HTTPS.

## Compression

Enable Brotli/Gzip where supported.

## SPA routing

Client-side React routes must resolve to `index.html`.

If using React Router, configure CloudFront custom error response handling:

```text
403/404 → /index.html
```

only if necessary.

Prefer minimal routing complexity.

## Frontend caching

Hashed Vite assets:

```text
/assets/*
```

long cache lifetime.

`index.html`:

short/no-cache.

## API behavior

Path:

```text
/api/*
```

Origin:

API Gateway.

Allowed methods initially:

```text
GET
HEAD
OPTIONS
```

Do not expose writes unless eventually needed.

Forward required query strings.

Cache GET requests.

Suggested cache TTLs:

```text
minimum = 0
default = 60 seconds
maximum = 300 seconds
```

Ensure query strings relevant to filtering are included in the cache key.

Example:

```text
type
country
region
minSeverity
minMagnitude
bbox
limit
```

Do not cache different query combinations under the same cache key.

---

# 12. API GATEWAY

Use API Gateway HTTP API, not REST API.

Routes:

```text
GET /api/health

GET /api/hazards

GET /api/hazards/summary

GET /api/hazards/{id}
```

Potential route:

```text
GET /api/regions/compare
```

but prefer keeping deterministic comparison logic in shared application code if practical.

No API keys.

No auth.

No usage plans.

No WAF for the hackathon.

Enable CORS for localhost development if necessary, despite production same-origin routing.

---

# 13. LAMBDA CONFIGURATION

Use one Lambda function initially.

Do NOT create separate Lambda functions for each feed unless there is a strong reason.

Suggested:

```text
nearcast-api
```

Memory:

```text
512 MB
```

Timeout:

```text
10–15 seconds
```

Architecture:

Use default architecture unless changing it provides an obvious benefit.

Environment variables should contain only configuration.

No secrets should be required because official hazard feeds are public.

Suggested variables:

```text
LOG_LEVEL
CACHE_CONTROL_SECONDS
APP_ENV
```

Avoid storing source endpoint URLs as secrets.

---

# 14. BACKEND SOURCE ADAPTER PATTERN

Implement source adapters.

Suggested layout:

```text
backend/
  src/
    handlers/
      api.ts

    adapters/
      canada/
        weather.ts
        wildfires.ts
        earthquakes.ts

      us/
        weather.ts
        wildfires.ts
        earthquakes.ts

    domain/
      hazard.ts
      severity.ts
      geography.ts

    services/
      hazard-service.ts
      source-service.ts

    utils/
      fetch.ts
      time.ts
      logging.ts

    tests/
```

Every adapter must output the SAME normalized domain representation.

Raw source formats must never leak into the frontend.

---

# 15. DATA SOURCES

Only use authoritative public government sources.

No commercial hazard APIs.

No scraping private websites.

No social media feeds.

No unofficial wildfire aggregators.

## CANADA

### Weather

Primary source:

Environment and Climate Change Canada / Meteorological Service of Canada GeoMet OGC API.

Use its current Weather Alerts collection.

The implementation should retrieve active/current alert features and normalize fields such as:

* alert name,
* alert type,
* province,
* publication date,
* validity date,
* expiration date,
* status,
* impact,
* risk/severity indication,
* geometry,
* English description,
* official source attribution.

Do not hard-code assumptions without inspecting the returned schema.

### Wildfires

Primary source:

Natural Resources Canada / Canadian Wildland Fire Information System.

Use the current authoritative active wildfire service.

The adapter should normalize at minimum:

* fire ID,
* name when available,
* location,
* province,
* status,
* size when available,
* start/discovery date when available,
* last update,
* geometry,
* responsible authority/source.

If source fields differ by jurisdiction, preserve unknown values instead of guessing.

### Earthquakes

Preferred Canadian source:

Earthquakes Canada where implementation is straightforward.

However, for the hackathon, USGS may be used as the common seismic catalog if that materially reduces complexity.

If USGS is used for Canadian earthquakes, clearly label the source as USGS rather than implying Earthquakes Canada supplied it.

---

# 16. UNITED STATES SOURCES

## Weather

Use the National Weather Service public API.

Use active alert endpoints.

Normalize:

* event,
* severity,
* certainty,
* urgency,
* headline,
* description,
* instruction,
* effective time,
* onset,
* expiration,
* affected area,
* geometry,
* sender,
* official source URL.

Respect NWS guidance about responsible request rates.

CloudFront caching should substantially reduce repeated API calls.

## Earthquakes

Use USGS real-time GeoJSON feeds or the earthquake query API.

For the MVP prefer a feed containing recent earthquakes.

Normalize:

* ID,
* magnitude,
* location description,
* coordinates,
* depth,
* occurrence time,
* update time,
* event status,
* alert level when present,
* felt count when present,
* official details URL.

Expose earthquake magnitude explicitly.

## Wildfires

Use authoritative public National Interagency Fire Center / WFIGS incident data.

Prefer the simplest current public geospatial service supporting:

* active incident point,
* name,
* incident ID,
* location,
* discovery/start date,
* acreage if available,
* containment if available,
* update time,
* incident type,
* geometry.

Do not spend excessive time integrating multiple wildfire services.

One authoritative active-incidents feed is sufficient.

---

# 17. SOURCE RESILIENCE

Each adapter must fail independently.

If USGS fails:

```text
wildfires = available
weather = available
earthquakes = unavailable
```

The entire API must NOT return HTTP 500 simply because one source failed.

Return metadata such as:

```json
{
  "sources": [
    {
      "id": "usgs",
      "status": "available"
    },
    {
      "id": "nws",
      "status": "available"
    },
    {
      "id": "cwfis",
      "status": "error"
    }
  ]
}
```

Include:

```text
retrievedAt
```

for every response.

Where feasible include source freshness timestamps.

---

# 18. NORMALIZED HAZARD DOMAIN MODEL

Create one shared conceptual model.

Example:

```typescript
type HazardType =
  | "wildfire"
  | "weather"
  | "earthquake";

type CountryCode = "CA" | "US";

type HazardSeverity =
  | "info"
  | "minor"
  | "moderate"
  | "severe"
  | "extreme"
  | "unknown";

interface HazardSource {
  id: string;
  agency: string;
  country: CountryCode;
  url?: string;
}

interface Hazard {
  id: string;

  type: HazardType;

  country: CountryCode;

  regionCode?: string;
  regionName?: string;

  title: string;
  description?: string;

  severity: HazardSeverity;

  geometry: GeoJSON.Geometry;

  latitude?: number;
  longitude?: number;

  startedAt?: string;
  updatedAt?: string;
  expiresAt?: string;

  source: HazardSource;

  wildfire?: {
    status?: string;
    areaHectares?: number;
    containmentPercent?: number;
  };

  earthquake?: {
    magnitude?: number;
    depthKm?: number;
    feltReports?: number;
  };

  weather?: {
    event?: string;
    urgency?: string;
    certainty?: string;
    instruction?: string;
  };
}
```

Do not force source-specific fields into generic properties if semantics differ.

---

# 19. HAZARD IDENTIFIERS

IDs must be deterministic and collision-resistant.

Suggested convention:

```text
<source>:<source-event-id>
```

Examples conceptually:

```text
usgs:...
nws:...
eccc:...
cwfis:...
nifc:...
```

Never derive stable IDs from array indexes.

---

# 20. SEVERITY NORMALIZATION

Different sources use different severity models.

Implement explicit translation logic.

Keep both:

```text
normalized severity
raw/source severity
```

Never pretend the systems are perfectly equivalent.

Example domain:

```text
info
minor
moderate
severe
extreme
unknown
```

For earthquakes, severity should NOT simply be invented from magnitude and represented as government-issued severity.

Instead expose magnitude as magnitude.

If a UI color category is needed, label it internally as:

```text
display significance
```

rather than falsely claiming official severity.

---

# 21. API RESPONSE MODEL

Example:

```json
{
  "data": [],
  "meta": {
    "generatedAt": "...",
    "sources": [],
    "filters": {},
    "count": 0
  }
}
```

`GET /api/hazards` filters:

```text
type
country
region
minSeverity
minMagnitude
bbox
limit
```

`bbox` format:

```text
west,south,east,north
```

Validate all inputs.

Reject malformed bounding boxes.

Limit maximum result size.

Suggested default:

```text
500
```

Suggested maximum:

```text
2000
```

---

# 22. API SUMMARY ENDPOINT

`GET /api/hazards/summary`

Return deterministic aggregate data.

Example:

```json
{
  "generatedAt": "...",
  "countries": {
    "CA": {
      "wildfires": 0,
      "weatherAlerts": 0,
      "earthquakes": 0
    },
    "US": {
      "wildfires": 0,
      "weatherAlerts": 0,
      "earthquakes": 0
    }
  },
  "sources": []
}
```

Include more useful wildfire breakdowns if source data permits.

Do not invent unavailable metrics.

---

# 23. FRONTEND PAGE STRUCTURE

Desktop layout:

```text
┌─────────────────────────────────────────────────────────┐
│ Nearcast                         Live Hazard Awareness  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                       MAP                               │
│                                                         │
│                                                         │
├───────────────────────┬─────────────────────────────────┤
│ Filters               │ Hazard details / active list    │
│                       │                                 │
│ Canada / USA          │                                 │
│ Wildfires             │                                 │
│ Weather               │                                 │
│ Earthquakes           │                                 │
│                       │                                 │
└───────────────────────┴─────────────────────────────────┘
```

Responsive layout required.

Mobile web should remain usable but desktop demo experience is the priority.

---

# 24. VISUAL IDENTITY

Nearcast should feel Canadian-origin but North-American in scope.

Avoid overly patriotic or gimmicky design.

Desired qualities:

* modern,
* calm,
* authoritative,
* emergency-awareness focused,
* map-first,
* data-dense without being cluttered,
* accessible.

Avoid making everything red.

Color should communicate hazard type/severity carefully.

Suggested iconography:

```text
Wildfire → flame
Weather → warning/cloud/storm
Earthquake → seismic/earth icon
```

Provide visual legend.

---

# 25. INITIAL MAP VIEW

Initial map bounds should show:

```text
Canada
+
contiguous United States
+
Alaska
```

Do not unnecessarily include the entire world.

Support:

* pan,
* zoom,
* marker selection,
* polygon visualization where source geometry supports it,
* clustering if markers become dense.

Map marker clustering is strongly recommended.

---

# 26. MAP STATE MODEL

Frontend must maintain explicit application state.

Example:

```typescript
interface MapState {
  bounds: Bounds;
  zoom: number;
  center: [number, number];

  visibleHazardTypes: HazardType[];

  countries: CountryCode[];

  minimumSeverity?: HazardSeverity;

  minimumEarthquakeMagnitude?: number;

  selectedHazardId?: string;

  visibleHazardIds: string[];
}
```

WebMCP tools must operate against this same state.

Do not create separate "agent state".

Human and agent must share application state.

---

# 27. HUMAN-AGENT COLLABORATION REQUIREMENT

This is one of the most important project requirements.

The demo must prove:

```text
Human changes application
          ↓
Agent understands new state
          ↓
Agent changes application
          ↓
Human sees changes
          ↓
Human responds/refines
```

Example:

1. Human manually zooms to British Columbia.
2. Human selects one wildfire.
3. Human asks agent:
   "Tell me about this fire and show other significant hazards nearby."
4. Agent calls WebMCP:

   * get_current_view
   * get_selected_hazard
   * get_hazards_in_view
   * set_filters or focus_area
5. Application updates.
6. Human sees map/filter changes.

This is more important than exposing lots of tools.

---

# 28. WEBMCP IMPLEMENTATION

Use the current imperative WebMCP API:

```text
document.modelContext.registerTool(...)
```

Install WebMCP TypeScript definitions if useful.

Tools must be registered when application state is ready.

Handle environments where WebMCP is unavailable gracefully.

Example UI indicator:

```text
WebMCP
● Available

or

WebMCP
○ Browser support not detected
```

The normal application must still function without WebMCP.

---

# 29. REQUIRED WEBMCP TOOLS

Implement approximately SEVEN tools.

Do not create dozens.

## TOOL 1 — get_current_view

Purpose:

Allow the agent to understand what the human is currently viewing.

Input:

None.

Return:

* map center,
* bounds,
* zoom,
* countries enabled,
* hazard types enabled,
* minimum severity,
* earthquake magnitude filter,
* selected hazard,
* count of visible hazards.

This is essential for shared human/agent state.

---

## TOOL 2 — get_visible_hazards

Purpose:

Return hazards currently represented in the active map/filter state.

Inputs:

Optional:

```text
limit
```

Return a concise structured list.

Do NOT dump massive descriptions unless requested.

Include:

```text
id
type
title
country
region
severity
coordinates where appropriate
source
important hazard-specific attributes
```

---

## TOOL 3 — set_focus_area

Purpose:

Move the map.

Input should support:

```text
latitude
longitude
zoom
```

and preferably explicit bounds:

```text
west
south
east
north
```

If a semantic location such as "British Columbia" is required, the agent itself may provide known bounds OR application code may contain a small predefined region registry.

Do NOT add geocoding infrastructure unless necessary.

When executed:

* update application map,
* visibly animate/focus,
* update shared state.

Return confirmation.

---

## TOOL 4 — set_hazard_filters

Inputs:

```text
countries
hazardTypes
minimumSeverity
minimumEarthquakeMagnitude
```

Execution:

Must visibly update map and list.

Return:

* filters applied,
* resulting visible hazard count.

---

## TOOL 5 — focus_hazard

Input:

```text
hazardId
```

Execution:

* select hazard,
* pan/zoom map,
* open details panel,
* visually highlight marker/geometry.

Return concise hazard information.

---

## TOOL 6 — get_hazard_details

Input:

```text
hazardId
```

Return:

Complete normalized hazard detail including:

* source,
* timestamps,
* raw official classifications where useful,
* official source link.

Do not mutate UI unless appropriate.

---

## TOOL 7 — compare_regions

Input:

Two or more regions.

Support a fixed region registry initially:

Canada:

```text
BC
AB
SK
MB
ON
QC
NB
NS
PE
NL
YT
NT
NU
```

United States:

at minimum:

```text
WA
OR
CA
ID
MT
AK
```

Prefer all US states if inexpensive.

Return deterministic comparison:

```text
wildfire count
weather alert count
earthquake count
significant earthquake count
```

Only include metrics supported by available data.

Do not make qualitative safety claims.

---

# 30. OPTIONAL WEBMCP TOOL — create_situation_context

Do NOT have this tool ask an LLM to create prose.

Instead return deterministic structured situation context for a geographic area.

Example:

```json
{
  "area": "current-map-view",
  "wildfires": [],
  "weatherAlerts": [],
  "earthquakes": [],
  "sourceStatus": [],
  "generatedAt": "..."
}
```

The external agent can turn this into natural-language prose.

This maintains the separation:

```text
Nearcast → facts
Agent → explanation
```

---

# 31. WEBMCP TOOL QUALITY REQUIREMENTS

Every tool must have:

* precise name,
* clear description,
* strict input schema,
* descriptions on important input properties,
* deterministic error handling,
* concise output,
* no misleading capabilities.

Do NOT expose internal implementation details to the agent.

Bad description:

```text
Gets stuff from the map.
```

Good description:

```text
Returns the hazards currently visible in the user's Nearcast map after applying the active country, hazard type, severity, magnitude, and geographic filters.
```

Tool descriptions should help an agent choose the correct tool without guessing.

---

# 32. WEBMCP ACTIVITY PANEL

Add a small visible panel called:

```text
Agent Activity
```

When a WebMCP tool executes, log:

```text
timestamp
tool name
short summary
```

Example:

```text
20:41:12  get_current_view
20:41:13  set_focus_area → British Columbia bounds
20:41:14  set_hazard_filters → wildfire + weather
20:41:16  focus_hazard → ABC123
```

Do NOT log private information.

This panel exists primarily to make the demo understandable.

It should visually prove that structured WebMCP tools are being called.

---

# 33. WEBMCP TOOL ERROR HANDLING

Errors must return actionable structured messages.

Examples:

```text
hazard not found
invalid region
unsupported country
invalid bounds
data temporarily unavailable
```

Do not throw unexplained stack traces.

WebMCP tool failures should not crash React.

---

# 34. RESPONSIBLE PUBLIC-SAFETY DESIGN

This requirement is mandatory.

Nearcast is an awareness application.

It is NOT:

* Alert Ready,
* FEMA,
* ECCC,
* NRCan,
* NWS,
* USGS,
* NIFC,
* an emergency service,
* an emergency dispatch system.

Never display language such as:

```text
"You are safe."
"Your route is safe."
"There is no danger."
"You should evacuate."
"It is safe to remain."
```

Instead:

```text
"No matching active hazards were returned by the currently available sources."
```

and:

```text
"Always follow instructions from local emergency authorities."
```

---

# 35. GLOBAL DISCLAIMER

Display a persistent but non-intrusive disclaimer.

Suggested meaning:

Nearcast aggregates public information from official sources for situational awareness. Information may be delayed, incomplete, unavailable, or superseded. Nearcast is not an emergency notification service and does not replace official alerts or instructions from emergency authorities.

Do not make the disclaimer so aggressive that the UI becomes unusable.

---

# 36. SOURCE ATTRIBUTION

Every hazard detail panel must clearly display:

```text
Source:
Agency Name

Updated:
Timestamp

Official information:
Link
```

Never hide the originating agency.

Agent responses through WebMCP should contain source identifiers where practical.

---

# 37. DATA FRESHNESS

Display:

```text
Last refreshed
```

globally.

Also expose per-source status.

Example:

```text
Sources

● ECCC          2 min ago
● NWS           1 min ago
● USGS          3 min ago
● NRCan         4 min ago
○ NIFC          temporarily unavailable
```

---

# 38. REFRESH MODEL

Frontend:

Refresh hazard data every:

```text
2–5 minutes
```

depending on implementation.

Do NOT refresh every few seconds.

Also provide:

```text
Refresh
```

button.

CloudFront should absorb repeated identical API requests.

NWS specifically recommends responsible polling; avoid aggressive source access.

---

# 39. BACKEND HTTP CACHING

Lambda responses should include reasonable:

```text
Cache-Control
```

headers.

Example concept:

```text
public
max-age around 30–60 seconds
s-maxage around 120–300 seconds
```

Tune by endpoint.

Goal:

```text
Browser
    ↓
CloudFront cache
    ↓ cache miss only
API Gateway
    ↓
Lambda
    ↓
government service
```

Do not create Redis.

---

# 40. REQUEST TIMEOUTS

All calls to external government sources must have explicit timeouts.

Suggested:

```text
3–5 seconds/source
```

Use AbortController or equivalent.

Do not allow one dead upstream source to consume the full Lambda timeout.

Fetch sources concurrently where sensible:

```text
Promise.allSettled(...)
```

not sequentially.

---

# 41. OBSERVABILITY

Use structured JSON logging in Lambda.

At minimum log:

```text
requestId
route
duration
source durations
source status
returned hazard count
errors
```

Do NOT log huge payloads.

CloudWatch Logs are sufficient.

No X-Ray required.

No OpenTelemetry required.

---

# 42. HEALTH ENDPOINT

Implement:

```text
GET /api/health
```

Return:

```json
{
  "status": "ok",
  "service": "nearcast-api",
  "timestamp": "..."
}
```

This should not query all upstream feeds.

---

# 43. SECURITY

Despite public data, apply reasonable controls.

Terraform:

* least-privilege Lambda IAM role,
* no wildcard permissions unless required,
* no public S3,
* HTTPS only,
* secure headers where easy,
* no exposed credentials,
* no secrets committed.

Lambda does not require AWS API permissions other than CloudWatch logging unless additional services are introduced.

Avoid unnecessary IAM permissions.

---

# 44. FRONTEND SECURITY HEADERS

Where practical use CloudFront response headers policy for:

```text
Strict-Transport-Security
X-Content-Type-Options
Referrer-Policy
Content-Security-Policy
```

Do not create a CSP so restrictive that MapLibre tiles stop working.

Document any external tile hosts.

---

# 45. MAP TILE PROVIDER

Use a provider compatible with an open-source/public demo.

Prefer:

* OpenStreetMap-compatible basemap,
* MapLibre,
* provider requiring no paid commercial token if practical.

Do not commit commercial API tokens.

If using a tile provider with attribution requirements, display proper attribution.

---

# 46. TERRAFORM STRUCTURE

Suggested:

```text
infra/
  providers.tf
  variables.tf
  locals.tf

  s3.tf
  cloudfront.tf
  lambda.tf
  apigateway.tf
  acm.tf
  route53.tf
  iam.tf

  outputs.tf

  terraform.tfvars.example
```

Avoid elaborate nested modules.

This is a small project.

---

# 47. TERRAFORM PROVIDERS

Because CloudFront certificates must be in `us-east-1`, configure an aliased AWS provider.

Concept:

```text
default provider → chosen application region
aws.us_east_1 → us-east-1
```

Suggested application region:

```text
ca-central-1
```

because the project originated in Canada.

API Gateway and Lambda can run in:

```text
ca-central-1
```

CloudFront is global.

ACM certificate for CloudFront:

```text
us-east-1
```

---

# 48. TERRAFORM VARIABLES

At minimum:

```text
project_name
environment
aws_region

enable_custom_domain
domain_name
hosted_zone_id

frontend_bucket_name_override
```

Defaults:

```text
project_name = nearcast-webmcp
environment = prod
aws_region = ca-central-1
enable_custom_domain = false
```

Domain settings should remain optional.

---

# 49. TERRAFORM OUTPUTS

Return:

```text
cloudfront_distribution_id
cloudfront_domain_name
application_url
api_gateway_endpoint
frontend_bucket_name
```

If custom domain enabled:

```text
custom_domain_name
certificate_arn
```

---

# 50. TERRAFORM STATE

For the hackathon, local Terraform state is acceptable if necessary.

Do NOT introduce an S3 + DynamoDB Terraform backend merely for this prototype unless one already exists.

However:

```text
*.tfstate
*.tfstate.*
```

must be gitignored.

Document this choice.

---

# 51. DEPLOYMENT WORKFLOW

Provide scripts:

```text
npm install

npm run test

npm run build
```

Backend build.

Terraform:

```text
terraform init
terraform plan
terraform apply
```

Then frontend deployment:

```text
aws s3 sync dist/ ...
```

Then CloudFront invalidation:

```text
/*
```

Only invalidate necessary paths if easy.

Automate using:

```text
scripts/deploy.sh
```

or:

```text
Makefile
```

Prefer something easily reproducible.

---

# 52. OPTIONAL GITHUB ACTIONS

Only implement if core functionality is already complete.

If implemented:

On push to `main`:

1. run tests,
2. build frontend,
3. build Lambda artifact,
4. deploy infrastructure,
5. sync S3,
6. invalidate CloudFront.

Use GitHub OIDC to AWS if practical.

Do NOT spend significant hackathon time configuring CI.

Manual deployment is acceptable.

---

# 53. REPOSITORY STRUCTURE

Use a monorepo.

Suggested:

```text
nearcast-webmcp/
│
├── README.md
├── LICENSE
├── .gitignore
├── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── map/
│   │   ├── webmcp/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── state/
│   │   ├── types/
│   │   └── App.tsx
│   │
│   └── tests/
│
├── backend/
│   └── src/
│       ├── adapters/
│       ├── domain/
│       ├── handlers/
│       ├── services/
│       └── tests/
│
├── shared/
│   └── src/
│       └── hazard.ts
│
├── infra/
│   └── *.tf
│
├── examples/
│   └── mock-hazards.json
│
├── scripts/
│   └── deploy.sh
│
└── docs/
    ├── architecture.md
    ├── webmcp.md
    └── data-sources.md
```

---

# 54. SHARED TYPES

If practical, create a small shared TypeScript package for:

```text
Hazard
HazardType
HazardSeverity
HazardSource
API responses
```

Do not create a complicated monorepo build system.

npm workspaces are sufficient if needed.

---

# 55. MOCK DATA MODE

This is CRITICAL for demo reliability.

Implement:

```text
VITE_USE_MOCK_DATA=true
```

or an equivalent demo mode.

Create realistic synthetic hazard fixtures.

The demo must still work even if a government API is temporarily unavailable during judging.

However:

Clearly label mock mode.

Never present synthetic data as live government information.

Production deployment should default to live data.

Optional query:

```text
?demo=true
```

may enable synthetic demo mode if clearly marked:

```text
DEMO DATA
```

---

# 56. TESTING

Implement meaningful tests.

Backend:

* adapter parsing,
* severity normalization,
* malformed upstream response handling,
* partial-source failure,
* API filter logic,
* bounding box filtering,
* earthquake magnitude filtering.

Frontend:

* filter state,
* selected hazard,
* map state transitions where practical,
* WebMCP handler functions.

Avoid spending time on shallow snapshot tests.

---

# 57. WEBMCP TESTING

Test in:

1. ChatGPT's in-app browser.
2. Chrome with WebMCP experimental support if available.

Verify:

* tools register,
* tool descriptions appear correctly,
* schemas validate,
* tool calls execute,
* React state updates,
* map visibly changes,
* results return to agent,
* human changes remain visible to agent through current-state tools.

---

# 58. REQUIRED DEMO SCRIPT

Build the product so this demo can be executed reliably.

### Scene 1

Open Nearcast.

Show Canada + United States.

Explain briefly:

Nearcast combines public hazard data from official Canadian and U.S. government sources.

### Scene 2

Ask:

> What am I currently looking at?

Agent calls:

```text
get_current_view
```

### Scene 3

Ask:

> Focus on British Columbia and Washington and show only wildfires and important weather alerts.

Agent invokes:

```text
set_focus_area
set_hazard_filters
```

Map visibly changes.

### Scene 4

Manually click one hazard.

Ask:

> Tell me about the hazard I just selected.

Agent calls:

```text
get_current_view
get_hazard_details
```

### Scene 5

Ask:

> Compare British Columbia and Washington.

Agent calls:

```text
compare_regions
```

### Scene 6

Show Agent Activity panel.

Point out that the agent did not scrape/click the page blindly.

The website exposed explicit structured tools through WebMCP.

---

# 59. DEMO LENGTH

The public demo video must be less than three minutes.

Target:

```text
2:00–2:30
```

Do not make the video exactly 2:59.

Leave margin.

Audio narration required.

---

# 60. HACKATHON REPOSITORY REQUIREMENTS

Repository must be public before submission.

Include:

```text
LICENSE
```

Use:

```text
MIT
```

unless the project owner specifies otherwise.

README must make deployment/testing easy.

---

# 61. README STRUCTURE

README should contain:

# Nearcast WebMCP

One-sentence description.

## What it does

## Why WebMCP

Explain that hazard maps have rich state that is difficult for agents to reliably manipulate through generic browser automation.

## Human + Agent Experience

Explain shared application state.

## Supported Hazards

## Supported Countries

## Data Sources

Clearly state official agencies.

## Architecture

Include ASCII or Mermaid diagram.

## WebMCP Tools

List the seven tools.

## Running Locally

## AWS Deployment

## Custom Domain

## Testing WebMCP

## Safety / Disclaimer

## License

---

# 62. REQUIRED HACKATHON DESCRIPTION MATERIAL

Generate draft text suitable for Devpost covering:

### Why this is a strong WebMCP use case

Map-based hazard applications contain large amounts of visual state, filters, selections, geographic bounds, and heterogeneous information. Traditional browser agents must infer these interactions from the DOM. WebMCP gives the agent explicit access to the application's semantic operations while keeping the human and agent inside the same visible workspace.

### Better UX

Instead of manually selecting countries, filtering hazard types, scanning hundreds of markers, and correlating multiple government sources, the human can describe an intent naturally while still seeing and controlling the resulting map.

### What humans and agents can do together

Human:

* visually explores,
* selects incidents,
* validates context,
* controls decisions.

Agent:

* manipulates filters,
* compares geographic regions,
* retrieves structured incident details,
* surfaces relevant information.

Application:

* provides authoritative normalized data,
* performs deterministic geographic calculations,
* maintains visual state.

---

# 63. WEBMCP IMPLEMENTATION DESCRIPTION

Document that Nearcast registers tools using:

```text
document.modelContext.registerTool(...)
```

Each tool wraps existing client-side application state/actions.

Examples:

```text
set_focus_area
```

updates the same map state used by human interactions.

```text
focus_hazard
```

selects the same hazard detail UI used when a human clicks a marker.

```text
get_current_view
```

reports the exact state generated by either human or agent interactions.

This shared-state characteristic must be emphasized.

---

# 64. DATA LICENSING / ATTRIBUTION

Review the usage/licensing conditions for every government source before final deployment.

Document sources and attribution.

Do not copy copyrighted logos unless permitted.

Text agency attribution is sufficient.

Avoid unnecessary third-party trademarks in the demo video.

---

# 65. APP BRANDING

Use:

```text
Nearcast
```

Primary subtitle:

```text
Cross-Border Hazard Awareness
```

Possible descriptor:

```text
WebMCP-powered situational awareness using authoritative public data.
```

Do not describe the application as an official government service.

---

# 66. PRIORITY ORDER

Implementation MUST happen in this order.

## Phase 1 — Foundation

1. Create repo.
2. Create React/Vite application.
3. Render MapLibre map.
4. Create shared Hazard type.
5. Add mock hazard fixtures.
6. Render mock markers.
7. Implement filters.
8. Implement selected-hazard panel.

The UI must work before live feeds.

## Phase 2 — Backend

9. Create Lambda handler.
10. Create `/api/health`.
11. Build USGS adapter.
12. Build ECCC or NWS weather adapter.
13. Build one wildfire adapter.
14. Normalize responses.
15. Implement `/api/hazards`.
16. Add source failure handling.

## Phase 3 — WebMCP

17. Detect WebMCP support.
18. Register `get_current_view`.
19. Register `get_visible_hazards`.
20. Register `set_focus_area`.
21. Register `set_hazard_filters`.
22. Register `focus_hazard`.
23. Register `get_hazard_details`.
24. Register `compare_regions`.
25. Add Agent Activity panel.

## Phase 4 — Infrastructure

26. Terraform S3.
27. Terraform Lambda/IAM.
28. Terraform API Gateway.
29. Terraform CloudFront.
30. Deploy using CloudFront hostname.
31. Verify app.
32. Only THEN configure custom domain.

## Phase 5 — Remaining feeds

33. Add remaining Canada/U.S. feeds.
34. Add fourth hazard only if enough time remains.

## Phase 6 — Submission

35. README.
36. Architecture doc.
37. Test WebMCP in ChatGPT.
38. Record demo.
39. Upload public YouTube video.
40. Complete Devpost submission.
41. Verify public repo/license.
42. Verify live URL.

---

# 67. CUSTOM DOMAIN IS NOT ON CRITICAL PATH

This requirement is explicit.

If any problem occurs with:

* Route 53 registration,
* DNS propagation,
* ACM validation,
* CloudFront alias provisioning,

DO NOT delay the hackathon submission.

Use the CloudFront-generated HTTPS hostname.

The working project matters more than vanity DNS.

---

# 68. DEFINITION OF DONE

The MVP is DONE when:

* live public URL exists,
* map loads,
* three hazard categories display,
* at least Canada + U.S. are represented,
* official sources are attributed,
* source failures are graceful,
* filtering works,
* map selection works,
* WebMCP tools register,
* agent can read current state,
* agent can modify filters,
* agent can move map,
* agent can select hazard,
* human changes can be subsequently understood by agent,
* Agent Activity shows tool calls,
* disclaimer exists,
* infrastructure is reproducible with Terraform,
* public README exists,
* MIT license exists,
* demo video exists,
* Devpost materials are ready.

Anything beyond this is optional.

---

# 69. HARD ENGINEERING RULES

Do not overengineer.

Prefer:

```text
simple
deterministic
observable
easy to demo
```

over:

```text
architecturally sophisticated
```

Do not create infrastructure that is not required.

Do not add AI APIs to the backend.

Do not embed OpenAI API calls.

WebMCP is the AI integration.

The agent consuming WebMCP is responsible for the reasoning.

---

# 70. IMPLEMENTATION BEHAVIOUR

Do not repeatedly ask the project owner design questions.

When minor choices are unspecified:

* choose sensible defaults,
* document them,
* proceed.

Only stop if a choice would materially alter project scope, cost, security, or eligibility.

Do not merely generate plans.

Implement the application.

After each major phase:

1. run tests,
2. build,
3. fix errors,
4. continue.

Do not leave placeholder TODO implementations for required functionality.

---

# 71. FINAL VALIDATION CHECKLIST

Before declaring completion, verify:

## Frontend

* [ ] production build succeeds
* [ ] map loads
* [ ] filters work
* [ ] clustering works
* [ ] selected hazard works
* [ ] attribution appears
* [ ] source freshness appears
* [ ] responsive enough for desktop/mobile

## Backend

* [ ] health works
* [ ] hazards works
* [ ] summary works
* [ ] malformed queries return 400
* [ ] partial upstream failures work
* [ ] no secrets
* [ ] external requests have timeouts

## AWS

* [ ] S3 private
* [ ] CloudFront OAC
* [ ] HTTPS
* [ ] API behavior routes correctly
* [ ] frontend SPA routes work
* [ ] CloudFront URL works without custom domain
* [ ] ACM in us-east-1 if custom domain enabled
* [ ] Route 53 alias works if custom domain enabled

## WebMCP

* [ ] all required tools register
* [ ] schemas valid
* [ ] tool descriptions clear
* [ ] tools mutate actual React/map state
* [ ] current view reports human changes
* [ ] tool failures are graceful
* [ ] Agent Activity visible

## Safety

* [ ] disclaimer visible
* [ ] no "safe/all clear" claims
* [ ] official source displayed
* [ ] timestamps displayed
* [ ] no emergency routing recommendations

## Hackathon

* [ ] public GitHub repository
* [ ] open-source license
* [ ] working hosted project
* [ ] clear README
* [ ] Devpost project description
* [ ] <3-minute public YouTube demo with audio
* [ ] WebMCP tested in supported browser
* [ ] final live URL tested immediately before submission

---

# 72. FINAL DELIVERABLES

At the end provide the project owner:

1. Live application URL.
2. CloudFront URL.
3. Custom domain URL if configured.
4. API health URL.
5. Git repository structure.
6. AWS architecture summary.
7. Terraform deployment instructions.
8. Local development instructions.
9. List of WebMCP tools.
10. Government sources used.
11. Testing results.
12. Known limitations.
13. Safety disclaimer.
14. Suggested Devpost description.
15. Suggested 2–2.5 minute demo script.
16. Final submission checklist.

The project should demonstrate one central idea exceptionally well:

> Nearcast turns fragmented official hazard information into a shared visual workspace where humans and AI agents can investigate real-world conditions together. WebMCP gives the agent structured access to the same map, filters, selections, and hazard context the human is using—without forcing the agent to guess its way through the interface.

Build that experience first.

Everything else is secondary.
