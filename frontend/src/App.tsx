import { useCallback, useEffect, useRef } from "react";
import { store } from "./state/index.ts";
import { useAppState } from "./hooks/useStore.ts";
import { fetchHazards, isMockMode, loadMockHazards } from "./services/api.ts";
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

const REFRESH_MS = 3 * 60 * 1000;

export default function App() {
  const mockRef = useRef(isMockMode());
  const error = useAppState((s) => s.error);
  const loaded = useAppState((s) => s.hazards.length);
  const mock = useAppState((s) => s.mock);

  const refresh = useCallback(async () => {
    store.setLoading(true);
    try {
      const data = await fetchHazards(mockRef.current);
      store.setData(data);
    } catch (e) {
      store.setError(e instanceof Error ? e.message : "Failed to load hazards");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  // Register WebMCP tools once (they read the live store, so data readiness is handled inside each tool).
  useEffect(() => registerWebMcpTools(store), []);

  const useDemo = async () => {
    mockRef.current = true;
    store.setLoading(true);
    store.setData(await loadMockHazards());
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
      <main className="main">
        <div className="map-wrap">
          <HazardMap />
          <Legend />
        </div>
        <div className="panels">
          <div className="col col-filters"><FilterPanel /><SourcesPanel /></div>
          <div className="col col-details"><HazardDetails /><HazardList /></div>
          <div className="col col-agent"><AgentActivity /></div>
        </div>
      </main>
      <Disclaimer />
    </div>
  );
}
