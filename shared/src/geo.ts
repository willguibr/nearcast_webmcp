import type { Geometry, Position } from "geojson";

/** [west, south, east, north] */
export type Bbox = [number, number, number, number];

export function parseBbox(input: unknown): Bbox | null {
  if (typeof input !== "string") return null;
  const parts = input.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return isValidBbox(parts as Bbox) ? (parts as Bbox) : null;
}

export function isValidBbox(b: Bbox): boolean {
  const [w, s, e, n] = b;
  return w >= -180 && w <= 180 && e >= -180 && e <= 180 && s >= -90 && n <= 90 && s < n && w < e;
}

export function bboxContains(b: Bbox, lon: number, lat: number): boolean {
  return lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
}

export function bboxCenter(b: Bbox): [number, number] {
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}

function walk(g: Geometry, fn: (p: Position) => void): void {
  switch (g.type) {
    case "Point": fn(g.coordinates); break;
    case "MultiPoint": case "LineString": g.coordinates.forEach(fn); break;
    case "MultiLineString": case "Polygon": g.coordinates.forEach((r) => r.forEach(fn)); break;
    case "MultiPolygon": g.coordinates.forEach((p) => p.forEach((r) => r.forEach(fn))); break;
    case "GeometryCollection": g.geometries.forEach((x) => walk(x, fn)); break;
  }
}

export function geometryBbox(g: Geometry): Bbox | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity, any = false;
  walk(g, (p) => { any = true; w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]); });
  return any ? [w, s, e, n] : null;
}

/** Representative point: geometry point itself, or the bbox centre for areas. */
export function representativePoint(g: Geometry): [number, number] | null {
  if (g.type === "Point") return [g.coordinates[0], g.coordinates[1]];
  const b = geometryBbox(g);
  return b ? bboxCenter(b) : null;
}

/** Round every coordinate to `digits` decimals to shrink payloads (3 ≈ 100 m). */
export function roundGeometry(g: Geometry, digits = 3): Geometry {
  const f = Math.pow(10, digits);
  const r = (p: Position): Position => [Math.round(p[0] * f) / f, Math.round(p[1] * f) / f];
  switch (g.type) {
    case "Point": return { type: "Point", coordinates: r(g.coordinates) };
    case "MultiPoint": return { type: "MultiPoint", coordinates: g.coordinates.map(r) };
    case "LineString": return { type: "LineString", coordinates: g.coordinates.map(r) };
    case "MultiLineString": return { type: "MultiLineString", coordinates: g.coordinates.map((l) => l.map(r)) };
    case "Polygon": return { type: "Polygon", coordinates: g.coordinates.map((l) => l.map(r)) };
    case "MultiPolygon": return { type: "MultiPolygon", coordinates: g.coordinates.map((p) => p.map((l) => l.map(r))) };
    case "GeometryCollection": return { type: "GeometryCollection", geometries: g.geometries.map((x) => roundGeometry(x, digits)) };
  }
}

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
