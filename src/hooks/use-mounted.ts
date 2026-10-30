import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Hydration-safe "has the client mounted yet" flag, no effect required. */
export function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
