import { describe, expect, it } from "vitest";
import type { FeatureCollection } from "geojson";
import { parseUsgs } from "../adapters/us/earthquakes.ts";
import { parseNws, approximatePoint } from "../adapters/us/weather.ts";
import { parseNifc } from "../adapters/us/wildfires.ts";
import { parseEccc } from "../adapters/canada/weather.ts";
import { parseCwfif, cwfifUrl } from "../adapters/canada/wildfires.ts";
import { parseNrcan } from "../adapters/canada/earthquakes.ts";
import usgsFixture from "./fixtures/usgs.json";
import nwsFixture from "./fixtures/nws.json";
import nifcFixture from "./fixtures/nifc.json";
import ecccFixture from "./fixtures/eccc.json";
import cwfifFixture from "./fixtures/cwfif.json";
import { readFileSync } from "node:fs";

const NOW = new Date("2026-09-03T05:00:00Z");
const nrcanText = readFileSync(new URL("./fixtures/nrcan.txt", import.meta.url), "utf8");

describe("USGS adapter", () => {
  it("normalizes US earthquakes and drops non-CA/US events", () => {
    const { hazards, sourceUpdatedAt } = parseUsgs(usgsFixture as unknown as FeatureCollection);
    expect(hazards.length).toBe(2); // Nevada + Alaska; Mexico dropped
    const nv = hazards.find((h) => h.regionCode === "NV")!;
    expect(nv.id).toMatch(/^usgs:/);
    expect(nv.type).toBe("earthquake");
    expect(nv.country).toBe("US");
    expect(nv.earthquake?.magnitude).toBeTypeOf("number");
    expect(nv.severity).toBe("unknown"); // magnitude is not government severity
    expect(nv.source.id).toBe("usgs");
    expect(nv.source.url).toContain("earthquake.usgs.gov");
    expect(sourceUpdatedAt).toMatch(/^\d{4}-/);
  });
  it("tolerates malformed features", () => {
    const bad = { type: "FeatureCollection", features: [{ type: "Feature", properties: null, geometry: null }, { type: "Feature", id: "x", properties: { type: "earthquake" }, geometry: { type: "Point", coordinates: [] } }] };
    expect(parseUsgs(bad as unknown as FeatureCollection).hazards).toEqual([]);
  });
});

describe("NWS adapter", () => {
  it("keeps polygon alerts as exact and places zone alerts at county centroids", () => {
    const { hazards } = parseNws(nwsFixture as unknown as FeatureCollection, NOW);
    expect(hazards.length).toBe(4); // 2 polygon + 2 zone; Test Message dropped
    const exact = hazards.filter((h) => h.locationPrecision === "exact");
    const approx = hazards.filter((h) => h.locationPrecision === "approximate");
    expect(exact.length).toBe(2);
    expect(approx.length).toBe(2);
    expect(exact[0].geometry.type).toBe("Polygon");
    expect(approx[0].geometry.type).toBe("Point");
    expect(approx[0].regionCode).toMatch(/^[A-Z]{2}$/);
    for (const h of hazards) {
      expect(h.id).toMatch(/^nws:/);
      expect(["minor", "moderate", "severe", "extreme", "unknown"]).toContain(h.severity);
      expect(h.rawSeverity).toBeDefined();
      expect(h.weather?.event).toBeDefined();
    }
  });
  it("drops expired alerts", () => {
    const { hazards } = parseNws(nwsFixture as unknown as FeatureCollection, new Date("2027-01-01T00:00:00Z"));
    expect(hazards.length).toBe(0);
  });
  it("returns null centroid for unknown county codes", () => {
    expect(approximatePoint(["999999"])).toBeNull();
    expect(approximatePoint(["039065"])).not.toBeNull();
  });
});

describe("NIFC adapter", () => {
  it("normalizes acres to hectares and only keeps active WF incidents", () => {
    const { hazards } = parseNifc(nifcFixture as unknown as FeatureCollection);
    for (const h of hazards) {
      expect(h.type).toBe("wildfire");
      expect(h.country).toBe("US");
      expect(h.id).toMatch(/^nifc:/);
      if (h.wildfire?.areaAcres != null) expect(h.wildfire.areaHectares).toBeCloseTo(h.wildfire.areaAcres * 0.404686, 0);
    }
    expect(hazards.every((h) => h.title.endsWith("Fire"))).toBe(true);
  });
});

describe("ECCC adapter", () => {
  it("translates alert tiers into severity and skips ended alerts", () => {
    const { hazards } = parseEccc(ecccFixture as unknown as FeatureCollection, new Date("2026-09-03T04:00:00Z"));
    expect(hazards.length).toBe(3);
    for (const h of hazards) {
      expect(h.id).toMatch(/^eccc:/);
      expect(h.country).toBe("CA");
      expect(["BC", "NB"]).toContain(h.regionCode);
      expect(h.severity).toBe("info"); // statements
      expect(h.rawSeverity).toContain("statement");
      expect(["Polygon", "MultiPolygon"]).toContain(h.geometry.type);
      expect(h.latitude).toBeGreaterThan(40);
    }
  });
});

describe("CWFIF adapter", () => {
  it("builds a current-only filtered URL", () => {
    const url = cwfifUrl(NOW);
    expect(url).toContain("cwfif_national_activefires");
    expect(decodeURIComponent(url)).toContain("record_end > '2026-09-03T05:00:00Z'");
  });
  it("maps stage of control to status and severity", () => {
    const { hazards } = parseCwfif(cwfifFixture as unknown as FeatureCollection);
    expect(hazards.length).toBe(4);
    const oc = hazards.find((h) => h.wildfire?.statusCode === "OC")!;
    expect(oc.severity).toBe("severe");
    expect(oc.wildfire?.status).toBe("Out of control");
    const pc = hazards.find((h) => h.wildfire?.agency === "Parks Canada")!;
    expect(pc.regionCode).toBeDefined(); // located by coordinates
    for (const h of hazards) {
      expect(h.id).toMatch(/^cwfis:/);
      expect(h.longitude).toBeLessThan(-50); // WGS84, not EPSG:3978 metres
    }
  });
});

describe("NRCan adapter", () => {
  it("parses pipe-delimited text and keeps only Canadian events", () => {
    const { hazards } = parseNrcan(nrcanText);
    expect(hazards.length).toBeGreaterThan(0);
    expect(hazards.every((h) => h.country === "CA")).toBe(true);
    expect(hazards.find((h) => h.title.includes("Sitka"))).toBeUndefined(); // AK event left to USGS
    const yt = hazards.find((h) => h.regionCode === "YT")!;
    expect(yt.earthquake?.magnitude).toBeCloseTo(2.62, 2);
    expect(yt.startedAt).toBe("2026-09-01T20:24:29.000Z");
  });
  it("ignores garbage lines", () => {
    expect(parseNrcan("#header\nnot|enough|fields\n\n").hazards).toEqual([]);
  });
});
