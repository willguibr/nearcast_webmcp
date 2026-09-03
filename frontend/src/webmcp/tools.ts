import type { Bbox, CountryCode, Hazard, HazardSeverity, HazardType, Region } from "@nearcast/shared";
import { SIGNIFICANT_MAGNITUDE, bboxContains, isValidBbox, resolveRegion, REGIONS } from "@nearcast/shared";
import { selectFilteredHazards, selectSelectedHazard, selectVisibleHazards, bySignificance, type Store } from "../state/store.ts";
import type { ModelContextToolDefinition } from "../types/webmcp.d.ts";

/** Structured error returned to the agent. Never a stack trace. */
export class ToolError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; this.name = "ToolError"; }
}

export interface ToolSpec<I = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
  /** Pure-ish handler: reads/mutates the shared store and returns a JSON-serializable result plus an activity summary. */
  run: (input: I, store: Store) => { result: unknown; summary: string };
}

const HAZARD_TYPES: HazardType[] = ["wildfire", "weather", "earthquake"];
const COUNTRIES: CountryCode[] = ["CA", "US"];
const SEVERITIES: HazardSeverity[] = ["info", "minor", "moderate", "severe", "extreme"];

function round(n: number, d = 3): number { return Math.round(n * 10 ** d) / 10 ** d; }

/** Concise representation for lists. */
export function summarizeHazard(h: Hazard) {
  const base = {
    id: h.id, type: h.type, title: h.title, country: h.country, region: h.regionCode, regionName: h.regionName,
    severity: h.severity, agencySeverity: h.rawSeverity, displaySignificance: h.significance,
    latitude: round(h.latitude), longitude: round(h.longitude), locationPrecision: h.locationPrecision,
    updatedAt: h.updatedAt, source: h.source.id,
  };
  if (h.type === "earthquake") return { ...base, magnitude: h.earthquake?.magnitude, depthKm: h.earthquake?.depthKm, occurredAt: h.startedAt };
  if (h.type === "wildfire") return { ...base, status: h.wildfire?.status, areaHectares: h.wildfire?.areaHectares, containmentPercent: h.wildfire?.containmentPercent, agency: h.wildfire?.agency };
  return { ...base, event: h.weather?.event, urgency: h.weather?.urgency, expiresAt: h.expiresAt, area: h.weather?.areaDescription };
}

function dataStatus(store: Store) {
  const s = store.getState();
  return {
    retrievedAt: s.retrievedAt ?? null,
    loadedHazards: s.hazards.length,
    demoData: s.mock,
    sources: s.sources.map((x) => ({ id: x.id, agency: x.agency, status: x.status, count: x.count ?? 0 })),
  };
}

function requireData(store: Store) {
  const s = store.getState();
  if (s.hazards.length === 0) throw new ToolError("data_unavailable", s.error ? `Hazard data is temporarily unavailable: ${s.error}` : "Hazard data has not finished loading yet. Retry in a few seconds.");
}

function findHazard(store: Store, hazardId: unknown): Hazard {
  if (typeof hazardId !== "string" || !hazardId.trim()) throw new ToolError("invalid_input", "hazardId must be a non-empty string such as \"cwfis:2026_BC_2026-K62162\".");
  requireData(store);
  const h = store.getState().hazards.find((x) => x.id === hazardId.trim());
  if (!h) throw new ToolError("hazard_not_found", `No hazard with id "${hazardId}" is loaded. Use get_visible_hazards to list current ids.`);
  return h;
}

function parseRegions(input: unknown, min = 1): Region[] {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? [input] : [];
  if (raw.length < min) throw new ToolError("invalid_input", `Provide at least ${min} region code(s) or name(s), e.g. ["BC", "WA"].`);
  return raw.map((r) => {
    const region = typeof r === "string" ? resolveRegion(r) : null;
    if (!region) throw new ToolError("invalid_region", `Unknown or ambiguous region "${String(r)}". Use a Canadian province/territory code (BC, AB, ON…) or a US state code (WA, OR, CA…); prefix with US- or CA- to disambiguate (e.g. US-CA).`);
    return region;
  });
}

function unionBbox(boxes: Bbox[]): Bbox {
  return [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
}

function countHazards(list: Hazard[]) {
  const c = { wildfires: 0, wildfiresOutOfControl: 0, wildfireHectaresReported: 0, weatherAlerts: 0, weatherAlertsSevereOrExtreme: 0, earthquakes: 0, significantEarthquakes: 0, largestEarthquakeMagnitude: null as number | null };
  for (const h of list) {
    if (h.type === "wildfire") {
      c.wildfires++;
      if (h.wildfire?.statusCode === "OC") c.wildfiresOutOfControl++;
      if (h.wildfire?.areaHectares != null) c.wildfireHectaresReported = round(c.wildfireHectaresReported + h.wildfire.areaHectares, 1);
    } else if (h.type === "weather") {
      c.weatherAlerts++;
      if (h.severity === "severe" || h.severity === "extreme") c.weatherAlertsSevereOrExtreme++;
    } else {
      c.earthquakes++;
      const m = h.earthquake?.magnitude;
      if (m != null && m >= SIGNIFICANT_MAGNITUDE) c.significantEarthquakes++;
      if (m != null && (c.largestEarthquakeMagnitude == null || m > c.largestEarthquakeMagnitude)) c.largestEarthquakeMagnitude = m;
    }
  }
  return c;
}

function hazardInRegion(h: Hazard, r: Region): boolean {
  if (h.country !== r.country) return false;
  return h.regionCode ? h.regionCode === r.code : bboxContains(r.bbox, h.longitude, h.latitude);
}

export const TOOL_SPECS: ToolSpec<any>[] = [
  {
    name: "get_current_view",
    readOnly: true,
    description:
      "Returns what the user currently sees in Nearcast: map centre, bounds, zoom, the active country/hazard-type/severity/magnitude filters, the selected hazard (if any), counts of hazards in view, and data freshness per source. Call this first to understand the shared state before changing it.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: (_input, store) => {
      const s = store.getState();
      const visible = selectVisibleHazards(s);
      const filtered = selectFilteredHazards(s);
      const selected = selectSelectedHazard(s);
      const byType = { wildfire: 0, weather: 0, earthquake: 0 };
      for (const h of visible) byType[h.type]++;
      const result = {
        map: { center: { longitude: round(s.view.center[0]), latitude: round(s.view.center[1]) }, zoom: round(s.view.zoom, 2), bounds: { west: round(s.view.bounds[0]), south: round(s.view.bounds[1]), east: round(s.view.bounds[2]), north: round(s.view.bounds[3]) } },
        filters: { countries: s.filters.countries, hazardTypes: s.filters.hazardTypes, minimumSeverity: s.filters.minimumSeverity ?? null, minimumEarthquakeMagnitude: s.filters.minimumEarthquakeMagnitude ?? null },
        selectedHazard: selected ? summarizeHazard(selected) : null,
        hazardsInView: { total: visible.length, ...byType },
        hazardsMatchingFilters: filtered.length,
        data: dataStatus(store),
      };
      return { result, summary: `${visible.length} hazards in view${selected ? `, selected ${selected.id}` : ""}` };
    },
  },
  {
    name: "get_visible_hazards",
    readOnly: true,
    description:
      "Returns the hazards currently visible in the user's Nearcast map after applying the active country, hazard type, severity, magnitude and geographic (map bounds) filters. Ordered by display significance. Concise records only; use get_hazard_details for full information.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Maximum number of hazards to return (default 50)." },
        hazardType: { type: "string", enum: HAZARD_TYPES, description: "Optionally restrict to one hazard type." },
      },
      additionalProperties: false,
    },
    run: (input: { limit?: number; hazardType?: HazardType }, store) => {
      requireData(store);
      const limit = Math.min(Math.max(Number(input?.limit) || 50, 1), 200);
      let visible = selectVisibleHazards(store.getState());
      if (input?.hazardType) {
        if (!HAZARD_TYPES.includes(input.hazardType)) throw new ToolError("invalid_input", `hazardType must be one of ${HAZARD_TYPES.join(", ")}.`);
        visible = visible.filter((h) => h.type === input.hazardType);
      }
      const result = { total: visible.length, returned: Math.min(limit, visible.length), hazards: visible.slice(0, limit).map(summarizeHazard), data: dataStatus(store) };
      return { result, summary: `${result.returned} of ${visible.length} visible${input?.hazardType ? ` (${input.hazardType})` : ""}` };
    },
  },
  {
    name: "set_focus_area",
    readOnly: false,
    description:
      "Moves the user's map. Provide ONE of: `regions` (province/territory or state codes such as [\"BC\",\"WA\"] — the map fits all of them), explicit `bounds` (west/south/east/north in degrees), or `latitude`+`longitude` with optional `zoom`. The map visibly animates and the shared view state updates.",
    inputSchema: {
      type: "object",
      properties: {
        regions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 10, description: "Region codes or names, e.g. [\"British Columbia\", \"WA\"]. Canadian provinces/territories and all US states are supported." },
        bounds: {
          type: "object",
          properties: { west: { type: "number" }, south: { type: "number" }, east: { type: "number" }, north: { type: "number" } },
          required: ["west", "south", "east", "north"],
          description: "Bounding box in WGS84 degrees.",
        },
        latitude: { type: "number", minimum: -90, maximum: 90 },
        longitude: { type: "number", minimum: -180, maximum: 180 },
        zoom: { type: "number", minimum: 1, maximum: 15, description: "Map zoom level when centering on a point (default 8)." },
      },
      additionalProperties: false,
    },
    run: (input: { regions?: string[]; bounds?: { west: number; south: number; east: number; north: number }; latitude?: number; longitude?: number; zoom?: number }, store) => {
      if (input?.regions) {
        const regions = parseRegions(input.regions);
        const bbox = unionBbox(regions.map((r) => r.bbox));
        store.focusBounds(bbox);
        const names = regions.map((r) => r.name).join(", ");
        return { result: { ok: true, focusedOn: regions.map((r) => ({ code: r.code, name: r.name, country: r.country })), bounds: { west: bbox[0], south: bbox[1], east: bbox[2], north: bbox[3] } }, summary: `→ ${names}` };
      }
      if (input?.bounds) {
        const b = input.bounds;
        const bbox: Bbox = [Number(b.west), Number(b.south), Number(b.east), Number(b.north)];
        if (bbox.some((n) => !Number.isFinite(n)) || !isValidBbox(bbox)) throw new ToolError("invalid_bounds", "bounds must satisfy west<east and south<north within [-180,180]/[-90,90].");
        store.focusBounds(bbox);
        return { result: { ok: true, bounds: b }, summary: `→ bounds ${bbox.map((n) => round(n, 2)).join(",")}` };
      }
      if (input?.latitude != null && input?.longitude != null) {
        const lat = Number(input.latitude), lon = Number(input.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new ToolError("invalid_input", "latitude/longitude out of range.");
        const zoom = Math.min(Math.max(Number(input.zoom) || 8, 1), 15);
        store.focusPoint([lon, lat], zoom);
        return { result: { ok: true, center: { latitude: lat, longitude: lon }, zoom }, summary: `→ ${round(lat, 2)}, ${round(lon, 2)} z${zoom}` };
      }
      throw new ToolError("invalid_input", "Provide regions, bounds, or latitude+longitude.");
    },
  },
  {
    name: "set_hazard_filters",
    readOnly: false,
    description:
      "Updates the hazard filters shared with the user (map and list update visibly). Only the provided fields change. `minimumSeverity` applies to weather alerts (agency-issued severity: info < minor < moderate < severe < extreme); `minimumEarthquakeMagnitude` applies to earthquakes. Wildfires are not filtered by severity. Pass null to clear a minimum.",
    inputSchema: {
      type: "object",
      properties: {
        countries: { type: "array", items: { type: "string", enum: COUNTRIES }, minItems: 1, description: "Countries to show, e.g. [\"CA\"] or [\"CA\",\"US\"]." },
        hazardTypes: { type: "array", items: { type: "string", enum: HAZARD_TYPES }, minItems: 1, description: "Hazard types to show." },
        minimumSeverity: { type: ["string", "null"], enum: [...SEVERITIES, null], description: "Minimum weather-alert severity, or null for all." },
        minimumEarthquakeMagnitude: { type: ["number", "null"], minimum: 0, maximum: 10, description: "Minimum earthquake magnitude, or null for all." },
      },
      additionalProperties: false,
    },
    run: (input: { countries?: CountryCode[]; hazardTypes?: HazardType[]; minimumSeverity?: HazardSeverity | null; minimumEarthquakeMagnitude?: number | null }, store) => {
      const patch: Parameters<Store["setFilters"]>[0] = {};
      if (input?.countries !== undefined) {
        if (!Array.isArray(input.countries) || input.countries.length === 0 || input.countries.some((c) => !COUNTRIES.includes(c))) throw new ToolError("unsupported_country", "countries must be a non-empty array containing only \"CA\" and/or \"US\".");
        patch.countries = input.countries;
      }
      if (input?.hazardTypes !== undefined) {
        if (!Array.isArray(input.hazardTypes) || input.hazardTypes.length === 0 || input.hazardTypes.some((t) => !HAZARD_TYPES.includes(t))) throw new ToolError("invalid_input", `hazardTypes must be a non-empty array of ${HAZARD_TYPES.join(", ")}.`);
        patch.hazardTypes = input.hazardTypes;
      }
      if (input?.minimumSeverity !== undefined) {
        if (input.minimumSeverity !== null && !SEVERITIES.includes(input.minimumSeverity)) throw new ToolError("invalid_input", `minimumSeverity must be one of ${SEVERITIES.join(", ")} or null.`);
        patch.minimumSeverity = input.minimumSeverity ?? undefined;
      }
      if (input?.minimumEarthquakeMagnitude !== undefined) {
        const m = input.minimumEarthquakeMagnitude;
        if (m !== null && (!Number.isFinite(Number(m)) || Number(m) < 0 || Number(m) > 10)) throw new ToolError("invalid_input", "minimumEarthquakeMagnitude must be a number between 0 and 10, or null.");
        patch.minimumEarthquakeMagnitude = m === null ? undefined : Number(m);
      }
      if (Object.keys(patch).length === 0) throw new ToolError("invalid_input", "Provide at least one of countries, hazardTypes, minimumSeverity, minimumEarthquakeMagnitude.");
      store.setFilters(patch);
      const s = store.getState();
      const visible = selectVisibleHazards(s).length;
      const matching = selectFilteredHazards(s).length;
      const f = s.filters;
      const result = { ok: true, filters: { countries: f.countries, hazardTypes: f.hazardTypes, minimumSeverity: f.minimumSeverity ?? null, minimumEarthquakeMagnitude: f.minimumEarthquakeMagnitude ?? null }, hazardsInView: visible, hazardsMatchingFilters: matching };
      const parts = [f.hazardTypes.join("+"), f.countries.join("+"), f.minimumSeverity && `≥${f.minimumSeverity}`, f.minimumEarthquakeMagnitude != null && `M≥${f.minimumEarthquakeMagnitude}`].filter(Boolean);
      return { result, summary: `→ ${parts.join(" · ")} (${visible} in view)` };
    },
  },
  {
    name: "focus_hazard",
    readOnly: false,
    description:
      "Selects one hazard for the user: highlights it on the map, pans/zooms to it and opens its details panel — the same selection a human makes by clicking a marker. Returns a concise summary of the hazard. Use get_hazard_details for the full record.",
    inputSchema: { type: "object", properties: { hazardId: { type: "string", description: "Nearcast hazard id, e.g. \"usgs:us7000abcd\" or \"eccc:…\"." } }, required: ["hazardId"], additionalProperties: false },
    run: (input: { hazardId: string }, store) => {
      const h = findHazard(store, input?.hazardId);
      store.focusHazard(h.id);
      return { result: { ok: true, hazard: summarizeHazard(h) }, summary: `→ ${h.id}` };
    },
  },
  {
    name: "get_hazard_details",
    readOnly: true,
    description:
      "Returns the complete normalized record for one hazard: description, agency-issued classifications, timestamps, measurements (magnitude, hectares, containment…), issuing agency and the official source link. Does not change the user's view.",
    inputSchema: { type: "object", properties: { hazardId: { type: "string", description: "Nearcast hazard id." } }, required: ["hazardId"], additionalProperties: false },
    run: (input: { hazardId: string }, store) => {
      const h = findHazard(store, input?.hazardId);
      const { geometry, ...rest } = h;
      const result = { ...rest, geometryType: geometry.type, attribution: { agency: h.source.agency, officialUrl: h.source.url ?? null, updatedAt: h.updatedAt ?? null, note: "Display significance is computed by Nearcast for styling; 'severity' is translated from the agency's classification when one exists." } };
      return { result, summary: h.id };
    },
  },
  {
    name: "compare_regions",
    readOnly: true,
    description:
      "Deterministically compares two or more Canadian provinces/territories and/or US states using all currently loaded hazards (current filters are NOT applied): wildfire count, out-of-control wildfires, reported hectares, weather alert counts, earthquake counts and significant (M4.0+) earthquakes. Counts only; no safety judgements.",
    inputSchema: {
      type: "object",
      properties: { regions: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 8, description: "Region codes or names, e.g. [\"BC\", \"WA\"] or [\"Alberta\", \"British Columbia\"]." } },
      required: ["regions"],
      additionalProperties: false,
    },
    run: (input: { regions: string[] }, store) => {
      const regions = parseRegions(input?.regions, 2);
      requireData(store);
      const hazards = store.getState().hazards;
      const comparison = regions.map((r) => ({ code: r.code, name: r.name, country: r.country, ...countHazards(hazards.filter((h) => hazardInRegion(h, r))) }));
      const result = { basis: "All currently loaded hazards; active UI filters not applied. Region assignment uses agency-reported region codes, falling back to approximate bounding boxes.", comparison, data: dataStatus(store) };
      return { result, summary: regions.map((r) => r.code).join(" vs ") };
    },
  },
  {
    name: "create_situation_context",
    readOnly: true,
    description:
      "Returns a structured, deterministic situation snapshot for an area — the current map view by default, or the given regions — listing the most significant wildfires, weather alerts and earthquakes with counts and source status. Nearcast supplies facts; the agent writes any narrative. No safety conclusions are included.",
    inputSchema: {
      type: "object",
      properties: {
        regions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8, description: "Optional region codes/names. Omit to use the user's current map view and filters." },
        maxPerType: { type: "integer", minimum: 1, maximum: 25, description: "Max hazards listed per type (default 8)." },
      },
      additionalProperties: false,
    },
    run: (input: { regions?: string[]; maxPerType?: number }, store) => {
      requireData(store);
      const s = store.getState();
      const max = Math.min(Math.max(Number(input?.maxPerType) || 8, 1), 25);
      let area: string;
      let list: Hazard[];
      if (input?.regions) {
        const regions = parseRegions(input.regions);
        list = s.hazards.filter((h) => regions.some((r) => hazardInRegion(h, r))).sort(bySignificance);
        area = regions.map((r) => `${r.name} (${r.country})`).join(", ");
      } else {
        list = selectVisibleHazards(s);
        area = "current map view with active filters";
      }
      const pick = (t: HazardType) => list.filter((h) => h.type === t).slice(0, max).map(summarizeHazard);
      const result = { area, generatedAt: new Date().toISOString(), counts: countHazards(list), wildfires: pick("wildfire"), weatherAlerts: pick("weather"), earthquakes: pick("earthquake"), sourceStatus: dataStatus(store).sources, dataRetrievedAt: s.retrievedAt ?? null, demoData: s.mock };
      return { result, summary: `${area} · ${list.length} hazards` };
    },
  },
];

export function toolResult(payload: unknown, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(payload) }], ...(isError ? { isError: true } : {}) };
}

/** Wrap a spec into a WebMCP tool definition bound to the shared store. Never throws. */
export function bindTool(spec: ToolSpec<any>, store: Store): ModelContextToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    annotations: { readOnlyHint: spec.readOnly },
    execute: async (input: Record<string, unknown>) => {
      try {
        const { result, summary } = spec.run(input ?? {}, store);
        store.logActivity(spec.name, summary, true);
        return toolResult(result);
      } catch (e) {
        const err = e instanceof ToolError ? { code: e.code, message: e.message } : { code: "tool_error", message: e instanceof Error ? e.message : "Unexpected error" };
        store.logActivity(spec.name, `✗ ${err.code}: ${err.message}`, false);
        return toolResult({ ok: false, error: err }, true);
      }
    },
  };
}

export function createTools(store: Store): ModelContextToolDefinition[] {
  return TOOL_SPECS.map((spec) => bindTool(spec, store));
}

export const TOOL_NAMES = TOOL_SPECS.map((t) => t.name);
export const REGION_CODES = REGIONS.map((r) => `${r.country}-${r.code}`);
