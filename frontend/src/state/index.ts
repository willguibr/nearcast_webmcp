import { createStore } from "./store.ts";
import { browserStorage } from "./preferences.ts";
export * from "./store.ts";
/** The single shared application state used by both the human UI and WebMCP tools. */
export const store = createStore(undefined, browserStorage());
