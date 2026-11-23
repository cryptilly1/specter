import { useEffect, useRef } from "react";
import { createSpecterScene, type SpecterScene, type SpecterSceneOptions } from "specter-core";
import { useLatest } from "./hooks";

export interface SpecterCanvasProps {
  options?: SpecterSceneOptions;
  /** Called once the scene exists. Build your model and register ops here. */
  onReady: (scene: SpecterScene) => void | Promise<void>;
  /** Called just before the scene is destroyed (unmount). */
  onDispose?: () => void;
  className?: string;
}

/** Hosts a SpecterScene in a div and destroys it on unmount, so route changes never leak GPU memory. */
export function SpecterCanvas({ options, onReady, onDispose, className }: SpecterCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const ready = useLatest(onReady);
  const dispose = useLatest(onDispose);
  const opts = useLatest(options);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const scene = createSpecterScene(el, opts.current);
    // `?debug=1` exposes the scene for automated tests and demos
    if (new URLSearchParams(location.search).has("debug")) (window as unknown as { __specter?: unknown }).__specter = scene;
    let cancelled = false;
    Promise.resolve(ready.current(scene)).catch((e) => {
      if (!cancelled) scene.toast(e instanceof Error ? e.message : "Something went wrong while loading the scene.");
    });
    return () => {
      cancelled = true;
      dispose.current?.();
      scene.destroy();
    };
    // the scene is created once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className={className ?? "sp-canvas"} />;
}
