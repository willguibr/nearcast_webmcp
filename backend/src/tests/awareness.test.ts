import { afterEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { parseAirQuality, parseEvacuations, parseRoads, parseCameras, AWARENESS_ADAPTERS, type AwarenessAdapter } from "../adapters/canada/awareness.ts";
import { createAwarenessLoader } from "../services/awareness-service.ts";
import { createHandler } from "../handlers/api.ts";

const now = new Date("2026-10-14T12:00:00Z");
const geometry = { type: "Polygon", coordinates: [[[-124,49],[-122,49],[-122,51],[-124,51],[-124,49]], [[-123.8,49.2],[-123.6,49.2],[-123.6,49.4],[-123.8,49.4],[-123.8,49.2]]] };
const fc = (features: unknown[]) => ({ type: "FeatureCollection", features });
const evacuation = (patch = {}) => ({ type: "Feature", geometry, properties: { EMRG_OAA_SYSID: 42, ORDER_ALERT_NAME: "Synthetic notice", ORDER_ALERT_STATUS: "Order", ISSUING_AGENCY: "Test authority", DATE_MODIFIED: now.getTime(), ...patch } });
const aqhi = (patch = {}) => ({ type: "Feature", geometry: { type: "Point", coordinates: [-123.1,49.2] }, properties: { location_id: "TEST", location_name_en: "Test station", aqhi: 6.6, observation_datetime: now.toISOString(), ...patch } });
const camera = (patch = {}) => ({ id: 12, name: "Test camera", is_on: true, should_appear: true, location: { type: "Point", coordinates: [-123.1,49.2] }, links: { imageDisplay: "/images/12.jpg" }, last_update_modified: now.toISOString(), ...patch });
afterEach(() => vi.unstubAllGlobals());

describe("new public-feed adapters", () => {
  it("preserves AQHI rounding, 10+, station identity, notes and observation time", () => {
    expect(parseAirQuality(fc([aqhi()])).items[0]).toMatchObject({ aqhi: 7, displayValue: "7", category: "High", updatedAt: now.toISOString(), stationId: "TEST" });
    expect(parseAirQuality(fc([aqhi({ aqhi: "10+" })])).items[0]).toMatchObject({ displayValue: "10+", category: "Very high" });
    expect(parseAirQuality(fc([aqhi({ aqhi: "2.1", observation_datetime: undefined })])).items[0]).toMatchObject({ aqhi: 2, updatedAt: undefined });
  });
  it("reports malformed data instead of making missing observations look like clean air", () => {
    expect(() => parseAirQuality(fc([aqhi({ aqhi: null })]))).toThrow(/No records/);
    const parsed = parseAirQuality(fc([aqhi(), aqhi({ location_id: "missing", aqhi: "" })]));
    expect(parsed.items).toHaveLength(1); expect(parsed.rejectedCount).toBe(1);
    expect(() => parseAirQuality({ error: "changed schema" })).toThrow(/GeoJSON/);
  });
  it("distinguishes order, alert, unknown, rescinded and old/undated records without losing polygon holes", () => {
    const parsed = parseEvacuations(fc([
      evacuation(), evacuation({ EMRG_OAA_SYSID: 2, ORDER_ALERT_STATUS: "Evacuation Alert" }),
      evacuation({ EMRG_OAA_SYSID: 3, ORDER_ALERT_STATUS: "PREPARE_NOW" }),
      evacuation({ EMRG_OAA_SYSID: 4, ORDER_ALERT_STATUS: "Evacuation Order Rescinded" }),
      evacuation({ EMRG_OAA_SYSID: 5, DATE_MODIFIED: Date.parse("2023-01-01") }),
      evacuation({ EMRG_OAA_SYSID: 6, DATE_MODIFIED: null }),
    ]), now);
    expect(parsed.items).toHaveLength(5);
    expect(parsed.items[0]).toMatchObject({ stage: "order", olderRecord: false, geometry });
    expect(parsed.items[1]).toMatchObject({ stage: "alert" });
    expect(parsed.items[2]).toMatchObject({ stage: "unknown", rawStage: "PREPARE_NOW" });
    expect(parsed.items[3]).toMatchObject({ olderRecord: true });
    expect(parsed.items[4]).toMatchObject({ olderRecord: true, updatedAt: undefined });
    expect(parseEvacuations(fc([]), now)).toEqual({ items: [], rejectedCount: 0 });
  });
  it("retains full road segments, road state and schedules; excludes archived records", () => {
    const event = { id: "drivebc.ca/test", status: "ACTIVE", geography: { type: "LineString", coordinates: [[-124,50],[-122,50]] }, severity: "MAJOR", roads: [{ name: "Test road", state: "CLOSED", direction: "BOTH" }], schedule: { intervals: ["2026-10-14T00:00/2026-10-15T00:00"] } };
    const parsed = parseRoads({ events: [event, { ...event, id: "old", status: "ARCHIVED" }] });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({ geometry: event.geography, roads: event.roads, intervals: event.schedule.intervals, updatedAt: undefined });
    expect(() => parseRoads({ events: [{ ...event, status: "MYSTERY" }] })).toThrow(/No records/);
  });
  it("does not embed arbitrary camera URLs or use an attempted refresh as a new image timestamp", () => {
    const parsed = parseCameras([camera({ marked_stale: true }), camera({ id: 13, is_on: false }), camera({ id: 14, links: { imageDisplay: "https://tracker.invalid/photo" } })]);
    expect(parsed.items).toHaveLength(1); expect(parsed.rejectedCount).toBe(1);
    expect(parsed.items[0]).toMatchObject({ imageUrl: "https://www.drivebc.ca/images/12.jpg", markedStale: true });
    expect(parseCameras([camera({ last_update_modified: undefined, last_update_attempt: now.toISOString() })]).items[0].updatedAt).toBeUndefined();
    expect(() => parseCameras([camera({ links: { imageDisplay: "javascript:alert(1)" } })])).toThrow();
  });
  it("follows AQHI pagination and reports both pages", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ...fc([aqhi()]), links: [{ rel: "next", href: "https://api.weather.gc.ca/page2" }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify(fc([aqhi({ location_id: "SECOND" })]))));
    vi.stubGlobal("fetch", request);
    const result = await AWARENESS_ADAPTERS[0].fetch(now, new AbortController().signal);
    expect(result.items).toHaveLength(2); expect(request).toHaveBeenCalledTimes(2);
  });
  it("rejects unexpected pagination destinations", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...fc([aqhi()]), links: [{ rel: "next", href: "https://untrusted.invalid/" }] }))));
    await expect(AWARENESS_ADAPTERS[0].fetch(now, new AbortController().signal)).rejects.toThrow(/pagination/);
  });
});

describe("independent feed caching and failure reporting", () => {
  const data = parseAirQuality(fc([aqhi()]));
  function adapter(fetch: AwarenessAdapter["fetch"]): AwarenessAdapter { return { ...AWARENESS_ADAPTERS[0], ttlMs: 1000, fetch }; }
  it("returns stale data on failure, preserves retrieval time and withholds it after 30 minutes", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(data).mockRejectedValue(new Error("offline"));
    const load = createAwarenessLoader([adapter(fetch)]);
    await load(now);
    const cached = await load(new Date(now.getTime() + 500)); expect(fetch).toHaveBeenCalledTimes(1);
    expect(cached.sources[0].status).toBe("available");
    const stale = await load(new Date(now.getTime() + 2000));
    expect(stale.items).toHaveLength(1); expect(stale.sources[0]).toMatchObject({ status: "stale", retrievedAt: now.toISOString() });
    const expired = await load(new Date(now.getTime() + 1800_001));
    expect(expired.items).toHaveLength(0); expect(expired.sources[0].status).toBe("error");
  });
  it("does not resurrect ended records after a successful empty snapshot", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(data).mockResolvedValueOnce({ items: [], rejectedCount: 0 }).mockRejectedValue(new Error("offline"));
    const load = createAwarenessLoader([adapter(fetch)]);
    await load(now); await load(new Date(now.getTime() + 2000));
    const failed = await load(new Date(now.getTime() + 4000));
    expect(failed.items).toHaveLength(0); expect(failed.sources[0].status).toBe("stale");
  });
  it("isolates failures and identifies partially parsed feeds", async () => {
    const load = createAwarenessLoader([adapter(async () => ({ ...data, rejectedCount: 2 })), { ...AWARENESS_ADAPTERS[1], fetch: async () => { throw new Error("unavailable"); } }]);
    const result = await load(now);
    expect(result.items).toHaveLength(1);
    expect(result.sources.map((s) => s.status)).toEqual(["partial", "error"]);
  });
  it("coalesces simultaneous requests rather than re-fetching feeds", async () => {
    const fetch = vi.fn(async () => data), load = createAwarenessLoader([adapter(fetch)]);
    await Promise.all([load(now), load(now)]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("serves the additive endpoint with coverage and supports HEAD", async () => {
    const awarenessLoader = createAwarenessLoader([adapter(async () => data)]);
    const handler = createHandler({ awarenessLoader });
    const event = (method: string) => ({ rawPath: "/api/awareness", requestContext: { http: { method } } }) as APIGatewayProxyEventV2;
    const response = await handler(event("GET"));
    expect(response.statusCode).toBe(200); expect(JSON.parse(response.body!).sources[0].coverage).toContain("Canadian");
    expect((await handler(event("HEAD"))).body).toBe("");
    expect((await handler(event("POST"))).statusCode).toBe(405);
  });
});
