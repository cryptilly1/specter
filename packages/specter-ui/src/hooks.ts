import { useEffect, useRef, useSyncExternalStore } from "react";
import type { CommandController, CommandState } from "specter-voice";

/** Subscribe a component to a command controller. */
export function useCommandState(controller: CommandController): CommandState {
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
}

/** Keep the latest value in a ref, so long-lived callbacks never close over stale props. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Read URL flags such as ?demo=1 and ?embed=1 once. */
export function readFlags(search = typeof location !== "undefined" ? location.search : "") {
  const p = new URLSearchParams(search);
  return {
    demo: p.get("demo") === "1",
    embed: p.get("embed") === "1",
    pack: p.get("pack"),
    spec: p.get("spec"),
    quality: p.get("quality"),
    nollm: p.get("nollm") === "1",
  };
}
