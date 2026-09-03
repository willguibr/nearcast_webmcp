import type { CountryCode, HazardSeverity, HazardType } from "@nearcast/shared";
import { store, selectFilteredHazards, selectVisibleHazards } from "../state/index.ts";
import { useAppState } from "../hooks/useStore.ts";
import { HazardIcon } from "./Icons.tsx";
import { TYPE_LABEL } from "../map/style.ts";

const COUNTRIES: { code: CountryCode; label: string }[] = [{ code: "CA", label: "Canada" }, { code: "US", label: "United States" }];
const TYPES: HazardType[] = ["wildfire", "weather", "earthquake"];
const SEVERITIES: { value: HazardSeverity | ""; label: string }[] = [
  { value: "", label: "All alerts" }, { value: "minor", label: "Minor and above" }, { value: "moderate", label: "Moderate and above" },
  { value: "severe", label: "Severe and above" }, { value: "extreme", label: "Extreme only" },
];
const MAGNITUDES = [0, 2.5, 3, 4, 5, 6];

export function FilterPanel() {
  const filters = useAppState((s) => s.filters);
  const total = useAppState((s) => s.hazards.length);
  const filtered = useAppState(selectFilteredHazards).length;
  const visible = useAppState(selectVisibleHazards).length;

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <section className="panel" aria-labelledby="filters-title">
      <h2 id="filters-title">Filters</h2>
      <div className="filter-group" role="group" aria-label="Countries">
        {COUNTRIES.map((c) => (
          <label key={c.code} className="check">
            <input type="checkbox" checked={filters.countries.includes(c.code)} onChange={() => store.setFilters({ countries: toggle(filters.countries, c.code) })} />
            {c.label}
          </label>
        ))}
      </div>
      <div className="filter-group" role="group" aria-label="Hazard types">
        {TYPES.map((t) => (
          <label key={t} className="check">
            <input type="checkbox" checked={filters.hazardTypes.includes(t)} onChange={() => store.setFilters({ hazardTypes: toggle(filters.hazardTypes, t) })} />
            <HazardIcon type={t} /> {TYPE_LABEL[t]}s
          </label>
        ))}
      </div>
      <label className="field">
        <span>Weather alert severity</span>
        <select value={filters.minimumSeverity ?? ""} onChange={(e) => store.setFilters({ minimumSeverity: (e.target.value || undefined) as HazardSeverity | undefined })}>
          {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Earthquake magnitude</span>
        <select value={filters.minimumEarthquakeMagnitude ?? 0} onChange={(e) => store.setFilters({ minimumEarthquakeMagnitude: Number(e.target.value) || undefined })}>
          {MAGNITUDES.map((m) => <option key={m} value={m}>{m === 0 ? "All magnitudes" : `M ${m.toFixed(1)}+`}</option>)}
        </select>
      </label>
      <div className="filter-footer">
        <span className="muted">{visible} in view · {filtered} match filters · {total} loaded</span>
        <button type="button" className="link" onClick={() => store.resetFilters()}>Reset</button>
      </div>
    </section>
  );
}
