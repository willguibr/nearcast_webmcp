import { useEffect, useState, type FormEvent } from "react";
import type { SavedPlace } from "@nearcast/shared";
import { useAppState } from "../hooks/useStore.ts";
import { store } from "../state/index.ts";
import { DEMO_PLACE } from "../services/demo-awareness.ts";
import { PlaceBackup } from "./PlaceBackup.tsx";
import { searchPlaces } from "../services/place-services.ts";
import type { PlaceSearchResult } from "@nearcast/shared";

export function PlacesPanel() {
  const places = useAppState((s) => s.places);
  const active = useAppState((s) => s.activePlaceId);
  const picked = useAppState((s) => s.pickedCoordinate);
  const picking = useAppState((s) => s.pickingPlace);
  const persistenceError = useAppState((s) => s.persistenceError);
  const demo = useAppState((s) => s.mock);
  const [editing, setEditing] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radius, setRadius] = useState("25");
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const [deleting, setDeleting] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (picked) { setLongitude(picked[0].toFixed(5)); setLatitude(picked[1].toFixed(5)); setOpen(true); }
  }, [picked]);

  function edit(place?: SavedPlace) {
    store.set({ pickingPlace: false, pickedCoordinate: undefined });
    setEditing(place?.id); setName(place?.name ?? "");
    setLatitude(place ? String(place.latitude) : ""); setLongitude(place ? String(place.longitude) : "");
    setRadius(String(place?.radiusKm ?? 25)); setError(""); setOpen(true);
  }
  function save(e: FormEvent) {
    e.preventDefault();
    if (!latitude.trim() || !longitude.trim()) { setError("Choose a location on the map, use your location, or enter coordinates."); return; }
    try {
      store.savePlace({ id: editing, name, latitude: Number(latitude), longitude: Number(longitude), radiusKm: Number(radius) });
      setOpen(false); setEditing(undefined); setError(""); store.set({ pickingPlace: false, pickedCoordinate: undefined });
    } catch (e) { setError((e as Error).message); }
  }
  function locate() {
    if (!navigator.geolocation) { setError("Location is unavailable in this browser. Choose a point on the map instead."); return; }
    setLocating(true); setError("");
    navigator.geolocation.getCurrentPosition((position) => {
      setLatitude(position.coords.latitude.toFixed(5)); setLongitude(position.coords.longitude.toFixed(5)); setLocating(false);
    }, () => { setError("Could not access your location. Choose a map point or enter coordinates instead."); setLocating(false); },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  }

  return <section className="panel places-panel" aria-labelledby="places-title">
    <div className="section-heading"><h2 id="places-title">Your places <span className="count">{places.length}/20</span></h2>
      <button className="button small-button" onClick={() => edit()}>Add place</button></div>
    <p className="muted small">Home, family, a cabin, or your next stop. Choose a place to see published conditions nearby.</p>
    {!places.length && <div className="empty-card"><strong>Start with somewhere you care about.</strong><p>Save a point and choose a watch radius. No account needed.</p>
      {demo && <button className="button" onClick={() => { try { store.savePlace(DEMO_PLACE); } catch (e) { setError((e as Error).message); } }}>Add demo cabin</button>}</div>}
    <ul className="saved-places">
      {places.map((p) => <li key={p.id} className={p.id === active ? "active" : ""}>
        <button className="place-select" onClick={() => store.activatePlace(p.id)} aria-pressed={p.id === active}>
          <strong>{p.name}</strong><span>{p.radiusKm} km watch radius</span>
        </button>
        <div className="place-actions"><button className="link" onClick={() => edit(p)} aria-label={`Edit ${p.name}`}>Edit</button>
          <button className="link" onClick={() => setDeleting(p.id)} aria-label={`Remove ${p.name}`}>Remove</button></div>
        {deleting === p.id && <div className="delete-confirm">Remove this saved place?
          <button className="button" onClick={() => { store.removePlace(p.id); setDeleting(undefined); }}>Remove place</button>
          <button className="link" onClick={() => setDeleting(undefined)}>Keep place</button></div>}
      </li>)}
    </ul>
    {open && <form className="place-form" onSubmit={save} aria-label={editing ? "Edit saved place" : "Add saved place"}>
      <label>Find a BC address or place<input maxLength={200} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Squamish, BC" onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} /></label>
      <button type="button" className="button" disabled={searching || query.trim().length < 3} onClick={async () => {
        setSearching(true); setError(""); setResults([]);
        try { const found = await searchPlaces(query, demo); setResults(found); if (!found.length) setError("No BC matches found. Try a more specific address or choose a map point."); }
        catch (e) { setError((e as Error).message); } finally { setSearching(false); }
      }}>{searching ? "Searching…" : "Search BC places"}</button>
      <p className="muted small">Search text is sent to the BC Address Geocoder through Nearcast. Outside BC, use map selection or coordinates.</p>
      {results.length > 0 && <ul className="search-results">{results.map((r, i) => <li key={i}><button type="button" className="link" onClick={() => { setName(r.name.slice(0,80)); setLatitude(String(r.latitude)); setLongitude(String(r.longitude)); setResults([]); }}>{r.name} · {r.precision.toLowerCase().replaceAll("_", " ")}</button></li>)}</ul>}
      <label>Place name<input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Home or Cabin" /></label>
      <div className="button-row">
        <button type="button" className="button" aria-pressed={picking} onClick={() => store.set({ pickingPlace: !picking })}>{picking ? "Cancel map selection" : "Pick on map"}</button>
        <button type="button" className="button" disabled={locating} onClick={locate}>{locating ? "Finding location…" : "Use my location"}</button>
        <button type="button" className="link" onClick={() => { const [lon, lat] = store.getState().view.center; setLatitude(lat.toFixed(5)); setLongitude(lon.toFixed(5)); }}>Use map centre</button>
      </div>
      {picking && <p role="status">Click a location on the map. You can adjust the coordinates below.</p>}
      <div className="coordinate-fields"><label>Latitude<input type="number" step="any" min={-85} max={85} required value={latitude} onChange={(e) => setLatitude(e.target.value)} /></label>
        <label>Longitude<input type="number" step="any" min={-180} max={180} required value={longitude} onChange={(e) => setLongitude(e.target.value)} /></label></div>
      <label>Watch radius (km)<input type="number" min={1} max={250} step={1} required value={radius} onChange={(e) => setRadius(e.target.value)} /></label>
      <p className="muted small">Location is checked only when you request it. Saved places stay in this browser and are available to connected WebMCP agents. Loading a forecast or gauges sends rounded coordinates to the provider through Nearcast.</p>
      <div className="button-row"><button type="submit" className="button primary">Save place</button><button type="button" className="link" onClick={() => { setOpen(false); store.set({ pickingPlace: false, pickedCoordinate: undefined }); }}>Cancel</button></div>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}
    {persistenceError && <p className="error" role="alert">{persistenceError}</p>}
    <PlaceBackup />
    <p className="muted small">Saved only in this browser. Watch radius filters the loaded data; it does not enable background monitoring or notifications.</p>
  </section>;
}
