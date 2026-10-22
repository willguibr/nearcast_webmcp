import { useMemo, useState } from "react";
import { AWARENESS_LABELS, safeWebUrl, usableAwarenessItems, type AwarenessItem, type AwarenessKind, type HighwayCamera } from "@nearcast/shared";
import { PlaceConditions } from "./PlaceConditions.tsx";
import { Preparation } from "./Preparation.tsx";
import { store } from "../state/index.ts";
import { useAppState } from "../hooks/useStore.ts";
import { briefText, describeItem, observationWarning, placeContext, type Nearby, type PlaceContext } from "../state/place-context.ts";

const date = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "Not reported";
const distance = (entry: Nearby<unknown>) => entry.coversPlace ? "Published area contains place" : `${entry.distanceKm.toFixed(1)} km from place`;

function OfficialLink({ url, children = "Official source" }: { url?: string; children?: string }) {
  const href = safeWebUrl(url);
  return href ? <a href={href} target="_blank" rel="noreferrer">{children} ↗</a> : <span className="muted">Source link unavailable</span>;
}

function CameraImage({ camera, demo }: { camera: HighwayCamera; demo: boolean }) {
  const [failed, setFailed] = useState(false);
  const url = safeWebUrl(camera.imageUrl);
  const allowed = (url && new URL(url).hostname === "www.drivebc.ca") || (demo && camera.imageUrl === "/demo-camera.svg");
  return failed || !allowed ? <p className="muted small">Image unavailable. Open DriveBC for the latest camera view.</p>
    : <img className="camera-image" src={camera.imageUrl} alt={camera.caption || camera.title} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

export function ContextDetails() {
  const state = useAppState((s) => s);
  const item = usableAwarenessItems(state.awareness, state.mock).find((x) => x.id === state.selectedContextId);
  if (!item) return null;
  const source = state.awareness?.sources.find((s) => s.id === item.sourceId);
  return <section className="panel context-detail" aria-label="Selected place information">
    <div className="section-heading"><h2>{item.title}</h2><button className="link" onClick={() => store.set({ selectedContextId: undefined })}>Close</button></div>
    <p>{describeItem(item)}</p>
    {observationWarning(item, state.mock) && <p className="data-caution">{observationWarning(item, state.mock)}</p>}
    {item.kind === "evacuation" && <><p>{item.area} · {item.eventType}</p><p className="instruction">Read the issuing authority’s instructions through EmergencyInfoBC. This dataset does not establish a safe route or confirm that an older notice remains in effect.</p></>}
    {item.kind === "air-quality" && <p>{item.note || "Observation at a reporting station. Conditions at your exact address may differ."}</p>}
    {item.kind === "road" && <><p className="description">{item.description}</p>{item.intervals.length > 0 && <p className="small">Published schedule: {item.intervals.join("; ")}</p>}<p className="muted small">Check the event’s schedule and DriveBC. Nearby events do not establish route availability.</p></>}
    {item.kind === "camera" && <CameraImage key={item.imageUrl} camera={item} demo={state.mock} />}
    <p className="small">Source updated: {date(item.updatedAt)} · Feed: {source?.status ?? "unknown"}<br />Retrieved: {date(source?.retrievedAt)}</p>
    <OfficialLink url={item.sourceUrl} />
  </section>;
}

function NearbyCard({ entry, demo, pinned, onPin }: { entry: Nearby<AwarenessItem>; demo: boolean; pinned: boolean; onPin: () => void }) {
  const item = entry.item;
  const warning = observationWarning(item, demo);
  return <article className={`context-card context-${item.kind}`}>
    <button className="context-title" onClick={() => store.focusContext(item.id)}>{item.title}</button>
    <p>{describeItem(item)}</p><p className="muted small">{distance(entry)}</p>
    {item.kind === "camera" && <><CameraImage key={item.imageUrl} camera={item} demo={demo} /><button className="button small-button" aria-pressed={pinned} onClick={onPin}>{pinned ? "Unpin camera" : "Pin camera"}</button></>}
    {warning && <p className="data-caution">{warning}</p>}
    <p className="muted small">Updated: {date(item.updatedAt)}</p><OfficialLink url={item.sourceUrl} />
  </article>;
}

function Comparison({ contexts }: { contexts: PlaceContext[] }) {
  if (contexts.length < 2) return <p className="muted">Save another place to compare their published conditions.</p>;
  return <div className="comparison-wrap"><table className="comparison-table"><caption>All saved places · loaded records within each watch radius</caption>
    <thead><tr><th>Place</th><th>Hazards</th><th>Published evacuation notices</th><th>Nearest AQHI</th><th>Road events</th></tr></thead>
    <tbody>{contexts.map((c) => {
      const aq = c.nearby.find((e) => e.item.kind === "air-quality");
      const value = (sourceId: string, content: string | number) => {
        const source = c.sourceStatus.find((s) => s.id === sourceId);
        if (!c.awarenessRetrievedAt || !source) return "Not loaded";
        if (!c.demo && source.retrievedAt && Date.parse(c.generatedAt) - Date.parse(source.retrievedAt) > 1800_000) return "Withheld · old data";
        return source.status === "error" ? "Unavailable" : `${content}${source.status === "available" ? "" : ` · ${source.status}`}`;
      };
      return <tr key={c.place.id}><th><button className="link" onClick={() => store.activatePlace(c.place.id)}>{c.place.name}</button><span className="muted small"> {c.place.radiusKm} km</span></th>
        <td>{c.coreRetrievedAt ? c.hazards.length : "Not loaded"}</td>
        <td>{value("bc-evacuations", c.nearby.filter((e) => e.item.kind === "evacuation").length)}</td>
        <td>{value("eccc-aqhi", aq?.item.kind === "air-quality" ? `${aq.item.displayValue} · ${aq.distanceKm.toFixed(1)} km` : "No nearby reading")}</td>
        <td>{value("drivebc-roads", c.nearby.filter((e) => e.item.kind === "road").length)}</td></tr>;
    })}</tbody></table><p className="muted small">Counts reflect different feed coverage and radii. They are not safety rankings. Check each place’s data notices and timestamps.</p></div>;
}

export function PlaceDashboard() {
  const state = useAppState((s) => s);
  const [compare, setCompare] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [showBrief, setShowBrief] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const contexts = useMemo(() => state.places.map((p) => placeContext(state, p)),
    [state.places, state.hazards, state.sources, state.awareness, state.retrievedAt, state.mock, state.error, state.awarenessError]);
  const context = contexts.find((c) => c.place.id === state.activePlaceId);
  const pinned = usableAwarenessItems(state.awareness, state.mock).filter((i): i is HighwayCamera => i.kind === "camera" && state.pinnedCameraIds.includes(i.id));
  const missingPins = state.pinnedCameraIds.filter((id) => !pinned.some((c) => c.id === id));
  if (!context) return <section className="panel welcome-panel"><span className="eyebrow">Near the places that matter</span><h2>A local view of a bigger picture.</h2><p>Add a saved place to bring hazards, air quality, published evacuation notices, roads, and cameras together.</p><p className="muted">Core hazards cover Canada and the US. New road, camera, and evacuation layers cover BC; AQHI covers Canadian reporting stations.</p></section>;
  const text = briefText(context);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setShareStatus("Brief copied. Review it before sharing."); }
    catch { setShowBrief(true); setShareStatus("Clipboard unavailable. Select and copy the brief below."); }
  }
  async function share() {
    try { await navigator.share({ title: `Nearcast · ${context!.place.name}`, text }); setShareStatus("Share sheet opened."); }
    catch (e) { if ((e as Error).name !== "AbortError") { setShowBrief(true); setShareStatus("Sharing unavailable. Copy the brief below."); } }
  }

  return <section className="place-dashboard" aria-label="Personal situation brief">
    <div className="panel brief-heading"><div><span className="eyebrow">{context.demo ? "Demo situation brief" : "Personal situation brief"}</span><h2>Near {context.place.name}</h2>
      <p className="muted">{context.place.radiusKm} km radius · All loaded hazard categories · Approximate distances</p></div>
      <div className="button-row"><button className="button" aria-pressed={compare} onClick={() => setCompare(!compare)}>Compare places</button>
        <button className="button" onClick={() => void copy()}>Copy brief</button>
        {typeof navigator.share === "function" && <button className="button" onClick={() => void share()}>Share brief</button>}
        <button className="link" onClick={() => setShowBrief(!showBrief)}>{showBrief ? "Hide text" : "Preview text"}</button></div>
      {shareStatus && <p role="status" className="small">{shareStatus}</p>}
      {showBrief && <textarea className="brief-text" readOnly aria-label="Shareable situation brief" value={text} rows={12} />}
      {compare && <Comparison contexts={contexts} />}
    </div>
    <div className="coverage-note"><strong>Coverage matters.</strong> {context.coverage}<br /><span className="small">{state.awarenessLoading ? "Refreshing additional feeds… " : ""}Exploratory map filters do not hide records from this brief.</span></div>
    {context.warnings.length > 0 && <div className="data-notices" role="status"><strong>Data notices</strong><ul>{context.warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>}
    <div className="panel"><h2>Nearby hazards <span className="count">{context.hazards.length}</span></h2>
      {!context.hazards.length && <p className="muted">No matching hazards in the loaded data. Check coverage and source status.</p>}
      <div className="context-grid">{context.hazards.slice(0, expanded.includes("hazards") ? undefined : 6).map((e) => <article className="context-card" key={e.item.id}>
        <button className="context-title" onClick={() => store.focusHazard(e.item.id)}>{e.item.title}</button>
        <p>{e.item.type === "weather" ? `${e.item.weather?.event ?? "Weather alert"} · ${e.item.severity}` : e.item.type === "wildfire" ? e.item.wildfire?.status : `Magnitude ${e.item.earthquake?.magnitude ?? "unknown"}`}</p>
        <p className="muted small">{distance(e)}{e.item.locationPrecision === "approximate" ? " · approximate source location" : ""}<br />Updated: {date(e.item.updatedAt)}</p><OfficialLink url={e.item.source.url} /></article>)}</div>
      {context.hazards.length > 6 && <button className="link" onClick={() => setExpanded((x) => x.includes("hazards") ? x.filter((k) => k !== "hazards") : [...x, "hazards"])}>{expanded.includes("hazards") ? "Show fewer hazards" : `Show all ${context.hazards.length} hazards`}</button>}
    </div>
    {(Object.keys(AWARENESS_LABELS) as AwarenessKind[]).sort((a,b) => Number(b === "evacuation")-Number(a === "evacuation")).map((kind) => {
      const entries = context.nearby.filter((e) => e.item.kind === kind);
      return <section className="panel" key={kind} aria-label={AWARENESS_LABELS[kind]}><h2>{AWARENESS_LABELS[kind]} <span className="count">{entries.length}</span></h2>
        {!entries.length && <p className="muted">No matching records in the loaded data. {kind === "air-quality" ? "There may be no reporting station within this radius." : "This integration covers BC only."} Check feed status below.</p>}
        <div className="context-grid">{entries.slice(0, expanded.includes(kind) ? undefined : 4).map((e) => <NearbyCard key={e.item.id} entry={e} demo={context.demo} pinned={state.pinnedCameraIds.includes(e.item.id)} onPin={() => { try { store.pinCamera(e.item.id, !state.pinnedCameraIds.includes(e.item.id)); } catch (err) { setShareStatus((err as Error).message); } }} />)}</div>
        {entries.length > 4 && <button className="link" onClick={() => setExpanded((x) => x.includes(kind) ? x.filter((k) => k !== kind) : [...x, kind])}>{expanded.includes(kind) ? "Show fewer" : `Show all ${entries.length}`}</button>}
      </section>;
    })}
    <PlaceConditions place={context.place} />
    <Preparation />
    {state.pinnedCameraIds.length > 0 && <section className="panel"><h2>Pinned cameras · all places</h2><div className="button-row">{pinned.map((c) => <button key={c.id} className="button" onClick={() => store.focusContext(c.id)}>{c.title}</button>)}</div>
      {missingPins.map((id) => <p key={id} className="small">Pinned camera unavailable in this snapshot: {id} <button className="link" onClick={() => store.pinCamera(id, false)}>Unpin</button></p>)}</section>}
    <section className="panel"><h2>Place feed status</h2><div className="feed-grid">{state.awareness?.sources.map((source) => <article key={source.id} className={`feed-status feed-${source.status}`}>
      <strong>{source.name}</strong><span>{source.status} · {source.count} records</span><p className="small">{source.coverage}</p>
      <p className="small muted">Retrieved: {date(source.retrievedAt)}{source.rejectedCount > 0 ? ` · ${source.rejectedCount} malformed records omitted` : ""}</p>{source.error && <p className="error">{source.error}</p>}<OfficialLink url={source.url} /></article>)}</div></section>
  </section>;
}
