import { REGIONS, regionForPoint, type CountryCode, type Region } from "@nearcast/shared";

const CODE_TO_REGION = new Map<string, Region[]>();
const NAME_TO_REGION = new Map<string, Region>();
for (const r of REGIONS) {
  const list = CODE_TO_REGION.get(r.code) ?? [];
  list.push(r);
  CODE_TO_REGION.set(r.code, list);
  NAME_TO_REGION.set(r.name.toLowerCase(), r);
  for (const a of r.aliases ?? []) NAME_TO_REGION.set(a.toLowerCase(), r);
}

export interface Placement { country: CountryCode; region?: Region }

/**
 * Deterministic placement of a hazard from a free-text place string (e.g. USGS
 * "12 km NE of Port Hardy, Canada", NRCan "62 km WNW of Sitka, AK") with a
 * coordinate fallback. Returns null when the place is clearly outside CA/US.
 */
export function classifyPlace(place: string | undefined, lon: number, lat: number): Placement | null {
  const p = (place ?? "").trim();
  if (p) {
    if (/\bMexico$/i.test(p) && !/New Mexico$/i.test(p)) return null;
    if (/,\s*Canada$/i.test(p)) {
      const r = regionForPoint(lon, lat, "CA");
      return { country: "CA", region: r ?? undefined };
    }
    const code = /,\s*([A-Z]{2})$/.exec(p)?.[1];
    if (code) {
      const candidates = CODE_TO_REGION.get(code) ?? [];
      if (candidates.length === 1) return { country: candidates[0].country, region: candidates[0] };
      if (candidates.length > 1) {
        // Ambiguous two-letter code (e.g. "CA"): use coordinates to pick.
        const byPoint = regionForPoint(lon, lat);
        const match = candidates.find((c) => c.code === byPoint?.code && c.country === byPoint?.country);
        return match ? { country: match.country, region: match } : { country: candidates[0].country, region: candidates[0] };
      }
    }
    const tail = /,\s*([A-Za-z .]+)$/.exec(p)?.[1]?.trim().toLowerCase();
    if (tail) {
      const r = NAME_TO_REGION.get(tail);
      if (r) return { country: r.country, region: r };
    }
    if (/\b(USA|United States)$/i.test(p)) {
      const r = regionForPoint(lon, lat, "US");
      return { country: "US", region: r ?? undefined };
    }
  }
  const r = regionForPoint(lon, lat);
  return r ? { country: r.country, region: r } : null;
}

export function regionByCode(code: string | undefined, country: CountryCode): Region | undefined {
  if (!code) return undefined;
  return (CODE_TO_REGION.get(code.toUpperCase()) ?? []).find((r) => r.country === country);
}
