import { useSyncExternalStore } from "react";
import { store, type AppState } from "../state/index.ts";

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()), () => selector(store.getState()));
}
