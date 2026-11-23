import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import { createSpecterRegistry, type Quality, type SpecterScene } from "specter-core";
import { CommandBar, readFlags, SpecterCanvas, Toolbar } from "specter-ui";
import { createCommandController, decodeSpec, type CommandController } from "specter-voice";
import { getPack, PACK_IDS, PACKS, type Pack } from "./packs";

function loadLang(): string {
  try {
    return localStorage.getItem("specter-lang") || navigator.language || "en-US";
  } catch {
    return "en-US";
  }
}

export function App() {
  const flags = useMemo(() => readFlags(), []);
  const [pack, setPack] = useState<Pack>(() => getPack(flags.pack));
  const [scene, setScene] = useState<SpecterScene | null>(null);
  const [controller, setController] = useState<CommandController | null>(null);
  const [lang, setLangState] = useState(loadLang);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadingPack, setLoadingPack] = useState(false);

  const langRef = useRef(lang);
  langRef.current = lang;
  const packRef = useRef(pack);
  const tickOff = useRef<(() => void) | null>(null);
  const controllerRef = useRef<CommandController | null>(null);

  const setLang = (l: string) => {
    setLangState(l);
    try {
      localStorage.setItem("specter-lang", l);
    } catch {
      /* private mode */
    }
  };

  /** Replace the scene content with a pack. Hotspots, presets, lighting, background and animation all follow. */
  const mountPack = useCallback(async (s: SpecterScene, next: Pack, instant = false) => {
    tickOff.current?.();
    tickOff.current = null;
    s.hotspots.clear();
    s.registerCameraPresets(next.views);
    s.setBackground(next.background);
    s.applyLighting(next.lighting);
    if (next.glb) await s.loadModel(next.glb, { fallback: next.build, fit: false });
    else s.setModel(next.build(), { fit: false });
    s.setHome(next.views.overview!);
    s.flyTo(next.views.overview!, instant ? 0 : 1.0);
    for (const h of next.hotspots) {
      try {
        s.hotspots.add({ ...h, kind: "hotspot" });
      } catch (e) {
        console.warn(`[learnforge] hotspot ${h.id} skipped: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (next.tick) tickOff.current = s.onFrame((dt) => next.tick!(s.modelSlot, dt));
    packRef.current = next;
    setPack(next);
    bump();
  }, []);

  const onReady = useCallback(
    async (s: SpecterScene) => {
      setScene(s);
      const registry = createSpecterRegistry({
        loadPack: async (id) => {
          const target = PACKS.find((p) => p.id === id);
          if (!target) throw new Error(`Unknown pack "${id}"`);
          const prev = packRef.current;
          await mountPack(s, target);
          controllerRef.current?.reset();
          return async () => {
            await mountPack(s, prev);
          };
        },
      });
      const c = createCommandController({
        registry,
        ctx: s,
        getContext: () =>
          s.getSpecContext({
            app: "learnforge",
            subject: packRef.current.subject,
            packs: PACK_IDS,
            aliases: packRef.current.aliases,
            facts: packRef.current.facts,
          }),
        interpretOptions: { endpoint: "/api/spec", localOnly: flags.nollm },
        onChange: () => bump(),
      });
      controllerRef.current = c;
      setController(c);
      c.subscribe(bump);
      await mountPack(s, getPack(flags.pack), true);
      if (flags.spec) {
        const decoded = decodeSpec(flags.spec, registry, s.getSpecContext({ app: "learnforge", packs: PACK_IDS, aliases: packRef.current.aliases }));
        if (decoded.ok) {
          const r = await c.applyQuietly(decoded.spec);
          if (!r.ok) s.toast("Part of the shared scene couldn't be applied.");
        } else {
          s.toast("That share link isn't valid.");
        }
      }
    },
    [flags.nollm, flags.pack, flags.spec, mountPack],
  );

  const switchPack = async (p: Pack) => {
    if (!scene || p.id === pack.id || loadingPack) return;
    setLoadingPack(true);
    try {
      await mountPack(scene, p);
      controller?.reset();
    } finally {
      setLoadingPack(false);
    }
  };

  const hotspots = scene?.hotspots.list() ?? [];

  return (
    <div className={`sp-app ${flags.embed ? "sp-embed" : ""}`}>
      <header className="sp-header">
        <div className="sp-brand">
          <span className="sp-logo">LearnForge</span>
          <span className="sp-tag">Explore in 3D. Edit with your voice.</span>
        </div>
        {flags.demo && <span className="lf-demo">Demo mode</span>}
        <span className="sp-spacer" />
        <span className="sp-tag">Built on Specter</span>
      </header>

      <div className={`sp-main ${flags.embed ? "sp-no-side" : ""}`}>
        <aside className="sp-side" aria-label="Subject and hotspots">
          <h2>{pack.title}</h2>
          <p>{pack.blurb}</p>

          <h3>Subjects</h3>
          <div className="sp-packs" role="group" aria-label="Choose a subject">
            {PACKS.map((p) => (
              <button key={p.id} className={`sp-btn lf-pack-btn ${p.id === pack.id ? "sp-active" : ""}`} aria-pressed={p.id === pack.id} onClick={() => void switchPack(p)} disabled={loadingPack} data-testid={`pack-${p.id}`}>
                {p.title}
              </button>
            ))}
          </div>

          <h3>Hotspots</h3>
          <ul className="sp-list" data-testid="hotspot-list">
            {hotspots.map((h) => (
              <li key={h.id}>
                <button
                  aria-current={selected === h.id}
                  onClick={() => {
                    scene?.hotspots.select(h.id);
                    setSelected(h.id);
                    if (h.mesh) {
                      try {
                        scene?.focusMesh(h.mesh);
                      } catch {
                        /* mesh missing: the panel still opens */
                      }
                    }
                  }}
                >
                  {h.kind === "note" ? "✎ " : ""}
                  {h.title}
                  <small>{h.mesh ?? "point"}</small>
                </button>
              </li>
            ))}
          </ul>

          <div className="lf-hint">
            Try saying <code>“Add a hotspot on the nucleus about DNA”</code> or <code>“Make the mitochondria glow red”</code>. You can also type it, or tap a suggestion below the scene.
          </div>
        </aside>

        <main className="sp-stage">
          <SpecterCanvas
            options={{
              quality: flags.quality === "standard" || flags.quality === "cinematic" ? (flags.quality as Quality) : undefined,
              lang: () => langRef.current,
              onHotspotSelect: (h) => setSelected(h?.id ?? null),
              onWarning: (w) => console.warn("[specter]", ...w),
              view: pack.views.overview,
            }}
            onReady={onReady}
          />
          <Toolbar scene={scene} controller={controller} shareParams={() => ({ pack: packRef.current.id })} />
          {controller && <CommandBar controller={controller} chips={pack.chips} lang={lang} onLangChange={setLang} onApplied={bump} />}
        </main>
      </div>
    </div>
  );
}
