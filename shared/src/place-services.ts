export interface PlaceSearchResult { name: string; latitude: number; longitude: number; precision: string }
export interface ForecastPeriod {
  time: string; temperatureC: number; windKmh?: number; precipitationMm?: number;
  precipitationHours?: number; symbol?: string;
}
export interface Forecast {
  latitude: number; longitude: number; updatedAt: string; retrievedAt: string;
  periods: ForecastPeriod[]; sourceUrl: string; attribution: string; demo: boolean;
}
export interface RiverGauge {
  id: string; name: string; latitude: number; longitude: number;
  observedAt: string; levelMetres?: number; dischargeCMS?: number;
  changeMetres?: number; windowHours?: number; sourceUrl: string;
}
export interface GaugeSnapshot { gauges: RiverGauge[]; retrievedAt: string; truncated: boolean; rejectedCount: number; demo: boolean }
