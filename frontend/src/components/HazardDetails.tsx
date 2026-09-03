import { useState } from "react";
import type { Hazard } from "@nearcast/shared";
import { store, selectSelectedHazard } from "../state/index.ts";
import { useAppState } from "../hooks/useStore.ts";
import { HazardIcon } from "./Icons.tsx";
import { SEVERITY_LABEL, SIGNIFICANCE_LABEL, TYPE_LABEL } from "../map/style.ts";
import { formatDateTime } from "../services/time.ts";
import { formatNumber } from "./HazardList.tsx";

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return <div className="kv"><dt>{label}</dt><dd>{value}</dd></div>;
}

function typeRows(h: Hazard) {
  if (h.type === "earthquake" && h.earthquake) {
    const e = h.earthquake;
    return <>
      <Row label="Magnitude" value={e.magnitude != null ? `${e.magnitude.toFixed(1)}${e.magnitudeType ? ` ${e.magnitudeType}` : ""}` : undefined} />
      <Row label="Depth" value={e.depthKm != null ? `${formatNumber(e.depthKm)} km` : undefined} />
      <Row label="Felt reports" value={e.feltReports} />
      <Row label="PAGER alert" value={e.alertLevel} />
      <Row label="Review status" value={e.reviewStatus} />
      <Row label="Tsunami flag" value={e.tsunami ? "Flagged by source" : undefined} />
    </>;
  }
  if (h.type === "wildfire" && h.wildfire) {
    const w = h.wildfire;
    return <>
      <Row label="Status" value={w.status} />
      <Row label="Size" value={w.areaHectares != null ? `${formatNumber(w.areaHectares)} ha${w.areaAcres != null ? ` (${formatNumber(w.areaAcres)} acres)` : ""}` : undefined} />
      <Row label="Containment" value={w.containmentPercent != null ? `${w.containmentPercent}%` : undefined} />
      <Row label="Cause" value={w.cause} />
      <Row label="Responsible agency" value={w.agency} />
      <Row label="Behaviour / response" value={w.behaviour} />
    </>;
  }
  if (h.type === "weather" && h.weather) {
    const w = h.weather;
    return <>
      <Row label="Event" value={w.event} />
      <Row label="Agency severity" value={h.severity === "unknown" ? h.rawSeverity ?? "Not rated" : `${SEVERITY_LABEL[h.severity]}${h.rawSeverity ? ` (${h.rawSeverity})` : ""}`} />
      <Row label="Urgency" value={w.urgency} />
      <Row label="Certainty" value={w.certainty} />
      <Row label="Area" value={w.areaDescription} />
      <Row label="Issued by" value={w.sender} />
    </>;
  }
  return null;
}

export function HazardDetails() {
  const h = useAppState(selectSelectedHazard);
  const [expanded, setExpanded] = useState(false);
  if (!h) {
    return (
      <section className="panel details-panel" aria-labelledby="details-title">
        <h2 id="details-title">Hazard details</h2>
        <p className="muted">Select a marker on the map or an item in the list. An AI agent connected through WebMCP can also select hazards for you.</p>
      </section>
    );
  }
  const desc = h.description ?? "";
  const long = desc.length > 420;
  return (
    <section className="panel details-panel" aria-labelledby="details-title">
      <div className="details-head">
        <h2 id="details-title"><HazardIcon type={h.type} size={18} /> {h.title}</h2>
        <button type="button" className="link" onClick={() => store.selectHazard(undefined)} aria-label="Close details">Close</button>
      </div>
      <p className="tags">
        <span className={`tag tag-${h.type}`}>{TYPE_LABEL[h.type]}</span>
        <span className="tag">{h.regionName ?? h.regionCode ?? h.country} · {h.country}</span>
        <span className="tag" title="Nearcast display significance — computed for map styling, not an official rating">Display significance: {SIGNIFICANCE_LABEL[h.significance]}</span>
      </p>
      <dl className="kvs">
        {typeRows(h)}
        <Row label="Started" value={h.startedAt ? formatDateTime(h.startedAt) : undefined} />
        <Row label="Expires" value={h.expiresAt ? formatDateTime(h.expiresAt) : undefined} />
        <Row label="Location" value={`${h.latitude.toFixed(3)}, ${h.longitude.toFixed(3)}${h.locationPrecision === "approximate" ? " (approximate — zone-based alert placed at county centroid)" : ""}`} />
      </dl>
      {desc && (
        <p className="description">
          {long && !expanded ? desc.slice(0, 420) + "…" : desc}
          {long && <button type="button" className="link" onClick={() => setExpanded((v) => !v)}>{expanded ? " Show less" : " Show more"}</button>}
        </p>
      )}
      {h.weather?.instruction && <p className="instruction"><strong>Agency instruction:</strong> {h.weather.instruction}</p>}
      <div className="attribution">
        <div><span className="attr-label">Source</span><span>{h.source.agency}</span></div>
        <div><span className="attr-label">Updated</span><span>{formatDateTime(h.updatedAt)}</span></div>
        <div><span className="attr-label">Official information</span>{h.source.url ? <a href={h.source.url} target="_blank" rel="noopener noreferrer">{new URL(h.source.url).host}</a> : <span>—</span>}</div>
        <div><span className="attr-label">Nearcast id</span><code>{h.id}</code></div>
      </div>
      <p className="muted small">Always follow instructions from local emergency authorities.</p>
    </section>
  );
}
