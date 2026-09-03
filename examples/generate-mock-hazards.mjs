// Deterministic synthetic hazard fixtures for demo/mock mode. Run: node examples/generate-mock-hazards.mjs
// These are NOT real events. Every record is marked source.id = "mock".
import { writeFileSync } from "node:fs";

const T = "2026-09-02T18:00:00.000Z";
const src = (agency, country) => ({ id: "mock", agency: `${agency} (DEMO DATA)`, country, url: "https://github.com/SecurityGeekIO/nearcast-webmcp#mock-data-mode" });
const pt = (lon, lat) => ({ type: "Point", coordinates: [lon, lat] });
const box = (w, s, e, n) => ({ type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });

const fireSig = (ha, code) => (code === "OC" && ha >= 100) || ha >= 1000 ? "high" : ha >= 100 || code === "OC" ? "moderate" : "low";
const stage = { OC: ["Out of control", "severe"], BH: ["Being held", "moderate"], UC: ["Under control", "minor"] };

function caFire(n, id, lon, lat, region, code, ha, name) {
  const [label, severity] = stage[code];
  return {
    id: `mock:cwfis:${id}`, type: "wildfire", country: "CA", regionCode: region, regionName: n,
    title: `Fire ${id} (${region})${name ? ` — ${name}` : ""}`, description: `${label} · ${ha} ha · DEMO DATA`,
    severity, rawSeverity: `stage_of_control=${code}`, significance: fireSig(ha, code),
    geometry: pt(lon, lat), latitude: lat, longitude: lon, locationPrecision: "exact",
    startedAt: "2026-08-20T10:00:00.000Z", updatedAt: T, source: src("CWFIS mock", "CA"),
    wildfire: { status: label, statusCode: code, areaHectares: ha, agency: region, cause: code === "OC" ? "Lightning (natural)" : "Unknown" },
  };
}
function usFire(n, id, lon, lat, region, acres, contained, name, behaviour) {
  const ha = Math.round(acres * 0.404686 * 10) / 10;
  return {
    id: `mock:nifc:${id}`, type: "wildfire", country: "US", regionCode: region, regionName: n,
    title: `${name} Fire`, description: `Demo incident near ${n}`, severity: "unknown", rawSeverity: behaviour, significance: fireSig(ha),
    geometry: pt(lon, lat), latitude: lat, longitude: lon, locationPrecision: "exact",
    startedAt: "2026-08-15T16:30:00.000Z", updatedAt: T, source: src("NIFC WFIGS mock", "US"),
    wildfire: { status: `Fire behaviour: ${behaviour}`, areaAcres: acres, areaHectares: ha, containmentPercent: contained, agency: "USFS", behaviour },
  };
}
const wxSig = (s) => (s === "severe" || s === "extreme" ? "high" : s === "moderate" ? "moderate" : "low");
function caWx(id, tier, name, area, region, regionName, b) {
  const sev = { warning: "severe", watch: "moderate", advisory: "minor", statement: "info" }[tier];
  const [lon, lat] = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  return {
    id: `mock:eccc:${id}`, type: "weather", country: "CA", regionCode: region, regionName,
    title: `${name} — ${area}`, description: `Demo ${tier} for ${area}. DEMO DATA.`, severity: sev, rawSeverity: tier, significance: wxSig(sev),
    geometry: box(...b), latitude: lat, longitude: lon, locationPrecision: "exact",
    startedAt: "2026-09-02T12:00:00.000Z", updatedAt: T, expiresAt: "2026-09-03T12:00:00.000Z", source: src("ECCC mock", "CA"),
    weather: { event: name.toLowerCase(), headline: `${name} in effect for ${area}`, areaDescription: area, sender: "ECCC (demo)", status: "issued" },
  };
}
function usWx(id, event, capSev, urgency, area, region, regionName, geom, lon, lat, precision = "exact") {
  const sev = capSev.toLowerCase();
  return {
    id: `mock:nws:${id}`, type: "weather", country: "US", regionCode: region, regionName,
    title: event, description: `Demo ${event} for ${area}. DEMO DATA.`, severity: sev, rawSeverity: capSev, significance: wxSig(sev),
    geometry: geom, latitude: lat, longitude: lon, locationPrecision: precision,
    startedAt: "2026-09-02T14:00:00.000Z", updatedAt: T, expiresAt: "2026-09-03T02:00:00.000Z", source: src("NWS mock", "US"),
    weather: { event, urgency, certainty: "Likely", instruction: "Follow instructions from local emergency authorities.", headline: `${event} for ${area}`, areaDescription: area, sender: "NWS (demo)", status: "Actual" },
  };
}
const eqSig = (m) => (m >= 5 ? "high" : m >= 4 ? "moderate" : "low");
function eq(sourceId, id, lon, lat, mag, depth, place, country, region, regionName, t) {
  return {
    id: `mock:${sourceId}:${id}`, type: "earthquake", country, regionCode: region, regionName,
    title: `M ${mag.toFixed(1)} - ${place}`, description: place, severity: "unknown", significance: eqSig(mag),
    geometry: pt(lon, lat), latitude: lat, longitude: lon, locationPrecision: "exact",
    startedAt: t, updatedAt: t, source: src(sourceId === "usgs" ? "USGS mock" : "Earthquakes Canada mock", country),
    earthquake: { magnitude: mag, magnitudeType: "ML", depthKm: depth },
  };
}

const data = [
  caFire("British Columbia", "K71234", -120.85, 50.95, "BC", "OC", 3400, "Demo Ridge"),
  caFire("British Columbia", "V82201", -125.4, 54.2, "BC", "OC", 12800),
  caFire("British Columbia", "C10877", -122.3, 52.1, "BC", "BH", 640),
  caFire("British Columbia", "N51122", -119.9, 49.6, "BC", "UC", 12),
  caFire("British Columbia", "G90011", -128.6, 56.3, "BC", "OC", 210),
  caFire("Alberta", "HWF042", -117.2, 55.8, "AB", "OC", 5100),
  caFire("Alberta", "EWF118", -111.9, 57.1, "AB", "BH", 900),
  caFire("Alberta", "CWF033", -114.5, 51.4, "AB", "UC", 3),
  caFire("Saskatchewan", "SWF210", -105.8, 55.6, "SK", "OC", 22000),
  caFire("Manitoba", "WE031", -98.9, 54.7, "MB", "BH", 1500),
  caFire("Ontario", "RED052", -93.6, 50.9, "ON", "OC", 780),
  caFire("Quebec", "QC341", -74.2, 49.3, "QC", "UC", 45),
  caFire("Yukon", "YT019", -135.1, 62.4, "YT", "OC", 3300),
  caFire("Northwest Territories", "NT044", -114.9, 62.9, "NT", "BH", 2100),
  usFire("Washington", "2026-WAOWF-000311", -120.6, 48.4, "WA", 14200, 35, "Demo Pass", "Active"),
  usFire("Washington", "2026-WACOA-000144", -121.4, 46.9, "WA", 2300, 70, "Cascade Bench", "Moderate"),
  usFire("Washington", "2026-WANES-000902", -118.1, 48.7, "WA", 410, 90, "Kettle", "Minimal"),
  usFire("Oregon", "2026-ORUPF-000512", -122.7, 43.3, "OR", 38000, 20, "Umpqua Demo", "Extreme"),
  usFire("Oregon", "2026-ORMAF-000280", -119.4, 44.5, "OR", 6600, 55, "Ochoco", "Active"),
  usFire("California", "2026-CASHF-004102", -122.9, 40.8, "CA", 71000, 45, "Trinity Demo", "Extreme"),
  usFire("California", "2026-CASQF-002210", -118.7, 36.4, "CA", 9800, 60, "Sequoia Demo", "Active"),
  usFire("Idaho", "2026-IDBOF-000771", -115.3, 44.6, "ID", 27500, 30, "Salmon River Demo", "Active"),
  usFire("Montana", "2026-MTLNF-000308", -113.9, 47.9, "MT", 4400, 65, "Flathead Demo", "Moderate"),
  usFire("Alaska", "2026-AKFAS-000455", -147.2, 65.1, "AK", 120000, 10, "Yukon Flats Demo", "Active"),
  usFire("Colorado", "2026-COWRF-000190", -106.9, 40.1, "CO", 1800, 80, "Routt Demo", "Minimal"),
  caWx("bc-1", "warning", "Heat warning", "Metro Vancouver", "BC", "British Columbia", [-123.4, 49.0, -122.4, 49.5]),
  caWx("bc-2", "warning", "Wind warning", "North Coast — coastal sections", "BC", "British Columbia", [-131.0, 53.0, -128.5, 55.0]),
  caWx("bc-3", "watch", "Severe thunderstorm watch", "Okanagan Valley", "BC", "British Columbia", [-120.2, 49.0, -118.9, 50.6]),
  caWx("bc-4", "statement", "Special weather statement", "Fraser Canyon", "BC", "British Columbia", [-122.0, 49.6, -121.0, 50.6]),
  caWx("ab-1", "warning", "Severe thunderstorm warning", "Calgary", "AB", "Alberta", [-114.5, 50.8, -113.6, 51.3]),
  caWx("ab-2", "advisory", "Air quality advisory", "Edmonton", "AB", "Alberta", [-113.9, 53.3, -113.2, 53.8]),
  caWx("on-1", "warning", "Rainfall warning", "Toronto", "ON", "Ontario", [-79.8, 43.5, -79.1, 43.9]),
  caWx("on-2", "watch", "Tornado watch", "London — Middlesex", "ON", "Ontario", [-81.6, 42.7, -80.8, 43.2]),
  caWx("qc-1", "warning", "Heat warning", "Montréal", "QC", "Quebec", [-74.0, 45.4, -73.4, 45.8]),
  caWx("ns-1", "watch", "Tropical storm watch", "Halifax", "NS", "Nova Scotia", [-64.2, 44.4, -63.2, 45.0]),
  caWx("mb-1", "advisory", "Fog advisory", "Winnipeg", "MB", "Manitoba", [-97.4, 49.7, -96.9, 50.0]),
  usWx("wa-1", "Red Flag Warning", "Severe", "Expected", "Okanogan Valley, WA", "WA", "Washington", box(-120.2, 48.0, -119.2, 48.9), -119.7, 48.45),
  usWx("wa-2", "Excessive Heat Warning", "Severe", "Expected", "Seattle and vicinity, WA", "WA", "Washington", box(-122.6, 47.3, -122.0, 47.8), -122.3, 47.55),
  usWx("wa-3", "Air Quality Alert", "Unknown", "Unknown", "Spokane, WA", "WA", "Washington", pt(-117.4, 47.65), -117.4, 47.65, "approximate"),
  usWx("or-1", "Red Flag Warning", "Severe", "Expected", "Central Oregon", "OR", "Oregon", box(-121.9, 43.6, -120.4, 44.7), -121.15, 44.15),
  usWx("ca-1", "Extreme Heat Warning", "Extreme", "Expected", "Sacramento Valley, CA", "CA", "California", box(-122.3, 38.4, -121.2, 40.0), -121.75, 39.2),
  usWx("ca-2", "Flash Flood Warning", "Severe", "Immediate", "San Bernardino Mountains, CA", "CA", "California", box(-117.4, 34.1, -116.7, 34.4), -117.05, 34.25),
  usWx("mt-1", "Wind Advisory", "Minor", "Expected", "Cut Bank, MT", "MT", "Montana", pt(-112.3, 48.6), -112.3, 48.6, "approximate"),
  usWx("tx-1", "Severe Thunderstorm Warning", "Severe", "Immediate", "Dallas County, TX", "TX", "Texas", box(-97.1, 32.6, -96.5, 33.0), -96.8, 32.8),
  usWx("fl-1", "Tropical Storm Warning", "Severe", "Expected", "Coastal Miami-Dade, FL", "FL", "Florida", box(-80.5, 25.3, -80.0, 25.9), -80.25, 25.6),
  usWx("ak-1", "Winter Weather Advisory", "Minor", "Expected", "Brooks Range, AK", "AK", "Alaska", pt(-150.0, 68.0), -150.0, 68.0, "approximate"),
  eq("usgs", "ak26demo1", -151.2, 61.3, 5.4, 45, "32 km NW of Anchorage, Alaska", "US", "AK", "Alaska", "2026-09-02T09:12:00.000Z"),
  eq("usgs", "ak26demo2", -160.5, 54.9, 4.3, 30, "80 km S of Sand Point, Alaska", "US", "AK", "Alaska", "2026-09-01T22:40:00.000Z"),
  eq("usgs", "ca26demo1", -118.5, 34.4, 3.6, 9, "6 km E of Santa Clarita, California", "US", "CA", "California", "2026-09-02T15:05:00.000Z"),
  eq("usgs", "ca26demo2", -121.7, 36.9, 4.1, 7, "10 km SE of Watsonville, California", "US", "CA", "California", "2026-08-31T04:20:00.000Z"),
  eq("usgs", "wa26demo1", -122.3, 47.3, 2.8, 22, "8 km S of Tacoma, Washington", "US", "WA", "Washington", "2026-09-02T02:33:00.000Z"),
  eq("usgs", "wa26demo2", -125.1, 47.9, 4.4, 18, "90 km W of Forks, Washington", "US", "WA", "Washington", "2026-08-30T11:11:00.000Z"),
  eq("usgs", "nv26demo1", -117.9, 38.4, 3.2, 8, "40 km SW of Tonopah, Nevada", "US", "NV", "Nevada", "2026-09-01T18:00:00.000Z"),
  eq("nrcan", "20260902.0810001", -127.9, 49.6, 4.8, 12, "120 km W of Port Alice, BC", "CA", "BC", "British Columbia", "2026-09-02T08:10:00.000Z"),
  eq("nrcan", "20260901.2115001", -123.2, 48.9, 2.6, 55, "15 km S of Sidney, BC", "CA", "BC", "British Columbia", "2026-09-01T21:15:00.000Z"),
  eq("nrcan", "20260831.1340001", -130.6, 52.4, 5.6, 10, "180 km SW of Sandspit, BC", "CA", "BC", "British Columbia", "2026-08-31T13:40:00.000Z"),
  eq("nrcan", "20260902.0305001", -139.2, 60.4, 3.9, 6, "70 km NW of Haines Junction, YT", "CA", "YT", "Yukon", "2026-09-02T03:05:00.000Z"),
  eq("nrcan", "20260830.1922001", -71.4, 47.5, 3.4, 15, "25 km NE of Baie-Saint-Paul, QC", "CA", "QC", "Quebec", "2026-08-30T19:22:00.000Z"),
  eq("nrcan", "20260829.0450001", -114.0, 51.1, 2.4, 4, "12 km W of Calgary, AB", "CA", "AB", "Alberta", "2026-08-29T04:50:00.000Z"),
];

const sources = [
  { id: "eccc", agency: "Environment and Climate Change Canada (DEMO)", country: "CA", status: "available", retrievedAt: T, count: data.filter((h) => h.id.startsWith("mock:eccc")).length },
  { id: "cwfis", agency: "Natural Resources Canada — CWFIS (DEMO)", country: "CA", status: "available", retrievedAt: T, count: data.filter((h) => h.id.startsWith("mock:cwfis")).length },
  { id: "nrcan", agency: "Earthquakes Canada (DEMO)", country: "CA", status: "available", retrievedAt: T, count: data.filter((h) => h.id.startsWith("mock:nrcan")).length },
  { id: "nws", agency: "U.S. National Weather Service (DEMO)", country: "US", status: "available", retrievedAt: T, count: data.filter((h) => h.id.startsWith("mock:nws")).length },
  { id: "nifc", agency: "National Interagency Fire Center (DEMO)", country: "US", status: "available", retrievedAt: T, count: data.filter((h) => h.id.startsWith("mock:nifc")).length },
  { id: "usgs", agency: "U.S. Geological Survey (DEMO)", country: "US", status: "available", retrievedAt: T, count: data.filter((h) => h.id.startsWith("mock:usgs")).length },
];

const out = { data, meta: { generatedAt: T, retrievedAt: T, sources, filters: {}, count: data.length, total: data.length, mock: true } };
writeFileSync(new URL("./mock-hazards.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(`wrote ${data.length} mock hazards`);
