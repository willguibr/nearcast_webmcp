import {
  isSeverity, meetsMinimumSeverity, parseBbox, bboxContains, resolveRegion,
  type CountryCode, type Hazard, type HazardFilters, type HazardType, type Region,
} from "@nearcast/shared";

export const DEFAULT_LIMIT = 500;
export const MAX_LIMIT = 2000;
const TYPES: HazardType[] = ["wildfire", "weather", "earthquake"];
const COUNTRIES: CountryCode[] = ["CA", "US"];

export type ParseResult =
  | { ok: true; filters: HazardFilters; regions: Region[] }
  | { ok: false; errors: string[] };

type Query = Record<string, string | undefined>;

function list(v: string | undefined): string[] {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Validate and normalize query-string filters. Malformed input yields errors (→ HTTP 400). */
export function parseFilters(q: Query): ParseResult {
  const errors: string[] = [];
  const filters: HazardFilters = {};
  const regions: Region[] = [];

  const types = list(q.type).map((t) => t.toLowerCase());
  for (const t of types) if (!TYPES.includes(t as HazardType)) errors.push(`type: unsupported hazard type "${t}" (expected wildfire, weather, earthquake)`);
  if (types.length) filters.type = types as HazardType[];

  const countries = list(q.country).map((c) => c.toUpperCase());
  for (const c of countries) if (!COUNTRIES.includes(c as CountryCode)) errors.push(`country: unsupported country "${c}" (expected CA or US)`);
  if (countries.length) filters.country = countries as CountryCode[];

  for (const r of list(q.region)) {
    const hint = countries.length === 1 ? (countries[0] as CountryCode) : undefined;
    const region = resolveRegion(r, hint);
    if (!region) errors.push(`region: invalid or ambiguous region "${r}" (use codes like BC, AB, WA or US-CA)`);
    else regions.push(region);
  }
  if (regions.length) filters.region = regions.map((r) => `${r.country}-${r.code}`);

  if (q.minSeverity != null) {
    const s = q.minSeverity.toLowerCase();
    if (!isSeverity(s)) errors.push(`minSeverity: invalid value "${q.minSeverity}"`);
    else filters.minSeverity = s;
  }
  if (q.minMagnitude != null) {
    const m = Number(q.minMagnitude);
    if (!Number.isFinite(m) || m < 0 || m > 10) errors.push(`minMagnitude: expected a number between 0 and 10`);
    else filters.minMagnitude = m;
  }
  if (q.bbox != null) {
    const b = parseBbox(q.bbox);
    if (!b) errors.push(`bbox: expected "west,south,east,north" with west<east and south<north`);
    else filters.bbox = b;
  }
  if (q.limit != null) {
    const n = Number(q.limit);
    if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) errors.push(`limit: expected an integer between 1 and ${MAX_LIMIT}`);
    else filters.limit = n;
  }
  return errors.length ? { ok: false, errors } : { ok: true, filters, regions };
}

const SIG_RANK = { high: 2, moderate: 1, low: 0 } as const;

export function hazardInRegion(h: Hazard, r: Region): boolean {
  if (h.country !== r.country) return false;
  if (h.regionCode) return h.regionCode === r.code;
  return bboxContains(r.bbox, h.longitude, h.latitude);
}

/** Pure, deterministic filtering + ordering. `minSeverity` applies to weather alerts; `minMagnitude` to earthquakes. */
export function applyFilters(hazards: Hazard[], filters: HazardFilters, regions: Region[] = []): { data: Hazard[]; total: number } {
  const out = hazards.filter((h) => {
    if (filters.type && !filters.type.includes(h.type)) return false;
    if (filters.country && !filters.country.includes(h.country)) return false;
    if (regions.length && !regions.some((r) => hazardInRegion(h, r))) return false;
    if (filters.minSeverity && h.type === "weather" && !meetsMinimumSeverity(h.severity, filters.minSeverity)) return false;
    if (filters.minMagnitude != null && h.type === "earthquake" && (h.earthquake?.magnitude ?? -Infinity) < filters.minMagnitude) return false;
    if (filters.bbox && !bboxContains(filters.bbox, h.longitude, h.latitude)) return false;
    return true;
  });
  out.sort((a, b) =>
    SIG_RANK[b.significance] - SIG_RANK[a.significance] ||
    (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") ||
    a.id.localeCompare(b.id));
  const limit = filters.limit ?? DEFAULT_LIMIT;
  return { data: out.slice(0, limit), total: out.length };
}
