import type { SavedPlace } from "@nearcast/shared";
import { useAppState } from "../hooks/useStore.ts";
import { store } from "../state/index.ts";
import { extrasKey, loadPlaceExtra } from "../services/place-services.ts";

export function PlaceConditions({ place }: { place: SavedPlace }) {
  const demo = useAppState((s) => s.mock);
  const data = useAppState((s) => s.placeExtras[extrasKey(place, s.mock)]);
  const forecast = data?.forecast, gauges = data?.gauges;
  const stale = (time: string, hours: number) => !demo && (!Number.isFinite(Date.parse(time)) || Date.now()-Date.parse(time) > hours*3600_000);
  return <section className="panel" aria-label="Forecast and river gauges"><h2>Weather ahead & river observations</h2>
    <p className="muted small">Load on request. Coordinates rounded to 3 decimals are sent through Nearcast to MET Norway (forecast) or ECCC (Canadian gauges). Place names stay in your browser.</p>
    <div className="button-row">{(["forecast", "gauges"] as const).map((kind) => <button key={kind} className="button" disabled={data?.[`${kind}Loading`]}
      onClick={() => void loadPlaceExtra(store, place, kind).catch(() => {})}>{data?.[`${kind}Loading`] ? "Loading…" : `${data?.[kind] ? "Refresh" : "Load"} ${kind === "forecast" ? "72-hour forecast" : "nearby river gauges"}`}</button>)}</div>
    {([data?.forecastError, data?.gaugesError].filter(Boolean)).map((error) => <p key={error} className="error" role="alert">{error} Previously loaded data, if shown, may be stale.</p>)}
    {forecast && <><h3>{demo ? "DEMO · " : ""}Forecast</h3><p className="small">Issued {new Date(forecast.updatedAt).toLocaleString()} · Retrieved {new Date(forecast.retrievedAt).toLocaleString()}</p>
      {stale(forecast.updatedAt, 12) && <p className="data-caution">Forecast is older than 12 hours. Refresh and check the provider.</p>}
      <div className="comparison-wrap forecast-table" tabIndex={0} role="region" aria-label="Scrollable forecast periods"><table className="comparison-table"><caption>Forecast at the selected coordinates · local time</caption><thead><tr><th>Time</th><th>°C</th><th>Wind km/h</th><th>Precipitation</th><th>Conditions</th></tr></thead>
        <tbody>{forecast.periods.filter((p) => demo || Date.parse(p.time) >= Date.now()-3600_000).map((p) => <tr key={p.time}><td>{new Date(p.time).toLocaleString([], {month:"short",day:"numeric",hour:"numeric"})}</td><td>{p.temperatureC}</td><td>{p.windKmh ?? "—"}</td><td>{p.precipitationMm === undefined ? "—" : `${p.precipitationMm} mm / ${p.precipitationHours} h`}</td><td>{p.symbol?.replaceAll("_", " ") ?? "Not reported"}</td></tr>)}</tbody></table></div>
      <p className="small">{forecast.attribution} <a href="https://www.met.no/en" target="_blank" rel="noreferrer">MET Norway ↗</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">Licence</a></p></>}
    {gauges && <><h3>{demo ? "DEMO · " : ""}River gauges · {Math.min(120, place.radiusKm)} km</h3><p className="muted small">Water levels use each station’s local reference. Comparing heights between stations does not establish flood risk. Observations are provisional; trend spans reflect available readings.</p>
      {(gauges.truncated || gauges.rejectedCount > 0 || stale(gauges.retrievedAt, 1)) && <p className="data-caution">{gauges.truncated ? "Results are incomplete; some stations or older readings may be omitted. " : ""}{gauges.rejectedCount > 0 ? `${gauges.rejectedCount} malformed observations omitted. ` : ""}{stale(gauges.retrievedAt, 1) ? "Snapshot is over an hour old; refresh." : ""}</p>}
      {!gauges.gauges.length && <p>No reporting gauges returned within this radius and 30-hour window. This does not establish flood conditions.</p>}
      <div className="context-grid">{gauges.gauges.map((g) => <article key={g.id} className="context-card"><strong>{g.name}</strong><p>Level: {g.levelMetres === undefined ? "Not reported" : `${g.levelMetres.toFixed(3)} m`} · Flow: {g.dischargeCMS === undefined ? "Not reported" : `${g.dischargeCMS} m³/s`}</p>
        <p>{g.changeMetres === undefined ? "Insufficient observations for a trend" : `${g.changeMetres >= 0 ? "+" : ""}${g.changeMetres.toFixed(3)} m across ${g.windowHours?.toFixed(1)} hours`}</p>
        <p className="small">Observed {new Date(g.observedAt).toLocaleString()}</p>{stale(g.observedAt, 3) && <p className="data-caution">Observation is over 3 hours old.</p>}
        <a href={`https://wateroffice.ec.gc.ca/report/real_time_e.html?stn=${encodeURIComponent(g.id)}`} target="_blank" rel="noreferrer">ECCC station ↗</a></article>)}</div>
      <p className="small">ECCC Water Survey of Canada · retrieved {new Date(gauges.retrievedAt).toLocaleString()}</p></>}
  </section>;
}
