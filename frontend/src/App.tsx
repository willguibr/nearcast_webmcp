import { useCallback, useEffect, useRef } from "react";
import { store } from "./state/index.ts";
import { useAppState } from "./hooks/useStore.ts";
import { fetchHazards, isMockMode } from "./services/api.ts";
import { registerWebMcpTools } from "./webmcp/register.ts";
import { HazardMap } from "./map/HazardMap.tsx";
import { Header } from "./components/Header.tsx";
import { FilterPanel } from "./components/FilterPanel.tsx";
import { SourcesPanel } from "./components/SourcesPanel.tsx";
import { HazardList } from "./components/HazardList.tsx";
import { HazardDetails } from "./components/HazardDetails.tsx";
import { AgentActivity } from "./components/AgentActivity.tsx";
import { Legend } from "./components/Legend.tsx";
import { Disclaimer } from "./components/Disclaimer.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { fetchAwareness } from "./services/awareness-api.ts";
import { PlacesPanel } from "./components/PlacesPanel.tsx";
import { ContextDetails, PlaceDashboard } from "./components/PlaceDashboard.tsx";
import { AWARENESS_LABELS, type AwarenessKind } from "@nearcast/shared";

const REFRESH_MS = 3 * 60 * 1000;

export default function App() {
  const mockRef = useRef(isMockMode());
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const error = useAppState((s) => s.error);
  const loaded = useAppState((s) => s.hazards.length);
  const mock = useAppState((s) => s.mock);
  const workspaceView = useAppState((s) => s.workspaceView);
  const layers = useAppState((s) => s.awarenessLayers);
  const picking = useAppState((s) => s.pickingPlace);
  const selectedHazardId = useAppState((s) => s.selectedHazardId);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 28000);
    store.setLoading(true);
    store.set({ awarenessLoading: true });
    const demo = mockRef.current;
    const [hazards, awareness] = await Promise.allSettled([fetchHazards(demo, abort.signal), fetchAwareness(demo, abort.signal)]);
    clearTimeout(timeout);
    if (generation.current !== request) return;
    if (hazards.status === "fulfilled") store.setData(hazards.value);
    else store.setError(hazards.reason instanceof Error ? hazards.reason.message : "Failed to load hazards");
    if (awareness.status === "fulfilled") store.setAwareness(awareness.value);
    else store.setAwarenessError(awareness.reason instanceof Error ? awareness.reason.message : "Failed to load additional feeds");
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    const active = store.getState().activePlaceId;
    if (active) store.activatePlace(active);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); generation.current++; controller.current?.abort(); };
  }, [refresh]);

  // Register WebMCP tools once (they read the live store, so data readiness is handled inside each tool).
  useEffect(() => registerWebMcpTools(store), []);

  const useDemo = async () => {
    mockRef.current = true;
    await refresh();
  };

  return (
    <div className="app">
      <Header onRefresh={() => void refresh()} />
      {error && loaded === 0 && (
        <div className="banner banner-error" role="alert">
          Live hazard data is unavailable right now ({error}).{" "}
          <button type="button" className="link" onClick={() => void useDemo()}>Load clearly-labelled demo data</button>
        </div>
      )}
      {mock && <div className="banner banner-demo">DEMO DATA — synthetic hazards for demonstration only. This is not live government information.</div>}
      <nav className="workspace-tabs" aria-label="Workspace"><div className="button-row">
        <button aria-pressed={workspaceView === "places"} onClick={() => store.set({ workspaceView: "places" })}>My places</button>
        <button aria-pressed={workspaceView === "explore"} onClick={() => store.set({ workspaceView: "explore" })}>Explore hazards</button>
      </div><span className="muted small">{mock ? "Synthetic demonstration" : "Public source data · no continuous location tracking"}</span></nav>
      <main className={`main ${workspaceView === "places" ? "places-workspace" : "explore-workspace"}`}>
        {workspaceView === "places" && <aside className="places-sidebar"><PlacesPanel /><SourcesPanel /><AgentActivity /></aside>}
        <div className={workspaceView === "places" ? "places-content" : "explore-content"}>
        <div className="map-wrap">
          <ErrorBoundary fallback={(e) => <div className="map-fallback" role="alert">The map failed to render ({e.message}). The rest of Nearcast, including the WebMCP tools, keeps working.</div>}>
            <HazardMap />
          </ErrorBoundary>
          <Legend />
          <div className="context-map-controls" aria-label="Additional map layers">{(Object.keys(AWARENESS_LABELS) as AwarenessKind[]).map((kind) => <label key={kind}><input type="checkbox" checked={layers.includes(kind)} onChange={() => store.toggleAwarenessLayer(kind)} />{AWARENESS_LABELS[kind]}</label>)}</div>
          {picking && <div className="map-pick-banner" role="status">Click the map to choose your place. <button onClick={() => store.set({ pickingPlace: false })}>Cancel</button></div>}
        </div>
        {workspaceView === "places" ? <div className="place-results"><ContextDetails />{selectedHazardId && <HazardDetails />}<PlaceDashboard /></div> : <div className="panels">
          <div className="col col-filters"><FilterPanel /><SourcesPanel /></div>
          <div className="col col-details"><ContextDetails /><HazardDetails /><HazardList /></div>
          <div className="col col-agent"><AgentActivity /></div>
        </div>}
        </div>
      </main>
      <Disclaimer />
    </div>
  );
}
