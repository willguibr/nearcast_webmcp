import { describe, expect, it } from "vitest";
import type { Hazard } from "@nearcast/shared";
import { applyFilters, parseFilters } from "../services/filters.ts";
import { computeSummary } from "../services/summary.ts";
import { loadHazards, clearSnapshotCache } from "../services/hazard-service.ts";
import { createHandler } from "../handlers/api.ts";
import type { SourceAdapter } from "../domain/hazard.ts";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

function hazard(partial: Partial<Hazard> & Pick<Hazard, "id" | "type" | "country" | "latitude" | "longitude">): Hazard {
  return {
    title: partial.id, severity: "unknown", significance: "low", locationPrecision: "exact",
    geometry: { type: "Point", coordinates: [partial.longitude, partial.latitude] },
    source: { id: "mock", agency: "Mock", country: partial.country },
    ...partial,
  };
}

const H: Hazard[] = [
  hazard({ id: "cwfis:1", type: "wildfire", country: "CA", regionCode: "BC", latitude: 50.5, longitude: -121, significance: "high", wildfire: { statusCode: "OC", areaHectares: 1200 } }),
  hazard({ id: "nifc:1", type: "wildfire", country: "US", regionCode: "WA", latitude: 47.5, longitude: -120.5, wildfire: { areaHectares: 40 } }),
  hazard({ id: "eccc:1", type: "weather", country: "CA", regionCode: "BC", latitude: 49.2, longitude: -123.1, severity: "severe", significance: "high" }),
  hazard({ id: "nws:1", type: "weather", country: "US", regionCode: "WA", latitude: 47.6, longitude: -122.3, severity: "minor" }),
  hazard({ id: "usgs:1", type: "earthquake", country: "US", regionCode: "AK", latitude: 61, longitude: -150, earthquake: { magnitude: 4.6 }, significance: "moderate" }),
  hazard({ id: "nrcan:1", type: "earthquake", country: "CA", latitude: 49.0, longitude: -128.0, earthquake: { magnitude: 3.1 } }),
];

describe("parseFilters", () => {
  it("accepts valid filters", () => {
    const r = parseFilters({ type: "wildfire,weather", country: "ca", region: "BC", minSeverity: "moderate", minMagnitude: "4", bbox: "-130,45,-110,60", limit: "10" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.filters.type).toEqual(["wildfire", "weather"]);
      expect(r.filters.country).toEqual(["CA"]);
      expect(r.filters.region).toEqual(["CA-BC"]);
      expect(r.filters.bbox).toEqual([-130, 45, -110, 60]);
      expect(r.filters.limit).toBe(10);
    }
  });
  it("rejects malformed input with actionable messages", () => {
    const r = parseFilters({ bbox: "1,2,3", type: "volcano", country: "MX", region: "ZZ", limit: "99999", minMagnitude: "abc" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(/bbox/);
      expect(r.errors.join("\n")).toMatch(/volcano/);
      expect(r.errors.join("\n")).toMatch(/MX/);
      expect(r.errors.join("\n")).toMatch(/ZZ/);
      expect(r.errors.join("\n")).toMatch(/limit/);
      expect(r.errors.join("\n")).toMatch(/minMagnitude/);
    }
  });
  it("rejects inverted bbox", () => {
    expect(parseFilters({ bbox: "-110,60,-130,45" }).ok).toBe(false);
  });
});

describe("applyFilters", () => {
  it("filters by type, country and region", () => {
    const p = parseFilters({ type: "wildfire", country: "CA" });
    if (!p.ok) throw new Error();
    expect(applyFilters(H, p.filters, p.regions).data.map((h) => h.id)).toEqual(["cwfis:1"]);
    const r = parseFilters({ region: "WA" });
    if (!r.ok) throw new Error();
    expect(applyFilters(H, r.filters, r.regions).data.map((h) => h.id).sort()).toEqual(["nifc:1", "nws:1"]);
  });
  it("applies bbox to all types and magnitude to earthquakes only", () => {
    expect(applyFilters(H, { bbox: [-125, 48, -119, 51] }).data.map((h) => h.id).sort()).toEqual(["cwfis:1", "eccc:1"]);
    const m = applyFilters(H, { minMagnitude: 4 });
    expect(m.data.map((h) => h.id)).toContain("usgs:1");
    expect(m.data.map((h) => h.id)).not.toContain("nrcan:1");
    expect(m.data.map((h) => h.id)).toContain("cwfis:1"); // non-earthquakes untouched
  });
  it("applies minSeverity to weather alerts only", () => {
    const s = applyFilters(H, { minSeverity: "moderate" });
    expect(s.data.map((h) => h.id)).toContain("eccc:1");
    expect(s.data.map((h) => h.id)).not.toContain("nws:1");
    expect(s.data.map((h) => h.id)).toContain("nifc:1");
  });
  it("orders by significance and honours limit + total", () => {
    const r = applyFilters(H, { limit: 2 });
    expect(r.total).toBe(6);
    expect(r.data.length).toBe(2);
    expect(r.data.every((h) => h.significance === "high")).toBe(true);
  });
  it("regions without a regionCode fall back to bbox containment", () => {
    const p = parseFilters({ region: "BC" });
    if (!p.ok) throw new Error();
    expect(applyFilters(H, p.filters, p.regions).data.map((h) => h.id).sort()).toEqual(["cwfis:1", "eccc:1", "nrcan:1"]);
  });
});

describe("computeSummary", () => {
  it("counts deterministically per country and region", () => {
    const s = computeSummary(H, [], "2026-09-03T00:00:00Z");
    expect(s.countries.CA).toMatchObject({ wildfires: 1, weatherAlerts: 1, earthquakes: 1, significantEarthquakes: 0, wildfiresOutOfControl: 1, wildfireHectaresReported: 1200 });
    expect(s.countries.US).toMatchObject({ wildfires: 1, weatherAlerts: 1, earthquakes: 1, significantEarthquakes: 1 });
    expect(s.regions["CA-BC"].wildfires).toBe(1);
    expect(s.regions["US-AK"].significantEarthquakes).toBe(1);
  });
});

const okAdapter: SourceAdapter = { id: "usgs", agency: "A", country: "US", fetch: async () => ({ hazards: [H[4]] }) };
const failAdapter: SourceAdapter = { id: "cwfis", agency: "B", country: "CA", fetch: async () => { throw new Error("HTTP 503"); } };
const slowAdapter: SourceAdapter = { id: "nws", agency: "C", country: "US", fetch: async ({ timeoutMs }) => { throw Object.assign(new Error("timeout"), { name: "AbortError" }); } };

describe("loadHazards", () => {
  it("keeps working when some sources fail", async () => {
    clearSnapshotCache();
    const snap = await loadHazards({ adapters: [okAdapter, failAdapter, slowAdapter], cacheTtlMs: 0 });
    expect(snap.hazards.length).toBe(1);
    expect(snap.sources.map((s) => [s.id, s.status])).toEqual([["usgs", "available"], ["cwfis", "error"], ["nws", "timeout"]]);
    expect(snap.sources[1].error).toContain("503");
    expect(snap.retrievedAt).toMatch(/Z$/);
  });
});

function ev(path: string, query: Record<string, string> = {}, method = "GET"): APIGatewayProxyEventV2 {
  return { rawPath: path, queryStringParameters: query, requestContext: { http: { method }, requestId: "t" } } as unknown as APIGatewayProxyEventV2;
}

describe("API handler", () => {
  const handler = createHandler({ adapters: [okAdapter, failAdapter] });
  it("serves health without touching sources", async () => {
    const r = await handler(ev("/api/health"));
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body!)).toMatchObject({ status: "ok", service: "nearcast-api" });
    expect(r.headers!["cache-control"]).toBe("no-store");
  });
  it("returns hazards with source metadata despite a failing source", async () => {
    clearSnapshotCache();
    const r = await handler(ev("/api/hazards", { country: "US" }));
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body!);
    expect(body.meta.count).toBe(1);
    expect(body.meta.sources.find((s: { id: string }) => s.id === "cwfis").status).toBe("error");
    expect(body.meta.retrievedAt).toBeDefined();
    expect(r.headers!["cache-control"]).toContain("max-age=");
  });
  it("returns 400 for malformed queries", async () => {
    const r = await handler(ev("/api/hazards", { bbox: "nope" }));
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body!).error.code).toBe("invalid_request");
  });
  it("serves summary and single hazards, 404 otherwise", async () => {
    expect((await handler(ev("/api/hazards/summary"))).statusCode).toBe(200);
    const one = await handler(ev("/api/hazards/usgs%3A1"));
    expect(one.statusCode).toBe(200);
    expect(JSON.parse(one.body!).data.id).toBe("usgs:1");
    expect((await handler(ev("/api/hazards/nope:1"))).statusCode).toBe(404);
    expect((await handler(ev("/api/unknown"))).statusCode).toBe(404);
    expect((await handler(ev("/api/hazards", {}, "POST"))).statusCode).toBe(405);
  });
});
