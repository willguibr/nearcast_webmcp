import { createStore } from "./store.ts";
export * from "./store.ts";
/** The single shared application state used by both the human UI and WebMCP tools. */
export const store = createStore();
if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as { __nearcastStore?: typeof store }).__nearcastStore = store;
