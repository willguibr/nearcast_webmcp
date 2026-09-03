import type { CountryCode } from "./hazard.ts";
import type { Bbox } from "./geo.ts";

export interface Region {
  code: string;
  name: string;
  country: CountryCode;
  /** Approximate bounding box [west, south, east, north] — used for map focus and coarse classification. */
  bbox: Bbox;
  aliases?: string[];
}

/**
 * Fixed region registry: Canadian provinces/territories and all US states + DC.
 * Bounding boxes are approximate (rounded to ~0.1°) and intentionally generous.
 * They are used for map focusing and for deterministic region comparisons when a
 * source does not report a region code.
 */
export const REGIONS: Region[] = [
  // Canada
  { code: "BC", name: "British Columbia", country: "CA", bbox: [-139.1, 48.3, -114.0, 60.0] },
  { code: "AB", name: "Alberta", country: "CA", bbox: [-120.0, 49.0, -110.0, 60.0] },
  { code: "SK", name: "Saskatchewan", country: "CA", bbox: [-110.0, 49.0, -101.4, 60.0] },
  { code: "MB", name: "Manitoba", country: "CA", bbox: [-102.0, 49.0, -88.9, 60.0] },
  { code: "ON", name: "Ontario", country: "CA", bbox: [-95.2, 41.7, -74.3, 56.9] },
  { code: "QC", name: "Quebec", country: "CA", bbox: [-79.8, 45.0, -57.1, 62.6], aliases: ["Québec"] },
  { code: "NB", name: "New Brunswick", country: "CA", bbox: [-69.1, 44.6, -63.8, 48.1] },
  { code: "NS", name: "Nova Scotia", country: "CA", bbox: [-66.4, 43.4, -59.7, 47.1] },
  { code: "PE", name: "Prince Edward Island", country: "CA", bbox: [-64.5, 45.9, -62.0, 47.1], aliases: ["PEI"] },
  { code: "NL", name: "Newfoundland and Labrador", country: "CA", bbox: [-67.8, 46.6, -52.6, 60.4], aliases: ["Newfoundland", "Labrador"] },
  { code: "YT", name: "Yukon", country: "CA", bbox: [-141.0, 60.0, -124.0, 69.7] },
  { code: "NT", name: "Northwest Territories", country: "CA", bbox: [-136.5, 60.0, -102.0, 78.8] },
  { code: "NU", name: "Nunavut", country: "CA", bbox: [-120.7, 51.6, -61.0, 83.2] },
  // United States
  { code: "AL", name: "Alabama", country: "US", bbox: [-88.5, 30.2, -84.9, 35.0] },
  { code: "AK", name: "Alaska", country: "US", bbox: [-179.2, 51.2, -129.9, 71.5] },
  { code: "AZ", name: "Arizona", country: "US", bbox: [-114.8, 31.3, -109.0, 37.0] },
  { code: "AR", name: "Arkansas", country: "US", bbox: [-94.6, 33.0, -89.6, 36.5] },
  { code: "CA", name: "California", country: "US", bbox: [-124.5, 32.5, -114.1, 42.0] },
  { code: "CO", name: "Colorado", country: "US", bbox: [-109.1, 37.0, -102.0, 41.0] },
  { code: "CT", name: "Connecticut", country: "US", bbox: [-73.7, 41.0, -71.8, 42.1] },
  { code: "DE", name: "Delaware", country: "US", bbox: [-75.8, 38.4, -75.0, 39.8] },
  { code: "DC", name: "District of Columbia", country: "US", bbox: [-77.1, 38.8, -76.9, 39.0], aliases: ["Washington DC", "Washington, D.C."] },
  { code: "FL", name: "Florida", country: "US", bbox: [-87.6, 24.4, -80.0, 31.0] },
  { code: "GA", name: "Georgia", country: "US", bbox: [-85.6, 30.4, -80.8, 35.0] },
  { code: "HI", name: "Hawaii", country: "US", bbox: [-160.3, 18.9, -154.8, 22.3] },
  { code: "ID", name: "Idaho", country: "US", bbox: [-117.2, 42.0, -111.0, 49.0] },
  { code: "IL", name: "Illinois", country: "US", bbox: [-91.5, 37.0, -87.5, 42.5] },
  { code: "IN", name: "Indiana", country: "US", bbox: [-88.1, 37.8, -84.8, 41.8] },
  { code: "IA", name: "Iowa", country: "US", bbox: [-96.6, 40.4, -90.1, 43.5] },
  { code: "KS", name: "Kansas", country: "US", bbox: [-102.1, 37.0, -94.6, 40.0] },
  { code: "KY", name: "Kentucky", country: "US", bbox: [-89.6, 36.5, -81.9, 39.1] },
  { code: "LA", name: "Louisiana", country: "US", bbox: [-94.0, 28.9, -88.8, 33.0] },
  { code: "ME", name: "Maine", country: "US", bbox: [-71.1, 43.1, -66.9, 47.5] },
  { code: "MD", name: "Maryland", country: "US", bbox: [-79.5, 37.9, -75.0, 39.7] },
  { code: "MA", name: "Massachusetts", country: "US", bbox: [-73.5, 41.2, -69.9, 42.9] },
  { code: "MI", name: "Michigan", country: "US", bbox: [-90.4, 41.7, -82.4, 48.3] },
  { code: "MN", name: "Minnesota", country: "US", bbox: [-97.2, 43.5, -89.5, 49.4] },
  { code: "MS", name: "Mississippi", country: "US", bbox: [-91.7, 30.2, -88.1, 35.0] },
  { code: "MO", name: "Missouri", country: "US", bbox: [-95.8, 36.0, -89.1, 40.6] },
  { code: "MT", name: "Montana", country: "US", bbox: [-116.1, 44.4, -104.0, 49.0] },
  { code: "NE", name: "Nebraska", country: "US", bbox: [-104.1, 40.0, -95.3, 43.0] },
  { code: "NV", name: "Nevada", country: "US", bbox: [-120.0, 35.0, -114.0, 42.0] },
  { code: "NH", name: "New Hampshire", country: "US", bbox: [-72.6, 42.7, -70.6, 45.3] },
  { code: "NJ", name: "New Jersey", country: "US", bbox: [-75.6, 38.9, -73.9, 41.4] },
  { code: "NM", name: "New Mexico", country: "US", bbox: [-109.1, 31.3, -103.0, 37.0] },
  { code: "NY", name: "New York", country: "US", bbox: [-79.8, 40.5, -71.9, 45.0] },
  { code: "NC", name: "North Carolina", country: "US", bbox: [-84.3, 33.8, -75.4, 36.6] },
  { code: "ND", name: "North Dakota", country: "US", bbox: [-104.1, 45.9, -96.6, 49.0] },
  { code: "OH", name: "Ohio", country: "US", bbox: [-84.8, 38.4, -80.5, 42.0] },
  { code: "OK", name: "Oklahoma", country: "US", bbox: [-103.0, 33.6, -94.4, 37.0] },
  { code: "OR", name: "Oregon", country: "US", bbox: [-124.6, 42.0, -116.5, 46.3] },
  { code: "PA", name: "Pennsylvania", country: "US", bbox: [-80.5, 39.7, -74.7, 42.3] },
  { code: "RI", name: "Rhode Island", country: "US", bbox: [-71.9, 41.1, -71.1, 42.0] },
  { code: "SC", name: "South Carolina", country: "US", bbox: [-83.4, 32.0, -78.5, 35.2] },
  { code: "SD", name: "South Dakota", country: "US", bbox: [-104.1, 42.5, -96.4, 45.9] },
  { code: "TN", name: "Tennessee", country: "US", bbox: [-90.3, 35.0, -81.6, 36.7] },
  { code: "TX", name: "Texas", country: "US", bbox: [-106.7, 25.8, -93.5, 36.5] },
  { code: "UT", name: "Utah", country: "US", bbox: [-114.1, 37.0, -109.0, 42.0] },
  { code: "VT", name: "Vermont", country: "US", bbox: [-73.4, 42.7, -71.5, 45.0] },
  { code: "VA", name: "Virginia", country: "US", bbox: [-83.7, 36.5, -75.2, 39.5] },
  { code: "WA", name: "Washington", country: "US", bbox: [-124.8, 45.5, -116.9, 49.0], aliases: ["Washington State"] },
  { code: "WV", name: "West Virginia", country: "US", bbox: [-82.6, 37.2, -77.7, 40.6] },
  { code: "WI", name: "Wisconsin", country: "US", bbox: [-92.9, 42.5, -86.8, 47.1] },
  { code: "WY", name: "Wyoming", country: "US", bbox: [-111.1, 41.0, -104.1, 45.0] },
];

const byCode = new Map<string, Region>();
const byName = new Map<string, Region>();
for (const r of REGIONS) {
  byCode.set(`${r.country}-${r.code}`, r);
  byName.set(r.name.toLowerCase(), r);
  for (const a of r.aliases ?? []) byName.set(a.toLowerCase(), r);
}

/** Resolve a region by code ("BC", "US-WA", "CA-BC") or name ("British Columbia"). Returns null if unknown/ambiguous. */
export function resolveRegion(input: string, country?: CountryCode): Region | null {
  const raw = input.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  const m = /^(CA|US)[-_ ]([A-Z]{2})$/.exec(upper);
  if (m) return byCode.get(`${m[1]}-${m[2]}`) ?? null;
  if (/^[A-Z]{2}$/.test(upper)) {
    const ca = byCode.get(`CA-${upper}`), us = byCode.get(`US-${upper}`);
    if (country === "CA") return ca ?? null;
    if (country === "US") return us ?? null;
    // Bare two-letter codes: Canadian province wins when the code is Canadian-only;
    // "CA" alone is ambiguous (California vs country) and resolves to California only with country hint.
    if (ca && us) return upper === "CA" ? null : ca;
    return ca ?? us ?? null;
  }
  const n = byName.get(raw.toLowerCase());
  if (n && (!country || n.country === country)) return n;
  return null;
}

export function regionsForCountry(country: CountryCode): Region[] {
  return REGIONS.filter((r) => r.country === country);
}

/** Coarse classification: first region whose bbox contains the point, preferring smaller boxes. */
export function regionForPoint(lon: number, lat: number, country?: CountryCode): Region | null {
  let best: Region | null = null, bestArea = Infinity;
  for (const r of REGIONS) {
    if (country && r.country !== country) continue;
    const [w, s, e, n] = r.bbox;
    if (lon >= w && lon <= e && lat >= s && lat <= n) {
      const area = (e - w) * (n - s);
      if (area < bestArea) { best = r; bestArea = area; }
    }
  }
  return best;
}

/** Initial map view: Canada + contiguous US + Alaska (Hawaii excluded on purpose). */
export const NORTH_AMERICA_BBOX: Bbox = [-168.0, 24.0, -52.0, 72.0];
