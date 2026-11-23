import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assetExists, createSpecterRegistry, fetchModelConfig, loadSplatScene, type Keyframe, type ModelConfig, type Quality, type SpecterScene, type SplatHandle } from "specter-core";
import { CommandBar, readFlags, SpecterCanvas, Toolbar, type Chip } from "specter-ui";
import { createCommandController, createSpeaker, decodeSpec, isSpeechOutputSupported, type CommandController, type Speaker } from "specter-voice";
import { buildApartment, TOUR, TOUR_VIEWS } from "./apartment";
import { ALIASES, APP_ID, CHIPS, FACTS, HOTSPOTS } from "./content";

interface Stop {
  id: string;
  label: string;
  t: number;
  hold?: number;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  title: string;
  body: string;
}

type SceneKind = "apartment" | "place";

const APARTMENT_GLB = "/models/apartment.glb";
const PLACE_URLS = ["/models/place.spz", "/models/place.ply", "/models/place.splat"];

function loadLang(): string {
  try {
    return localStorage.getItem("specter-lang") || navigator.language || "en-US";
  } catch {
    return "en-US";
  }
}

const toKeyframes = (stops: readonly Stop[]): Keyframe[] =>
  stops.map((k) => ({ id: k.id, label: k.label, t: k.t, hold: k.hold ?? 0, position: [...k.position], target: [...k.target] }));

/** A two-stop fly-around, used when a supplied model has no tour in its sidecar. */
function orbitTour(home: { position: [number, number, number]; target: [number, number, number] }): Stop[] {
  const [tx, ty, tz] = home.target;
  const dx = home.position[0] - tx;
  const dz = home.position[2] - tz;
  const a = Math.PI / 2;
  const rx = dx * Math.cos(a) - dz * Math.sin(a);
  const rz = dx * Math.sin(a) + dz * Math.cos(a);
  return [
    { id: "overview", label: "Overview", t: 0, hold: 0, position: home.position, target: home.target, title: "Overview", body: "The whole scene. Add a tour for this model in its .config.json file." },
    { id: "around", label: "Around", t: 10, hold: 3, position: [tx + rx, home.position[1], tz + rz], target: [tx, ty, tz], title: "From the side", body: "A second angle on the same model." },
  ];
}

interface SceneCtx {
  aliases: Record<string, string>;
  facts: Record<string, string>;
  subject: string;
  ops?: string[];
  chips: Chip[];
}

export function App() {
  const flags = useMemo(() => readFlags(), []);
  const [scene, setScene] = useState<SpecterScene | null>(null);
  const [controller, setController] = useState<CommandController | null>(null);
  const [lang, setLangState] = useState(loadLang);
  const [stops, setStops] = useState<readonly Stop[]>(TOUR);
  const [room, setRoom] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [started, setStarted] = useState(flags.embed);
  const [speaking, setSpeaking] = useState(false);
  const [kind, setKind] = useState<SceneKind>("apartment");
  const [hasPlace, setHasPlace] = useState<string | null>(null);
  const [chips, setChips] = useState<Chip[]>(CHIPS);
  const [busy, setBusy] = useState(false);

  const langRef = useRef(lang);
  langRef.current = lang;
  const stopsRef = useRef<readonly Stop[]>(TOUR);
  const ctxRef = useRef<SceneCtx>({ aliases: ALIASES, facts: FACTS, subject: "a 3D furnished apartment with a living room, kitchen and dining area, study and bedroom", chips: CHIPS });
  const splat = useRef<SplatHandle | null>(null);
  const controllerRef = useRef<CommandController | null>(null);
  const userQuality = useRef<Quality | null>(null);
  const speaker = useRef<Speaker | null>(null);
  if (!speaker.current && typeof window !== "undefined" && isSpeechOutputSupported()) speaker.current = createSpeaker();

  useEffect(() => {
    let alive = true;
    void (async () => {
      for (const u of PLACE_URLS) {
        if (await assetExists(u)) {
          if (alive) setHasPlace(u);
          return;
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setLang = (l: string) => {
    setLangState(l);
    try {
      localStorage.setItem("specter-lang", l);
    } catch {
      /* private mode */
    }
  };

  const installTour = useCallback((s: SpecterScene, list: readonly Stop[]) => {
    stopsRef.current = list;
    setStops(list);
    setRoom(0);
    setProgress(0);
    s.setPath(toKeyframes(list), {
      onKeyframe: (i) => setRoom(i),
      onTime: (t, d) => setProgress(t / d),
      onPlayState: (p) => setPlaying(p),
      onEnd: () => setPlaying(false),
    });
    s.registerCameraPresets(Object.fromEntries(list.map((k) => [k.id, { position: [...k.position], target: [...k.target] }])) as never);
  }, []);

  const clearSplat = useCallback(() => {
    splat.current?.dispose();
    splat.current = null;
  }, []);

  const mountApartment = useCallback(
    async (s: SpecterScene, instant = false) => {
      clearSplat();
      if (userQuality.current) s.setQuality(userQuality.current);
      s.hotspots.clear();
      s.applyLighting("indoor");
      s.setBackground(["#241833", "#0b0813"]);
      let list: readonly Stop[] = TOUR;
      let ctx: SceneCtx = { aliases: ALIASES, facts: FACTS, subject: "a 3D furnished apartment with a living room, kitchen and dining area, study and bedroom", chips: CHIPS };
      let hotspots: { id: string; mesh?: string; position?: [number, number, number]; title: string; body: string; offset?: [number, number, number] }[] = HOTSPOTS;

      const r = await s.loadModel(APARTMENT_GLB, { fallback: buildApartment, fit: false });
      if (r.source === "gltf") {
        // a real apartment was supplied: names, tour and hotspots come from its sidecar
        const cfg: ModelConfig | null = await fetchModelConfig(APARTMENT_GLB.replace(/\.glb$/i, ".config.json"));
        if (cfg?.scale) s.modelSlot.scale.setScalar(cfg.scale);
        s.fitCameraToModel();
        const home = s.getHome();
        list = cfg?.tour ?? orbitTour(home);
        hotspots = cfg?.hotspots ?? [];
        ctx = {
          aliases: cfg?.aliases ?? {},
          facts: cfg?.facts ?? {},
          subject: "a 3D furnished interior",
          chips: cfg?.chips ?? [{ label: "Go to the overview", text: "Go to the overview" }],
        };
      } else {
        s.setHome(TOUR_VIEWS.overview!);
      }
      installTour(s, list);
      const first = list[0]!;
      s.setHome({ position: [...first.position], target: [...first.target] });
      s.flyTo({ position: [...first.position], target: [...first.target] }, instant ? 0 : 1);
      for (const h of hotspots) {
        try {
          s.hotspots.add({ ...h, kind: "hotspot" });
        } catch (e) {
          console.warn(`[walk] hotspot ${h.id} skipped: ${e instanceof Error ? e.message : e}`);
        }
      }
      ctxRef.current = ctx;
      setChips(ctx.chips);
      setKind("apartment");
    },
    [clearSplat, installTour],
  );

  const mountPlace = useCallback(
    async (s: SpecterScene, url: string) => {
      s.hotspots.clear();
      clearSplat();
      const cfg = await fetchModelConfig(url.replace(/\.[a-z]+$/i, ".config.json"));
      splat.current = await loadSplatScene(s, url, { scale: cfg?.scale });
      const home = s.getHome();
      const list: readonly Stop[] = cfg?.tour ?? orbitTour({ position: home.position, target: home.target });
      installTour(s, list);
      const first = list[0]!;
      s.setHome({ position: [...first.position], target: [...first.target] });
      s.flyTo({ position: [...first.position], target: [...first.target] }, 0);
      for (const h of cfg?.hotspots ?? []) {
        try {
          s.hotspots.add({ ...h, kind: "hotspot" });
        } catch (e) {
          console.warn(`[walk] scan hotspot ${h.id} skipped: ${e instanceof Error ? e.message : e}`);
        }
      }
      // splats have no named meshes, so voice can only move the camera here
      const ctx: SceneCtx = {
        aliases: {},
        facts: {},
        subject: "a 3D scan of a real place",
        ops: ["setCamera"],
        chips: cfg?.chips ?? list.slice(0, 3).map((k) => ({ label: `Go to ${k.label}`, text: `Go to the ${k.id.replace(/-/g, " ")}` })),
      };
      ctxRef.current = ctx;
      setChips(ctx.chips);
      setKind("place");
    },
    [clearSplat, installTour],
  );

  const onReady = useCallback(
    async (s: SpecterScene) => {
      setScene(s);
      userQuality.current = s.getQuality();
      const registry = createSpecterRegistry({
        setCamera: (to) => {
          const i = stopsRef.current.findIndex((k) => k.id === to);
          if (i >= 0) setRoom(i);
        },
      });
      const c = createCommandController({
        registry,
        ctx: s,
        getContext: () => s.getSpecContext({ app: APP_ID, subject: ctxRef.current.subject, aliases: ctxRef.current.aliases, facts: ctxRef.current.facts, ops: ctxRef.current.ops }),
        interpretOptions: { endpoint: "/api/spec", localOnly: flags.nollm },
      });
      controllerRef.current = c;
      setController(c);
      await mountApartment(s, true);
      if (flags.spec) {
        const decoded = decodeSpec(flags.spec, registry, s.getSpecContext({ app: APP_ID, aliases: ctxRef.current.aliases }));
        if (decoded.ok) {
          const r = await c.applyQuietly(decoded.spec);
          if (!r.ok) s.toast("Part of the shared scene couldn't be applied.");
        } else s.toast("That share link isn't valid.");
      }
    },
    [flags.nollm, flags.spec, mountApartment],
  );

  const switchKind = async (next: SceneKind) => {
    if (!scene || busy || next === kind) return;
    setBusy(true);
    try {
      speaker.current?.stop();
      if (next === "place" && hasPlace) {
        try {
          await mountPlace(scene, hasPlace);
        } catch (e) {
          scene.toast(e instanceof Error ? e.message : "Couldn't open the scan. Showing the apartment.");
          await mountApartment(scene, true);
        }
      } else {
        await mountApartment(scene);
      }
      controllerRef.current?.reset();
    } finally {
      setBusy(false);
    }
  };

  const startTour = () => {
    setStarted(true);
    speaker.current?.stop();
    scene?.pathPlayer?.seek(0);
    scene?.pathPlayer?.play();
  };
  const explore = () => {
    setStarted(true);
    scene?.pathPlayer?.pause();
    scene?.resetView();
  };
  const goRoom = (i: number) => {
    const k = stops[Math.max(0, Math.min(stops.length - 1, i))]!;
    scene?.pathPlayer?.jumpTo(k.id, 1.8);
    setRoom(stops.indexOf(k));
  };
  const card = stops[Math.min(room, stops.length - 1)]!;

  return (
    <div className={`sp-app ${flags.embed ? "sp-embed" : ""}`}>
      <header className="sp-header">
        <div className="sp-brand">
          <span className="sp-logo">HauntHouse Walk</span>
          <span className="sp-tag">A guided tour you can redecorate by voice.</span>
        </div>
        {flags.demo && <span className="lf-demo">Demo mode</span>}
        <span className="sp-spacer" />
        <span className="sp-tag">Built on Specter</span>
      </header>

      <main className="sp-stage">
        <SpecterCanvas
          options={{
            lighting: "indoor",
            quality: flags.quality === "standard" || flags.quality === "cinematic" ? (flags.quality as Quality) : undefined,
            lang: () => langRef.current,
            onWarning: (w) => console.warn("[specter]", ...w),
            view: TOUR_VIEWS.overview,
          }}
          onReady={onReady}
          onDispose={() => {
            speaker.current?.stop();
            clearSplat();
          }}
        />

        {scene && started && (
          <section className="sp-card hw-tour" aria-label="Tour" data-testid="tour-card">
            <div className="hw-step">
              Stop {Math.min(room, stops.length - 1) + 1} of {stops.length} · {card.label}
            </div>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
            <div className="hw-bar" aria-hidden="true">
              <i style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="hw-dots" role="group" aria-label="Stops">
              {stops.map((k, i) => (
                <button key={k.id} className="hw-dot" aria-current={i === room} aria-label={`Go to ${k.label}`} title={k.label} onClick={() => goRoom(i)} data-testid={`dot-${k.id}`} />
              ))}
            </div>
            <div className="sp-row">
              <button className="sp-btn" onClick={() => goRoom(room - 1)} disabled={room === 0} aria-label="Previous stop">
                ◀
              </button>
              <button
                className="sp-btn sp-primary"
                data-testid="play-btn"
                onClick={() => {
                  const p = scene.pathPlayer;
                  if (!p) return;
                  if (p.isPlaying) p.pause();
                  else p.play();
                }}
              >
                {playing ? "❚❚ Pause" : "▶ Play tour"}
              </button>
              <button className="sp-btn" onClick={() => goRoom(room + 1)} disabled={room >= stops.length - 1} aria-label="Next stop">
                ▶
              </button>
              {speaker.current && (
                <button
                  className="sp-btn"
                  onClick={() => {
                    if (speaking) {
                      speaker.current?.stop();
                      setSpeaking(false);
                    } else {
                      setSpeaking(true);
                      speaker.current?.speak(`${card.title}. ${card.body}`, { lang, onEnd: () => setSpeaking(false) });
                    }
                  }}
                  aria-pressed={speaking}
                >
                  {speaking ? "⏹ Stop" : "🔊 Read"}
                </button>
              )}
            </div>
          </section>
        )}

        {scene && !started && (
          <div className="sp-intro" data-testid="intro">
            <div>
              <h1>HauntHouse Walk</h1>
              <p>Tour a furnished apartment room by room. Then redecorate it with your voice: “paint the sofa blue”, “add a note on the kitchen sink”.</p>
              <div className="sp-row" style={{ justifyContent: "center" }}>
                <button className="sp-btn sp-primary" onClick={startTour} data-testid="start-tour" autoFocus>
                  ▶ Start the tour
                </button>
                <button className="sp-btn" onClick={explore} data-testid="explore-btn">
                  Explore freely
                </button>
              </div>
            </div>
          </div>
        )}

        <Toolbar scene={scene} controller={controller}>
          {hasPlace && (
            <div className="hw-mode" role="group" aria-label="Scene">
              <button className={`sp-btn ${kind === "apartment" ? "sp-active" : ""}`} aria-pressed={kind === "apartment"} onClick={() => void switchKind("apartment")} disabled={busy} data-testid="scene-apartment">
                Apartment
              </button>
              <button className={`sp-btn ${kind === "place" ? "sp-active" : ""}`} aria-pressed={kind === "place"} onClick={() => void switchKind("place")} disabled={busy} data-testid="scene-place">
                Real place (scan)
              </button>
            </div>
          )}
        </Toolbar>
        {controller && started && <CommandBar controller={controller} chips={chips} lang={lang} onLangChange={setLang} />}
      </main>
    </div>
  );
}
