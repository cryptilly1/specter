import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createSpecterRegistry, createStudioResolver, exportStudioGlb, StudioWorld, type GenerationJob, type Quality, type SpecterScene } from "specter-core";
import type { AssetCandidate, Provider } from "specter-library";
import { CommandBar, readFlags, SpecterCanvas, Toolbar, type Chip } from "specter-ui";
import { createCommandController, decodeSpec, type CommandController, type Spec } from "specter-voice";
import { Gizmo, type GizmoMode } from "./gizmo";
import { AddPanel, Credits, Outliner, Properties } from "./panels";

type Op = Spec["ops"][number];
const SAVE_KEY = "specter-studio-scene-v1";

interface Job {
  key: number;
  prompt: string;
  job: GenerationJob;
  op: Op;
  progress: number;
  error?: string;
}

const EMPTY_CHIPS: Chip[] = [
  { label: "Build a solar eclipse", text: "Build a solar eclipse" },
  { label: "Phases of the Moon", text: "Show me the phases of the moon" },
  { label: "Make an atom", text: "Make an atom" },
  { label: "The water cycle", text: "Build the water cycle" },
  { label: "A volcano", text: "Build a volcano" },
  { label: "A plant cell", text: "Build a plant cell" },
  { label: "A little house", text: "Build a house" },
];

function chipsFor(ids: string[]): Chip[] {
  if (!ids.length) return EMPTY_CHIPS;
  const first = ids[0]!.replace(/_/g, " ");
  const has = (n: string) => ids.some((i) => i === n || i.startsWith(`${n}_`));
  const out: Chip[] = [];
  if (has("solar_eclipse")) out.push({ label: "Moon orbits Earth", text: "Make the moon orbit the earth" }, { label: "Click the Sun", text: "When I click the sun, show that the Sun is a star about 150 million km away" });
  if (has("atom")) out.push({ label: "Spin faster", text: "Make the outer shell spin fast" });
  out.push(
    { label: "Add a tree", text: "Add a tree" },
    { label: "Five lanterns in a ring", text: "Add five lanterns in a ring" },
    { label: "Make it night", text: "Make it night" },
    { label: `Spin ${first}`, text: `Make the ${first} spin slowly` },
    { label: `Move ${first} left`, text: `Move the ${first} left by 2` },
  );
  return out.slice(0, 7);
}

function loadLang(): string {
  try {
    return localStorage.getItem("specter-lang") || navigator.language || "en-US";
  } catch {
    return "en-US";
  }
}

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function App() {
  const flags = useMemo(() => readFlags(), []);
  const [scene, setScene] = useState<SpecterScene | null>(null);
  const [world, setWorld] = useState<StudioWorld | null>(null);
  const [controller, setController] = useState<CommandController | null>(null);
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setModeState] = useState<"edit" | "play">(flags.embed ? "play" : "edit");
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");
  const [caps, setCaps] = useState<{ providers: Provider[]; generate: boolean }>({ providers: ["catalogue", "polyhaven"], generate: false });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [lang, setLangState] = useState(loadLang);
  const [paused, setPaused] = useState(false);

  const gizmo = useRef<Gizmo | null>(null);
  const capsRef = useRef(caps);
  capsRef.current = caps;
  const langRef = useRef(lang);
  langRef.current = lang;
  const searchRef = useRef<(q: string) => Promise<{ candidates: AssetCandidate[]; notes: string[] }>>(async () => ({ candidates: [], notes: [] }));
  const jobKey = useRef(1);
  const lastCount = useRef(0);

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
      const w = new StudioWorld(s);
      w.lang = () => langRef.current;
      s.applyLighting("studio");
      s.setBackground(["#2a1d44", "#0b0813"]);
      s.setHome({ position: [9, 6.5, 13], target: [0, 1, 0] });
      s.flyTo({ position: [9, 6.5, 13], target: [0, 1, 0] }, 0);

      const registry = createSpecterRegistry({ studio: w });
      const resolver = createStudioResolver({
        scene: s,
        onGenerate: (job, op) => setJobs((j) => [...j, { key: jobKey.current++, prompt: (op.source as { prompt: string }).prompt, job, op, progress: 0 }]),
      });
      searchRef.current = resolver.search;
      const c = createCommandController({
        registry,
        ctx: s,
        getContext: () => w.context({ libraries: true, generate: capsRef.current.generate }),
        interpretOptions: { endpoint: "/api/spec", timeoutMs: 20000, localOnly: flags.nollm },
        resolve: resolver.resolve,
        onChange: (applied) => {
          // frame the scene the first time something appears, and after a recipe is built
          const count = w.ids().length;
          const lastOps = applied.ops.slice(-40);
          if ((lastCount.current === 0 && count > 0) || (count > lastCount.current && lastOps.some((o) => o.op === "setEnvironment"))) {
            requestAnimationFrame(() => s.fitCameraToModel(0.9, 1.15));
          }
          lastCount.current = count;
          // "Reset view" always frames the whole scene
          const v = s.frameView(1.15);
          if (v) s.setHome(v);
          try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(applied));
          } catch {
            /* storage full or private mode: autosave is best-effort */
          }
          bump();
        },
      });
      c.subscribe(bump);
      w.onChange = bump;
      w.onSelect = (id) => setSelected(id);

      const g = new Gizmo(s, (t) => {
        void c.submitSpec({ version: 1, ops: [{ op: "transform", target: t.id, position: t.position, rotation: t.rotation, scale: t.scale }] }, `Move ${t.id}`, { autoApply: true });
      });
      w.pickGuard = () => g.busy;
      gizmo.current = g;

      setScene(s);
      setWorld(w);
      setController(c);
      if (flags.embed) w.setMode("play");

      fetch("/api/assets")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setCaps({ providers: d.providers ?? ["catalogue", "polyhaven"], generate: Boolean(d.generate) }))
        .catch(() => undefined);

      // restore: a share link wins, otherwise the last autosave
      let restored: Spec | null = null;
      if (flags.spec) {
        const d = decodeSpec(flags.spec, registry, w.context(), { maxLength: 400_000 });
        if (d.ok) restored = d.spec;
        else s.toast("That share link isn't valid.");
      } else if (!flags.embed) {
        try {
          const raw = localStorage.getItem(SAVE_KEY);
          if (raw) {
            const parsed = registry.parseSpec(JSON.parse(raw), w.context());
            if (parsed.ok) restored = parsed.spec;
          }
        } catch {
          /* ignore a corrupt autosave */
        }
      }
      if (restored) {
        s.showLoading("Rebuilding the scene…");
        const r = await c.applyQuietly(restored);
        s.hideLoading();
        if (!r.ok) s.toast(flags.spec ? "Part of the shared scene couldn't be rebuilt." : "Your last scene couldn't be fully restored.");
        else if (!flags.spec) s.toast("Restored your last scene. Use New to start fresh.", 3500);
        if (w.ids().length) s.fitCameraToModel(0, 0.9);
      }
    },
    [flags.embed, flags.nollm, flags.spec],
  );

  // keep the gizmo on the selected object in edit mode
  useEffect(() => {
    const g = gizmo.current;
    if (!g || !world) return;
    const rec = selected ? world.objects.get(selected) : undefined;
    if (selected && !rec) setSelected(null);
    g.setEnabled(mode === "edit");
    g.attach(mode === "edit" && rec ? rec.id : null, mode === "edit" && rec ? rec.object : null);
  }, [selected, mode, world, version]);

  useEffect(() => {
    gizmo.current?.setMode(gizmoMode);
  }, [gizmoMode]);

  const setMode = (m: "edit" | "play") => {
    world?.setMode(m);
    setModeState(m);
    if (m === "play") setSelected(null);
  };

  const submit = useCallback(
    (ops: Op[], label: string) => {
      if (controller) void controller.submitSpec({ version: 1, ops }, label, { autoApply: true });
    },
    [controller],
  );

  // keyboard shortcuts (ignored while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void controller?.undo();
        return;
      }
      if (mode !== "edit") return;
      if (e.key === "w" || e.key === "W") setGizmoMode("translate");
      else if (e.key === "e" || e.key === "E") setGizmoMode("rotate");
      else if (e.key === "r" || e.key === "R") setGizmoMode("scale");
      else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        submit([{ op: "removeObject", id: selected }], `Delete ${selected}`);
      } else if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controller, mode, selected, submit]);

  // poll Meshy jobs
  useEffect(() => {
    const active = jobs.filter((j) => !j.error && j.progress < 100);
    if (!active.length || !controller) return;
    const timer = setInterval(async () => {
      for (const j of active) {
        try {
          const res = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: j.prompt, job: j.job }) });
          const d = (await res.json()) as { ok?: boolean; job?: GenerationJob; progress?: number; done?: boolean; candidate?: AssetCandidate; error?: string };
          if (!d.ok) {
            setJobs((all) => all.map((x) => (x.key === j.key ? { ...x, error: d.error ?? "Generation failed" } : x)));
            continue;
          }
          if (d.done && d.candidate) {
            const c = d.candidate;
            setJobs((all) => all.map((x) => (x.key === j.key ? { ...x, progress: 100 } : x)));
            const op = { ...(j.op as Record<string, unknown>), height: (j.op as { height?: number }).height ?? 1, source: { type: "asset", provider: c.provider, assetId: c.assetId, title: c.title, url: c.url, license: c.license, credit: c.credit, sourceUrl: c.sourceUrl, ...(c.thumbnail ? { thumbnail: c.thumbnail } : {}) } } as unknown as Op;
            void controller.submitSpec({ version: 1, ops: [op] }, `Generated “${j.prompt}”`);
          } else {
            setJobs((all) => all.map((x) => (x.key === j.key ? { ...x, job: d.job ?? x.job, progress: d.progress ?? x.progress } : x)));
          }
        } catch {
          /* transient network error: try again next tick */
        }
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [jobs, controller]);

  const newScene = () => {
    if (!world || !controller || !scene) return;
    if (world.ids().length && !confirm("Start a new empty scene? Your current scene will be cleared (save it first if you want to keep it).")) return;
    world.clear();
    scene.hotspots.clear();
    void world.setEnvironment({ op: "setEnvironment", preset: "studio" });
    controller.reset();
    setSelected(null);
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
    scene.resetView();
    bump();
  };

  const saveFile = () => {
    if (!controller) return;
    download("specter-scene.json", JSON.stringify({ app: "specter-studio", spec: controller.getApplied() }, null, 2), "application/json");
  };

  const openFile = async (file: File) => {
    if (!world || !controller || !scene) return;
    try {
      const data = JSON.parse(await file.text());
      const spec = data?.spec ?? data;
      world.clear();
      scene.hotspots.clear();
      controller.reset();
      scene.showLoading("Opening scene…");
      const r = await controller.applyQuietly(spec);
      scene.hideLoading();
      if (!r.ok) scene.toast(`Couldn't open that file: ${r.errors[0] ?? "invalid scene"}`);
      else scene.fitCameraToModel(0.6, 0.9);
    } catch {
      scene.hideLoading();
      scene.toast("That file isn't a Specter scene.");
    }
  };

  const exportGlb = async () => {
    if (!world || !scene) return;
    if (!world.ids().length) return scene.toast("Add something first.");
    try {
      download("specter-scene.glb", await exportStudioGlb(world), "model/gltf-binary");
    } catch (e) {
      scene.toast(`Export failed: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  };

  const generate = (prompt: string) => {
    if (!controller) return;
    void controller.submit(`generate ${prompt}`, { localOnly: true });
  };

  const ids = world?.ids() ?? [];
  const chips = useMemo(() => chipsFor(ids), [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const editing = mode === "edit" && !flags.embed;

  return (
    <div className={`sp-app st-app ${flags.embed ? "sp-embed" : ""} ${editing ? "" : "st-playing"}`}>
      <header className="sp-header">
        <div className="sp-brand">
          <span className="sp-logo">Specter Studio</span>
          <span className="sp-tag">Say what you want to see.</span>
        </div>
        {flags.demo && <span className="lf-demo">Demo mode</span>}
        <span className="sp-spacer" />
        <div className="st-modes" role="group" aria-label="Mode">
          <button className={`sp-btn ${mode === "edit" ? "sp-active" : ""}`} aria-pressed={mode === "edit"} onClick={() => setMode("edit")} data-testid="mode-edit">
            ✎ Edit
          </button>
          <button className={`sp-btn ${mode === "play" ? "sp-active" : ""}`} aria-pressed={mode === "play"} onClick={() => setMode("play")} data-testid="mode-play">
            ▶ Play
          </button>
        </div>
        <button className="sp-btn" onClick={newScene} data-testid="new-scene">
          New
        </button>
        <label className="sp-btn st-file">
          Open
          <input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && void openFile(e.target.files[0])} />
        </label>
        <button className="sp-btn" onClick={saveFile}>
          Save
        </button>
        <button className="sp-btn" onClick={() => void exportGlb()} data-testid="export-glb">
          Export GLB
        </button>
      </header>

      <div className={`st-main ${editing ? "" : "st-main-play"}`}>
        {editing && world && (
          <aside className="sp-side st-left" aria-label="Scene">
            <Outliner world={world} selected={selected} onSelect={setSelected} submit={submit} version={version} />
            <AddPanel world={world} submit={submit} search={(q) => searchRef.current(q)} generateEnabled={caps.generate} onGenerate={generate} libraries={caps.providers} />
            <Credits world={world} version={version} />
          </aside>
        )}

        <main className="sp-stage">
          <SpecterCanvas
            options={{
              quality: flags.quality === "standard" || flags.quality === "cinematic" ? (flags.quality as Quality) : undefined,
              lang: () => langRef.current,
              onWarning: (w) => console.warn("[specter]", ...w),
              view: { position: [9, 6.5, 13], target: [0, 1, 0] },
            }}
            onReady={onReady}
            onDispose={() => {
              gizmo.current?.dispose();
              world?.destroy();
            }}
          />
          <Toolbar scene={scene} controller={controller} shareParams={() => ({})}>
            {editing && (
              <div className="st-gizmo" role="group" aria-label="Transform tool">
                {(["translate", "rotate", "scale"] as GizmoMode[]).map((m, i) => (
                  <button key={m} className={`sp-btn ${gizmoMode === m ? "sp-active" : ""}`} aria-pressed={gizmoMode === m} onClick={() => setGizmoMode(m)} title={`${m} (${"WER"[i]})`}>
                    {m === "translate" ? "✥ Move" : m === "rotate" ? "⟳ Rotate" : "⤡ Scale"}
                  </button>
                ))}
              </div>
            )}
            <button
              className={`sp-btn ${paused ? "sp-active" : ""}`}
              aria-pressed={paused}
              onClick={() => {
                world?.setMotionPaused(!paused);
                setPaused(!paused);
              }}
            >
              {paused ? "▶ Motion" : "❚❚ Motion"}
            </button>
          </Toolbar>

          {world && ids.length === 0 && editing && (
            <div className="st-empty" data-testid="empty-state">
              <h1>Start with a sentence</h1>
              <p>Say or type what you want to see: “build a solar eclipse”, “add a red sphere”, “add five trees in a ring”. Or pick a shape, recipe or free model on the left.</p>
            </div>
          )}

          {jobs.some((j) => j.progress < 100 || j.error) && (
            <div className="st-jobs" role="status">
              {jobs
                .filter((j) => j.progress < 100 || j.error)
                .map((j) => (
                  <div key={j.key} className="sp-card st-job">
                    <strong>Generating “{j.prompt}”</strong>
                    {j.error ? (
                      <div className="sp-error">
                        {j.error}{" "}
                        <button className="sp-btn" onClick={() => setJobs((all) => all.filter((x) => x.key !== j.key))}>
                          Dismiss
                        </button>
                      </div>
                    ) : (
                      <div className="hw-bar" aria-label={`${j.progress}%`}>
                        <i style={{ width: `${Math.max(4, j.progress)}%` }} />
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {controller && !flags.embed && mode === "edit" && <CommandBar controller={controller} chips={chips} lang={lang} onLangChange={setLang} placeholder="Say or type: “build a solar eclipse”" onApplied={bump} />}
          {mode === "play" && !flags.embed && (
            <div className="st-playhint sp-card" role="status">
              Play mode: click things to see what they do. <button className="sp-btn" onClick={() => setMode("edit")}>Back to editing</button>
            </div>
          )}
        </main>

        {editing && world && selected && world.objects.has(selected) && (
          <aside className="sp-side st-right" aria-label="Properties">
            <Properties world={world} id={selected} submit={submit} version={version} />
          </aside>
        )}
      </div>
    </div>
  );
}
