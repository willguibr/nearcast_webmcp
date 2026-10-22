import { afterEach, describe, expect, it, vi } from "vitest";
import { createStore, initialState } from "../src/state/store.ts";
import { exportPlaceBackup, parsePlaceBackup } from "../src/state/preferences.ts";
import { PREP_KEY } from "../src/state/preparation.ts";
import { extrasKey, loadPlaceExtra } from "../src/services/place-services.ts";
import { bindTool, TOOL_SPECS } from "../src/webmcp/tools.ts";
import { demoAwareness, DEMO_PLACE } from "../src/services/demo-awareness.ts";
import { observationWarning } from "../src/state/place-context.ts";
const memory=()=>{const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};};
afterEach(()=>vi.unstubAllGlobals());
describe("backup and preparation",()=>{
  it("round trips places and rejects corrupt imports before mutating state",()=>{
    const store=createStore(initialState,memory()); store.savePlace(DEMO_PLACE);
    const backup=exportPlaceBackup(store.getState()); expect(parsePlaceBackup(backup).places).toEqual(store.getState().places);
    const original=store.getState(); expect(()=>store.importPlaces('{"version":1,"places":[{}]}')).toThrow(); expect(store.getState()).toBe(original);
    expect(()=>parsePlaceBackup(backup.replace('"latitude": 49.7','"latitude": 200'))).toThrow();
    const restored=createStore(initialState,memory()); restored.importPlaces(backup); expect(restored.getState().places).toEqual(store.getState().places);
    expect(()=>parsePlaceBackup("x".repeat(100001))).toThrow(/large/);
  });
  it("persists checklist progress, rejects unknown ids and tolerates corrupt storage",()=>{
    const storage=memory(),store=createStore(initialState,storage); store.setPreparation("bag",true);
    expect(createStore(initialState,storage).getState().preparation).toEqual(["bag"]);
    expect(()=>store.setPreparation("invented",true)).toThrow();
    store.setPreparation("bag",false); expect(store.getState().preparation).toEqual([]);
    storage.setItem(PREP_KEY,"bad json"); expect(createStore(initialState,storage).getState().preparation).toEqual([]);
  });
});
describe("shared on-demand actions",()=>{
  it("demo tools load synthetic forecasts and gauges into the UI store without network calls",async()=>{
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    const store=createStore({...initialState,mock:true},memory()); const place=store.savePlace(DEMO_PLACE);
    for(const kind of ["forecast","gauges"] as const){
      const tool=bindTool(TOOL_SPECS.find(t=>t.name===`get_place_${kind}`)!,store);
      const result=await tool.execute({placeId:place.id}); expect(result).not.toHaveProperty("isError");
      expect(store.getState().placeExtras[extrasKey(place,true)][kind]?.demo).toBe(true);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps results separate after editing a place and switching data mode",async()=>{
    const store=createStore({...initialState,mock:true},memory());const place=store.savePlace(DEMO_PLACE);
    await loadPlaceExtra(store,place,"forecast");const edited=store.savePlace({...place,latitude:50});
    expect(store.getState().placeExtras[extrasKey(edited,true)]).toBeUndefined();
    expect(store.getState().placeExtras[extrasKey(place,false)]).toBeUndefined();
  });
  it("reports request failures without converting them to empty data",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({error:{message:"Unavailable"}}),{status:503})));
    const store=createStore(initialState,memory()),place=store.savePlace(DEMO_PLACE);
    await expect(loadPlaceExtra(store,place,"gauges")).rejects.toThrow("Unavailable");
    expect(store.getState().placeExtras[extrasKey(place,false)]).toMatchObject({gaugesError:"Unavailable",gaugesLoading:false});
  });
  it("distinguishes unrecognized and old evacuations without declaring newer records active",()=>{
    const item=demoAwareness().items.find(i=>i.kind==="evacuation")!;
    expect(observationWarning(item,false)).toContain("Confirm the current instructions");
    expect(observationWarning({...item,stage:"unknown"},false)).toContain("Unverified");
    expect(observationWarning({...item,olderRecord:true},false)).toContain("does not confirm");
  });
});
