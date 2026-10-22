import { afterEach, describe, expect, it, vi } from "vitest";
import { parseFloods, parseRestrictions, parseWildfires } from "../adapters/canada/extended-awareness.ts";
import { AWARENESS_ADAPTERS, parseWebsiteRoads } from "../adapters/canada/awareness.ts";
import { coordinates, createPlaceServices, InputError, parseForecast, parseGauges } from "../services/place-services.ts";
import { createHandler } from "../handlers/api.ts";
const now = new Date("2026-10-22T12:00:00Z");
const polygon = {type:"Polygon",coordinates:[[[-123.2,49.6],[-123,49.6],[-123,49.8],[-123.2,49.8],[-123.2,49.6]]]};
const point = {type:"Point",coordinates:[-123.15,49.7]};
const fc = (properties: object, geometry: object = polygon) => ({type:"FeatureCollection",features:[{type:"Feature",properties,geometry}]});
afterEach(() => vi.unstubAllGlobals());

describe("provincial context", () => {
  it("uses DriveBC's fallback without turning a non-closure into an open road", async () => {
    const feed=[{id:"X",status:"ACTIVE",closed:false,location:point,route_display:"Highway 99",schedule:{intervals:["2026-10-25/2026-10-26"]}}];
    const parsed=parseWebsiteRoads(feed);
    expect(parsed.items[0]).toMatchObject({kind:"road",roads:[{state:"NOT SPECIFIED (check event)"}],intervals:["2026-10-25/2026-10-26"]});
    expect(parseWebsiteRoads([{...feed[0],closed:true}]).items[0]).toMatchObject({roads:[{state:"CLOSED"}]});
    const fetcher=vi.fn().mockResolvedValueOnce(new Response("Forbidden",{status:403})).mockResolvedValueOnce(new Response(JSON.stringify(feed)));
    vi.stubGlobal("fetch",fetcher);
    const data=await AWARENESS_ADAPTERS.find(a=>a.id==="drivebc-roads")!.fetch(now,new AbortController().signal);
    expect(data.notice).toContain("Open511 unavailable");expect(data.items).toHaveLength(1);
    expect(fetcher.mock.calls[1][0]).toBe("https://www.drivebc.ca/api/events/");
  });
  it("preserves flood semantics and withholds unknown advisory codes", () => {
    for (const [code, level] of [[2,"High streamflow advisory"],[3,"Flood watch"],[4,"Flood warning"]])
      expect(parseFloods(fc({OBJECTID:1,Advisory:code,Major_Basin:"Fraser"})).items[0]).toMatchObject({kind:"flood",level});
    expect(parseFloods(fc({OBJECTID:1,Advisory:1})).items).toEqual([]);
    expect(() => parseFloods(fc({OBJECTID:1,Advisory:9}))).toThrow(/No records/);
  });
  it("keeps bulletin effective dates distinct from unknown update time and sanitizes URLs", () => {
    expect(parseRestrictions(fc({OBJECTID:1,TYPE:"Campfire",BULLETIN_URL:"javascript:alert(1)",ACCESS_STATUS_EFFECTIVE_DATE:now.getTime()})).items[0])
      .toMatchObject({kind:"restriction",sourceUrl:"https://wildfiresituation.nrs.gov.bc.ca/",effectiveAt:now.toISOString(),updatedAt:undefined});
    expect(() => parseRestrictions(fc({OBJECTID:1},point))).toThrow();
  });
  it("joins perimeters by fire number and excludes old extinguished incidents", () => {
    const properties = {FIRE_NUMBER:"V1",FIRE_STATUS:"Under Control",LATITUDE:49.7,LONGITUDE:-123.15,CURRENT_SIZE:12.4,FIRE_CAUSE:"Lightning"};
    const parsed = parseWildfires(fc(properties,point),fc({FIRE_NUMBER:"V1"}),now);
    expect(parsed.items[0]).toMatchObject({kind:"wildfire-detail",geometry:polygon,perimeterAvailable:true,hectares:12.4});
    expect(parseWildfires(fc({...properties,FIRE_STATUS:"Out",FIRE_OUT_DATE:"2026-10-01"},point),{type:"FeatureCollection",features:[]},now).items).toEqual([]);
    expect(parseWildfires(fc(properties,point),{type:"FeatureCollection",features:[]},now).items[0]).toMatchObject({geometry:point,perimeterAvailable:false});
  });
});

const forecast = (time = now.toISOString()) => ({properties:{meta:{updated_at:time,units:{air_temperature:"celsius",wind_speed:"m/s",precipitation_amount:"mm"}},timeseries:[
  {time,data:{instant:{details:{air_temperature:12,wind_speed:5}},next_6_hours:{details:{precipitation_amount:2},summary:{symbol_code:"rain"}}}},
]}});
describe("on-demand data", () => {
  it("validates and rounds requested coordinates without treating blanks as zero", () => {
    expect(coordinates({lat:"49.700123",lon:"-123.123456"})).toEqual({latitude:49.7,longitude:-123.123,radiusKm:25});
    for (const query of [{lat:"",lon:"0"},{lat:"91",lon:"0"},{lat:"49",lon:"NaN"},{lat:"49",lon:"-123",radiusKm:"121"}])
      expect(() => coordinates(query)).toThrow(InputError);
  });
  it("converts forecast units and retains the precipitation period", () => {
    expect(parseForecast(forecast(),49.7,-123.15,now).periods[0]).toMatchObject({windKmh:18,precipitationMm:2,precipitationHours:6});
    const bad = forecast(); bad.properties.meta.units.wind_speed = "knots";
    expect(() => parseForecast(bad,49.7,-123.15,now)).toThrow(/units/);
    expect(() => parseForecast(forecast("2026-01-01T00:00:00Z"),49.7,-123.15,now)).toThrow(/No current/);
  });
  it("calculates each station's actual trend window, preserving zero and missing measurements", () => {
    const observation = (time: string, level: unknown, discharge: unknown, id="A") => fc({STATION_NUMBER:id,STATION_NAME:"River",DATETIME:time,LEVEL:level,DISCHARGE:discharge},point).features[0];
    const parsed = parseGauges({type:"FeatureCollection",features:[observation(now.toISOString(),1.2,0),observation("2026-10-22T06:00:00Z",1,null),observation(now.toISOString(),null,2,"B")]},49.7,-123.15,25,now);
    expect(parsed.gauges[0]).toMatchObject({changeMetres:expect.closeTo(.2),windowHours:6,dischargeCMS:0});
    expect(parsed.gauges[1].levelMetres).toBeUndefined(); expect(parsed.gauges[1].changeMetres).toBeUndefined();
    expect(parseGauges({type:"FeatureCollection",features:[observation("2026-09-01T00:00:00Z",2,1)]},49.7,-123.15,25,now).gauges).toEqual([]);
    expect(parseGauges({type:"FeatureCollection",features:[observation(now.toISOString(),1,1)]},44,-80,25,now).gauges).toEqual([]);
  });
  it("coalesces forecast requests and respects provider expiry", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(forecast(new Date().toISOString())),{headers:{Expires:new Date(Date.now()+3600_000).toUTCString(),"Last-Modified":new Date().toUTCString()}}));
    vi.stubGlobal("fetch",fetcher); const service = createPlaceServices();
    const query={lat:"49.7",lon:"-123.15"}; await Promise.all([service.forecast(query),service.forecast(query)]); await service.forecast(query);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toBeDefined();
  });
  it("does not return another place's cached data", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(forecast(new Date().toISOString()))));
    vi.stubGlobal("fetch",fetcher); const service = createPlaceServices();
    await service.forecast({lat:"49.7",lon:"-123.15"}); const second=await service.forecast({lat:"50",lon:"-123.15"});
    expect(second.latitude).toBe(50); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("validates API requests and does not cache private query responses at the edge", async () => {
    const places={search:vi.fn(async()=>[]),forecast:vi.fn(async()=>parseForecast(forecast(),49.7,-123.15,now)),gauges:vi.fn(async()=>{throw new InputError("Invalid coordinates");})};
    const handler=createHandler({places});
    const event=(path:string)=>({rawPath:path,requestContext:{http:{method:"GET"}},queryStringParameters:{lat:"49.7",lon:"-123.15"}} as any);
    const success=await handler(event("/api/forecast")); expect(success.statusCode).toBe(200); expect(success.headers?.["cache-control"]).toBe("no-store");
    expect((await handler(event("/api/gauges"))).statusCode).toBe(400);
    places.forecast.mockRejectedValueOnce(new Error("secret upstream detail"));
    const failure=await handler(event("/api/forecast")); expect(failure.statusCode).toBe(503); expect(failure.body).not.toContain("secret");
  });
});
