import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import { createSpecterRegistry, type Quality, type SpecterScene } from "specter-core";
import { CommandBar, readFlags, SpecterCanvas, Toolbar } from "specter-ui";
import { createCommandController, decodeSpec, type CommandController, type Spec } from "specter-voice";
import { ALIASES, CHIPS, FACTS, HOTSPOTS, SWATCHES, VIEWS, buildLantern } from "./lantern";

const METAL_PARTS = ["frame", "cap", "base", "handle_ring", "handle_hook"];

type Op = Spec["ops"][number];
const mat = (mesh: string, patch: Record<string, unknown>): Op => ({ op: "setMaterial", mesh, ...patch });
const vis = (mesh: string, visible: boolean): Op => ({ op: "setVisibility", mesh, visible });

const FINISHES = [
  { name: "Matte", roughness: 0.9, metalness: 0.2 },
  { name: "Satin", roughness: 0.45, metalness: 0.8 },
  { name: "Polished", roughness: 0.12, metalness: 1 },
];
const GLASS = [
  { name: "Clear", color: "#cfe8ff", opacity: 0.28 },
  { name: "Smoked", color: "#4a4a52", opacity: 0.55 },
  { name: "Amber", color: "#ffb347", opacity: 0.4 },
  { name: "Ruby", color: "#e11d48", opacity: 0.45 },
];
const FLAMES = [
  { name: "Warm", emissive: "#ff9a2e" },
  { name: "Blue", emissive: "#3b82f6" },
  { name: "Green", emissive: "#22c55e" },
  { name: "Violet", emissive: "#a855f7" },
];

function loadLang(): string {
  try {
    return localStorage.getItem("specter-lang") || navigator.language || "en-US";
  } catch {
    return "en-US";
  }
}

/** Last value applied for a mesh property, so voice changes show up in the panel too. */
function lastValue(ops: Op[], mesh: string, key: string): unknown {
  for (let i = ops.length - 1; i >= 0; i--) {
    const o = ops[i]!;
    if (o.op === "setMaterial" && o.mesh === mesh && o[key] !== undefined) return o[key];
  }
  return undefined;
}
function lastVisible(ops: Op[], mesh: string, fallback: boolean): boolean {
  for (let i = ops.length - 1; i >= 0; i--) {
    const o = ops[i]!;
    if (o.op === "setVisibility" && o.mesh === mesh) return Boolean(o.visible);
  }
  return fallback;
}

export function App() {
  const flags = useMemo(() => readFlags(), []);
  const [scene, setScene] = useState<SpecterScene | null>(null);
  const [controller, setController] = useState<CommandController | null>(null);
  const [lang, setLangState] = useState(loadLang);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const langRef = useRef(lang);
  langRef.current = lang;

  const setLang = (l: string) => {
    setLangState(l);
    try {
      localStorage.setItem("specter-lang", l);
    } catch {
      /* private mode */
    }
  };

  const onReady = useCallback(
    async (s: SpecterScene) => {
      setScene(s);
      s.registerCameraPresets(VIEWS);
      s.applyLighting("night");
      s.setBackground(["#2b1a3d", "#07050d"]);
      s.setModel(buildLantern(), { fit: false });
      s.setHome(VIEWS.overview);
      s.flyTo(VIEWS.overview, 0);
      for (const h of HOTSPOTS) s.hotspots.add({ ...h, kind: "hotspot" });
      const registry = createSpecterRegistry();
      const c = createCommandController({
        registry,
        ctx: s,
        getContext: () => s.getSpecContext({ app: "crypt-forge", subject: "a 3D lantern that can be restyled", aliases: ALIASES, facts: FACTS }),
        interpretOptions: { endpoint: "/api/spec", localOnly: flags.nollm },
        onChange: bump,
      });
      c.subscribe(bump);
      setController(c);
      if (flags.spec) {
        const decoded = decodeSpec(flags.spec, registry, s.getSpecContext({ app: "crypt-forge", aliases: ALIASES }));
        if (decoded.ok) {
          const r = await c.applyQuietly(decoded.spec);
          if (!r.ok) s.toast("Part of the shared lantern couldn't be applied.");
        } else s.toast("That share link isn't valid.");
      }
    },
    [flags.nollm, flags.spec],
  );

  const apply = (ops: Op[], label: string) => {
    if (!controller) return;
    void controller.submitSpec({ version: 1, ops }, label, { autoApply: true });
  };

  const applied = controller?.getApplied().ops ?? [];
  const metalColor = lastValue(applied, "frame", "color");
  const glassColor = lastValue(applied, "glass", "color");
  const flameColor = lastValue(applied, "flame_body", "emissive") ?? lastValue(applied, "flame", "emissive");
  const ringShown = lastVisible(applied, "handle_ring", true);
  const hookShown = lastVisible(applied, "handle_hook", false);
  const capShown = lastVisible(applied, "cap", true);

  const resetAll = async () => {
    if (!controller) return;
    while (controller.getState().canUndo) await controller.undo();
    bump();
  };

  return (
    <div className={`sp-app ${flags.embed ? "sp-embed" : ""}`}>
      <header className="sp-header">
        <div className="sp-brand">
          <span className="sp-logo">Crypt Forge</span>
          <span className="sp-tag">Design a lantern. Click it or say it.</span>
        </div>
        {flags.demo && <span className="lf-demo">Demo mode</span>}
        <span className="sp-spacer" />
        <span className="sp-tag">Built on Specter</span>
      </header>

      <div className={`sp-main ${flags.embed ? "sp-no-side" : ""}`}>
        <aside className="sp-side" aria-label="Configurator">
          <h2>Your lantern</h2>
          <p>Every option here is a Specter Spec, the same as a spoken command. Say “make the frame gold” and the swatch follows.</p>

          <h3>Metalwork</h3>
          <div className="cf-swatches" role="group" aria-label="Metalwork colour">
            {SWATCHES.map((s) => (
              <button
                key={s.name}
                className="cf-swatch"
                style={{ background: s.color }}
                title={s.name}
                aria-label={`Metalwork ${s.name}`}
                aria-pressed={metalColor === s.color}
                onClick={() => apply(METAL_PARTS.map((m) => mat(m, { color: s.color })), `Metalwork ${s.name}`)}
                data-testid={`swatch-${s.name.toLowerCase()}`}
              />
            ))}
          </div>

          <h3>Finish</h3>
          <div className="sp-packs" role="group" aria-label="Finish">
            {FINISHES.map((f) => (
              <button key={f.name} className="sp-btn" onClick={() => apply(METAL_PARTS.map((m) => mat(m, { roughness: f.roughness, metalness: f.metalness })), `${f.name} finish`)}>
                {f.name}
              </button>
            ))}
          </div>

          <h3>Glass</h3>
          <div className="sp-packs" role="group" aria-label="Glass">
            {GLASS.map((g) => (
              <button key={g.name} className={`sp-btn ${glassColor === g.color ? "sp-active" : ""}`} aria-pressed={glassColor === g.color} onClick={() => apply([mat("glass", { color: g.color, opacity: g.opacity })], `${g.name} glass`)}>
                {g.name}
              </button>
            ))}
          </div>

          <h3>Flame</h3>
          <div className="sp-packs" role="group" aria-label="Flame">
            {FLAMES.map((f) => (
              <button key={f.name} className={`sp-btn ${flameColor === f.emissive ? "sp-active" : ""}`} aria-pressed={flameColor === f.emissive} onClick={() => apply([mat("flame", { emissive: f.emissive })], `${f.name} flame`)}>
                {f.name}
              </button>
            ))}
          </div>

          <h3>Handle</h3>
          <div className="sp-packs" role="group" aria-label="Handle">
            <button className={`sp-btn ${ringShown && !hookShown ? "sp-active" : ""}`} onClick={() => apply([vis("handle_ring", true), vis("handle_hook", false)], "Ring handle")} data-testid="handle-ring">
              Ring
            </button>
            <button className={`sp-btn ${hookShown && !ringShown ? "sp-active" : ""}`} onClick={() => apply([vis("handle_ring", false), vis("handle_hook", true)], "Hook handle")} data-testid="handle-hook">
              Hook
            </button>
            <button className={`sp-btn ${!hookShown && !ringShown ? "sp-active" : ""}`} onClick={() => apply([vis("handle_ring", false), vis("handle_hook", false)], "No handle")}>
              None
            </button>
          </div>

          <h3>Cap</h3>
          <div className="sp-packs" role="group" aria-label="Cap">
            <button className={`sp-btn ${capShown ? "sp-active" : ""}`} onClick={() => apply([vis("cap", true)], "Show cap")}>
              With cap
            </button>
            <button className={`sp-btn ${!capShown ? "sp-active" : ""}`} onClick={() => apply([vis("cap", false)], "Open top")}>
              Open top
            </button>
          </div>

          <div className="sp-row" style={{ marginTop: 18 }}>
            <button className="sp-btn" onClick={() => void controller?.undo()} disabled={!controller?.getState().canUndo}>
              ↶ Undo
            </button>
            <button className="sp-btn" onClick={() => void resetAll()} disabled={!controller?.getState().canUndo} data-testid="reset-btn">
              Reset
            </button>
          </div>
        </aside>

        <main className="sp-stage">
          <SpecterCanvas
            options={{
              lighting: "night",
              quality: flags.quality === "standard" || flags.quality === "cinematic" ? (flags.quality as Quality) : undefined,
              lang: () => langRef.current,
              onWarning: (w) => console.warn("[specter]", ...w),
              view: VIEWS.overview,
              autoRotate: false,
            }}
            onReady={onReady}
          />
          <Toolbar scene={scene} controller={controller} />
          {controller && <CommandBar controller={controller} chips={CHIPS} lang={lang} onLangChange={setLang} onApplied={bump} />}
        </main>
      </div>
    </div>
  );
}
