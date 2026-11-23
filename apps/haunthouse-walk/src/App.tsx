import { useCallback, useMemo, useRef, useState } from "react";
import { createSpecterRegistry, type Keyframe, type Quality, type SpecterScene } from "specter-core";
import { CommandBar, readFlags, SpecterCanvas, Toolbar } from "specter-ui";
import { createCommandController, createSpeaker, decodeSpec, isSpeechOutputSupported, type CommandController, type Speaker } from "specter-voice";
import { buildApartment, TOUR, TOUR_VIEWS } from "./apartment";
import { ALIASES, APP_ID, CHIPS, FACTS, HOTSPOTS } from "./content";

function loadLang(): string {
  try {
    return localStorage.getItem("specter-lang") || navigator.language || "en-US";
  } catch {
    return "en-US";
  }
}

const KEYFRAMES: Keyframe[] = TOUR.map((k) => ({ id: k.id, label: k.label, t: k.t, hold: "hold" in k ? k.hold : 0, position: [...k.position], target: [...k.target] }));

export function App() {
  const flags = useMemo(() => readFlags(), []);
  const [scene, setScene] = useState<SpecterScene | null>(null);
  const [controller, setController] = useState<CommandController | null>(null);
  const [lang, setLangState] = useState(loadLang);
  const [room, setRoom] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [started, setStarted] = useState(flags.embed);
  const [speaking, setSpeaking] = useState(false);

  const langRef = useRef(lang);
  langRef.current = lang;
  const speaker = useRef<Speaker | null>(null);
  if (!speaker.current && typeof window !== "undefined" && isSpeechOutputSupported()) speaker.current = createSpeaker();

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
      s.registerCameraPresets(TOUR_VIEWS);
      s.applyLighting("indoor");
      s.setBackground(["#241833", "#0b0813"]);
      s.setModel(buildApartment(), { fit: false });
      s.setHome(TOUR_VIEWS.overview!);
      s.flyTo(TOUR_VIEWS.overview!, 0);
      s.setPath(KEYFRAMES, {
        onKeyframe: (i) => setRoom(i),
        onTime: (t, d) => setProgress(t / d),
        onPlayState: (p) => setPlaying(p),
        onEnd: () => setPlaying(false),
      });
      for (const h of HOTSPOTS) {
        try {
          s.hotspots.add({ ...h, kind: "hotspot" });
        } catch (e) {
          console.warn(`[walk] hotspot ${h.id} skipped: ${e instanceof Error ? e.message : e}`);
        }
      }
      const registry = createSpecterRegistry({
        setCamera: (to) => {
          const i = KEYFRAMES.findIndex((k) => k.id === to);
          if (i >= 0) setRoom(i);
        },
      });
      const c = createCommandController({
        registry,
        ctx: s,
        getContext: () => s.getSpecContext({ app: APP_ID, subject: "a 3D furnished apartment with a living room, kitchen and dining area, study and bedroom", aliases: ALIASES, facts: FACTS }),
        interpretOptions: { endpoint: "/api/spec", localOnly: flags.nollm },
      });
      setController(c);
      if (flags.spec) {
        const decoded = decodeSpec(flags.spec, registry, s.getSpecContext({ app: APP_ID, aliases: ALIASES }));
        if (decoded.ok) {
          const r = await c.applyQuietly(decoded.spec);
          if (!r.ok) s.toast("Part of the shared scene couldn't be applied.");
        } else s.toast("That share link isn't valid.");
      }
    },
    [flags.nollm, flags.spec],
  );

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
    const k = KEYFRAMES[Math.max(0, Math.min(KEYFRAMES.length - 1, i))]!;
    scene?.pathPlayer?.jumpTo(k.id!, 1.8);
    setRoom(KEYFRAMES.indexOf(k));
  };
  const card = TOUR[room]!;

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
          onDispose={() => speaker.current?.stop()}
        />

        {scene && started && (
          <section className="sp-card hw-tour" aria-label="Tour" data-testid="tour-card">
            <div className="hw-step">
              Room {room + 1} of {TOUR.length} · {card.label}
            </div>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
            <div className="hw-bar" aria-hidden="true">
              <i style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="hw-dots" role="group" aria-label="Rooms">
              {TOUR.map((k, i) => (
                <button key={k.id} className="hw-dot" aria-current={i === room} aria-label={`Go to ${k.label}`} title={k.label} onClick={() => goRoom(i)} data-testid={`dot-${k.id}`} />
              ))}
            </div>
            <div className="sp-row">
              <button className="sp-btn" onClick={() => goRoom(room - 1)} disabled={room === 0} aria-label="Previous room">
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
              <button className="sp-btn" onClick={() => goRoom(room + 1)} disabled={room === TOUR.length - 1} aria-label="Next room">
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

        <Toolbar scene={scene} controller={controller} />
        {controller && started && <CommandBar controller={controller} chips={CHIPS} lang={lang} onLangChange={setLang} />}
      </main>
    </div>
  );
}
