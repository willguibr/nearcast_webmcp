# WebMCP in Nearcast

Nearcast registers its tools with the imperative WebMCP API:

```ts
await document.modelContext.registerTool({
  name, description, inputSchema,
  annotations: { readOnlyHint },
  execute: async (input) => ({ content: [{ type: "text", text: JSON.stringify(result) }] }),
}, { signal });
```

`frontend/src/webmcp/register.ts` detects `document.modelContext` (falling back to `navigator.modelContext`), registers every tool, updates the header indicator, and unregisters via `AbortController` on unmount. If the API is missing the app runs normally and shows *Browser support not detected*.

Every tool wraps existing client-side state and actions in `frontend/src/state/store.ts`:

- `set_focus_area` sets the same camera request the "In view" list and marker clicks use.
- `focus_hazard` calls `store.focusHazard`, the same function a human click and list selection use.
- `get_current_view` reports the exact bounds/zoom the map last published and the filters the human set.

Results are MCP-style `{ content: [{ type: "text", text: <JSON> }] }`; failures return `{ isError: true, content: [...] }` with `{ ok: false, error: { code, message } }`. Codes: `invalid_input`, `invalid_region`, `invalid_bounds`, `unsupported_country`, `hazard_not_found`, `data_unavailable`, `tool_error`. Tools never throw into the host and never crash React.

Every call is appended to the **Agent Activity** panel (`time · tool · summary`). No personal information is logged.

## Tools

| Name | Read-only | Input |
|---|---|---|
| `get_current_view` | yes | none |
| `get_visible_hazards` | yes | `limit` (1–200, default 50), `hazardType` |
| `set_focus_area` | no | one of `regions[]`, `bounds{west,south,east,north}`, `latitude`+`longitude`(+`zoom`) |
| `set_hazard_filters` | no | `countries[]`, `hazardTypes[]`, `minimumSeverity` (or null), `minimumEarthquakeMagnitude` (or null) |
| `focus_hazard` | no | `hazardId` |
| `get_hazard_details` | yes | `hazardId` |
| `compare_regions` | yes | `regions[]` (2–8 codes/names) |
| `create_situation_context` | yes | `regions[]` (optional), `maxPerType` |

Region registry: all Canadian provinces/territories and all US states + DC, by code (`BC`, `WA`, `US-CA`, `CA-BC`) or name. `CA` alone is ambiguous and must be prefixed.

## Testing in Chrome (real host)

1. Use **Chrome 146+ on the Canary, Dev or Beta channel** (Stable does not ship the flag yet). Check `chrome://version`.
2. Open `chrome://flags`, search **WebMCP**, set *WebMCP for testing* to **Enabled**, click **Relaunch**.
3. Chrome also needs WebGL for the map: `chrome://settings/system` → *Use graphics acceleration when available* must be on (verify at `chrome://gpu`). Without it Nearcast shows a "WebGL is not available" panel; the list, details and tools still work.
4. Open the HTTPS Nearcast URL. The header should read **WebMCP ● Available · 8 tools**.
5. In DevTools console, Chrome's testing interface can drive the tools directly:

```js
console.table(navigator.modelContextTesting.listTools().map(t => ({ name: t.name, description: t.description })));
const r = await navigator.modelContextTesting.executeTool("set_focus_area", JSON.stringify({ regions: ["BC", "WA"] }));
console.log(JSON.parse(r));
await navigator.modelContextTesting.executeTool("set_hazard_filters", JSON.stringify({ hazardTypes: ["wildfire", "weather"], minimumSeverity: "severe" }));
```

The *Model Context Inspector* extension (Chrome Web Store) adds a side panel that lists registered tools and lets you call them with custom input.

## Manual harness (any browser)

Paste into the DevTools console of a running Nearcast page **before** the app loads tools (or reload after installing) to emulate a host:

```js
window.__tools = {};
document.modelContext = {
  registerTool: (t) => { window.__tools[t.name] = t; },
  unregisterTool: (n) => { delete window.__tools[n]; },
};
location.reload();
```

Then, after reload:

```js
JSON.parse((await __tools.get_current_view.execute({})).content[0].text);
await __tools.set_focus_area.execute({ regions: ["BC", "WA"] });
await __tools.set_hazard_filters.execute({ hazardTypes: ["wildfire", "weather"], minimumSeverity: "severe" });
const v = JSON.parse((await __tools.get_visible_hazards.execute({ limit: 5 })).content[0].text);
await __tools.focus_hazard.execute({ hazardId: v.hazards[0].id });
JSON.parse((await __tools.compare_regions.execute({ regions: ["BC", "WA"] })).content[0].text);
```

## Verified behaviours

- Tools register with names, descriptions and JSON-schema inputs.
- Mutating tools update React state and the map visibly (fitBounds / flyTo animations, marker highlight, details panel).
- Human changes (pan/zoom, filter checkboxes, marker clicks) are reflected by `get_current_view` on the next call.
- Malformed input yields structured errors rather than exceptions.
