import { useState } from "react";
import { exportPlaceBackup, parsePlaceBackup } from "../state/preferences.ts";
import { store } from "../state/index.ts";

export function PlaceBackup() {
  const [backup, setBackup] = useState<string>();
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState("");
  function download() {
    const blob = new Blob([exportPlaceBackup(store.getState())], { type: "application/json" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "nearcast-places.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Backup download requested. Check your downloads; it contains saved names and coordinates.");
  }
  return <details className="place-backup"><summary>Back up or restore places</summary>
    <p className="muted small">JSON backups contain your place names, coordinates and camera pins. Import is processed in this browser.</p>
    <button className="button" onClick={download}>Export places</button>
    <label>Choose a Nearcast backup<input type="file" accept="application/json,.json" onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = ""; setBackup(undefined); setMessage(""); if (!file) return;
      try { if (file.size > 100_000) throw new Error("Backup is too large (maximum 100 KB)."); const text = await file.text(); const parsed = parsePlaceBackup(text); setCount(parsed.places.length); setBackup(text); }
      catch (e) { setMessage((e as Error).message); }
    }} /></label>
    {backup && <div className="delete-confirm"><p>Replace the current saved places and pins with {count} places from this backup?</p>
      <button className="button" onClick={() => { store.importPlaces(backup); setBackup(undefined); setMessage("Places restored."); }}>Replace saved places</button>
      <button className="link" onClick={() => setBackup(undefined)}>Cancel import</button></div>}
    {message && <p role="status" className="small">{message}</p>}
  </details>;
}
