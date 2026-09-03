import { SIGNIFICANT_MAGNITUDE, type CountrySummary, type CountryCode, type Hazard, type SourceMeta, type SummaryResponse } from "@nearcast/shared";

function empty(): CountrySummary {
  return { wildfires: 0, weatherAlerts: 0, earthquakes: 0, significantEarthquakes: 0, wildfiresOutOfControl: 0, wildfireHectaresReported: 0 };
}

export function tally(into: CountrySummary, h: Hazard): void {
  if (h.type === "wildfire") {
    into.wildfires++;
    if (h.wildfire?.statusCode === "OC") into.wildfiresOutOfControl = (into.wildfiresOutOfControl ?? 0) + 1;
    if (h.wildfire?.areaHectares != null) into.wildfireHectaresReported = Math.round(((into.wildfireHectaresReported ?? 0) + h.wildfire.areaHectares) * 10) / 10;
  } else if (h.type === "weather") {
    into.weatherAlerts++;
  } else if (h.type === "earthquake") {
    into.earthquakes++;
    if ((h.earthquake?.magnitude ?? 0) >= SIGNIFICANT_MAGNITUDE) into.significantEarthquakes++;
  }
}

export function computeSummary(hazards: Hazard[], sources: SourceMeta[], retrievedAt: string): SummaryResponse {
  const countries: Record<CountryCode, CountrySummary> = { CA: empty(), US: empty() };
  const regions: Record<string, CountrySummary> = {};
  for (const h of hazards) {
    tally(countries[h.country], h);
    if (h.regionCode) {
      const key = `${h.country}-${h.regionCode}`;
      regions[key] ??= empty();
      tally(regions[key], h);
    }
  }
  return { generatedAt: new Date().toISOString(), retrievedAt, countries, regions, sources };
}
