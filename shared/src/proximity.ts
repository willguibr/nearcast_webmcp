import type { Geometry, Position } from "geojson";
import { haversineKm, type Bbox } from "./geo.ts";

const R = 6371;
const radians = (n: number) => n * Math.PI / 180;
const wrap = (n: number) => ((n + 540) % 360) - 180;
export function validPosition(p: unknown): p is Position {
  return Array.isArray(p) && p.length >= 2 && typeof p[0] === "number" && typeof p[1] === "number"
    && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
}

/** Validate public-feed GeoJSON without losing polygon holes or separate islands. */
export function validGeometry(g: unknown): g is Geometry {
  if (!g || typeof g !== "object") return false;
  const { type, coordinates: c } = g as { type: string; coordinates: unknown };
  const line = (v: unknown): v is Position[] => Array.isArray(v) && v.length >= 2 && v.every(validPosition);
  const ring = (v: unknown) => line(v) && v.length >= 4 && v[0][0] === v.at(-1)![0] && v[0][1] === v.at(-1)![1];
  const polygon = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every(ring);
  switch (type) {
    case "Point": return validPosition(c);
    case "MultiPoint": return Array.isArray(c) && c.length > 0 && c.every(validPosition);
    case "LineString": return line(c);
    case "MultiLineString": return Array.isArray(c) && c.length > 0 && c.every(line);
    case "Polygon": return polygon(c);
    case "MultiPolygon": return Array.isArray(c) && c.length > 0 && c.every(polygon);
    default: return false;
  }
}

function bearing(a: Position, b: Position): number {
  const p1 = radians(a[1]), p2 = radians(b[1]), dl = radians(wrap(b[0] - a[0]));
  return Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
}

/** Distance to the nearest point on a short great-circle segment, in km. */
function segmentDistance(p: Position, a: Position, b: Position): number {
  const d = haversineKm(a[1], a[0], p[1], p[0]) / R;
  const length = haversineKm(a[1], a[0], b[1], b[0]) / R;
  if (length < 1e-12) return d * R;
  const angle = bearing(a, p) - bearing(a, b);
  const along = Math.atan2(Math.sin(d) * Math.cos(angle), Math.cos(d));
  if (along < 0 || along > length) return Math.min(d * R, haversineKm(b[1], b[0], p[1], p[0]));
  return Math.abs(Math.asin(Math.max(-1, Math.min(1, Math.sin(d) * Math.sin(angle))))) * R;
}

function lineDistance(p: Position, points: Position[]): number {
  let distance = Infinity;
  for (let i = 1; i < points.length; i++) distance = Math.min(distance, segmentDistance(p, points[i - 1], points[i]));
  return distance;
}

function relativeRing(p: Position, ring: Position[]): Position[] {
  let x = wrap(ring[0][0] - p[0]);
  return ring.map((position, i) => {
    if (i) x += wrap(position[0] - ring[i - 1][0]);
    return [x, position[1] - p[1]];
  });
}

function inRing(p: Position, ring: Position[]): boolean {
  const relative = relativeRing(p, ring);
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = relative[i], [bx, by] = relative[j];
    if ((ay > 0) !== (by > 0) && 0 < (bx - ax) * -ay / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

function inPolygon(p: Position, rings: Position[][]): boolean {
  // Exact GeoJSON boundary check in coordinate space, separate from geodesic distance.
  const boundary = rings.some((ring) => relativeRing(p, ring).some((a, i, relative) => {
    if (!i) return false;
    const [ax, ay] = a, [bx, by] = relative[i - 1];
    return Math.abs(ax * by - ay * bx) < 1e-10 && ax * bx <= 0 && ay * by <= 0;
  }));
  return boundary || (inRing(p, rings[0]) && !rings.slice(1).some((ring) => inRing(p, ring)));
}

export function geometryContains(p: Position, g: Geometry): boolean {
  if (g.type === "Polygon") return inPolygon(p, g.coordinates);
  if (g.type === "MultiPolygon") return g.coordinates.some((rings) => inPolygon(p, rings));
  if (g.type === "GeometryCollection") return g.geometries.some((part) => geometryContains(p, part));
  return false;
}

export function distanceToGeometryKm(p: Position, g: Geometry): number {
  if (geometryContains(p, g)) return 0;
  switch (g.type) {
    case "Point": return haversineKm(p[1], p[0], g.coordinates[1], g.coordinates[0]);
    case "MultiPoint": return Math.min(...g.coordinates.map((v) => haversineKm(p[1], p[0], v[1], v[0])));
    case "LineString": return lineDistance(p, g.coordinates);
    case "MultiLineString": case "Polygon": return Math.min(...g.coordinates.map((l) => lineDistance(p, l)));
    case "MultiPolygon": return Math.min(...g.coordinates.flatMap((rings) => rings.map((l) => lineDistance(p, l))));
    case "GeometryCollection": return Math.min(...g.geometries.map((part) => distanceToGeometryKm(p, part)));
  }
}

export function radiusBounds(longitude: number, latitude: number, radiusKm: number): Bbox {
  const dy = radiusKm / 111, dx = dy / Math.max(0.05, Math.cos(radians(latitude)));
  // A wrapping viewport is represented as a full longitude range for MapLibre.
  const wraps = longitude - dx < -180 || longitude + dx > 180;
  return [wraps ? -180 : longitude - dx, Math.max(-85, latitude - dy),
    wraps ? 180 : longitude + dx, Math.min(85, latitude + dy)];
}

export function radiusRing(longitude: number, latitude: number, radiusKm: number): Position[] {
  const a = radians(latitude), d = radiusKm / R;
  const ring = Array.from({ length: 64 }, (_, i) => {
    const b = i * 2 * Math.PI / 64;
    const lat = Math.asin(Math.sin(a) * Math.cos(d) + Math.cos(a) * Math.sin(d) * Math.cos(b));
    const lon = radians(longitude) + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(a), Math.cos(d) - Math.sin(a) * Math.sin(lat));
    return [wrap(lon * 180 / Math.PI), lat * 180 / Math.PI];
  });
  return [...ring, ring[0]];
}
