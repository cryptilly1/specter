import { useEffect, useMemo, useState } from "react";
import { providerName, RECIPES, typicalHeight, type StudioWorld } from "specter-core";
import type { AssetCandidate } from "specter-library";
import type { AssetSource, Spec } from "specter-voice";

type Op = Spec["ops"][number];
export type Submit = (ops: Op[], label: string) => void;

const R2D = 180 / Math.PI;
const r = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- object list

export function Outliner({ world, selected, onSelect, submit, version }: { world: StudioWorld; selected: string | null; onSelect: (id: string | null) => void; submit: Submit; version: number }) {
  const items = useMemo(() => world.list(), [world, version]);
  return (
    <section aria-label="Objects">
      <h3>Objects ({items.length})</h3>
      {items.length === 0 ? (
        <p className="st-muted">Nothing here yet. Say “build a solar eclipse” or pick something below.</p>
      ) : (
        <ul className="sp-list st-outliner" data-testid="outliner">
          {items.map((o) => {
            const motion = world.motionOf(o.id);
            const inter = world.interactionsOf(o.id);
            return (
              <li key={o.id} className="st-row">
                <button className="st-name" aria-current={selected === o.id} onClick={() => onSelect(selected === o.id ? null : o.id)} data-testid={`obj-${o.id}`}>
                  <span aria-hidden="true">{o.kind === "light" ? "💡" : o.kind === "asset" || o.asset ? "📦" : o.kind === "composite" ? "🧩" : "◼︎"}</span> {o.id}
                  <small>
                    {o.asset ? `${providerName(o.asset.provider)} · ${o.asset.license.label}` : o.kind}
                    {motion ? ` · ${motion}` : ""}
                    {inter.click || inter.hover ? " · interactive" : ""}
                  </small>
                </button>
                <button className="st-icon" aria-label={o.object.visible ? `Hide ${o.id}` : `Show ${o.id}`} title={o.object.visible ? "Hide" : "Show"} onClick={() => submit([{ op: "setVisibility", mesh: o.id, visible: !o.object.visible }], o.object.visible ? `Hide ${o.id}` : `Show ${o.id}`)}>
                  {o.object.visible ? "👁" : "🚫"}
                </button>
                <button className="st-icon" aria-label={`Delete ${o.id}`} title="Delete" onClick={() => submit([{ op: "removeObject", id: o.id }], `Delete ${o.id}`)} data-testid={`del-${o.id}`}>
                  🗑
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- add panel

const SHAPES: { label: string; shape: string; dims: Record<string, number>; color: string }[] = [
  { label: "Cube", shape: "box", dims: { width: 1, height: 1, depth: 1 }, color: "#8b5cf6" },
  { label: "Sphere", shape: "sphere", dims: { radius: 0.5 }, color: "#38bdf8" },
  { label: "Cylinder", shape: "cylinder", dims: { radius: 0.4, height: 1 }, color: "#f59e0b" },
  { label: "Cone", shape: "cone", dims: { radius: 0.5, height: 1 }, color: "#ef4444" },
  { label: "Torus", shape: "torus", dims: { radius: 0.5, tube: 0.18 }, color: "#22c55e" },
  { label: "Pyramid", shape: "pyramid", dims: { radius: 0.7, height: 1 }, color: "#eab308" },
  { label: "Plane", shape: "plane", dims: { width: 4, depth: 4 }, color: "#64748b" },
];

export function AddPanel({
  world,
  submit,
  search,
  generateEnabled,
  onGenerate,
  libraries,
}: {
  world: StudioWorld;
  submit: Submit;
  search: (q: string) => Promise<{ candidates: AssetCandidate[]; notes: string[] }>;
  generateEnabled: boolean;
  onGenerate: (prompt: string) => void;
  libraries: string[];
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<AssetCandidate[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const uniq = (base: string) => {
    let id = base;
    let k = 2;
    while (world.objects.has(id)) id = `${base}_${k++}`;
    return id;
  };

  const doSearch = async () => {
    const query = q.trim();
    if (!query) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await search(query);
      setResults(r.candidates);
      if (!r.candidates.length) setNote(`Nothing found for “${query}”${r.notes[0] ? ` (${r.notes[0]})` : ""}.`);
    } finally {
      setBusy(false);
    }
  };

  const addAsset = (c: AssetCandidate) => {
    const id = uniq(c.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "model");
    const source: AssetSource = {
      type: "asset",
      provider: c.provider,
      assetId: c.assetId,
      title: c.title,
      url: c.url,
      ...(c.urlMap && Object.keys(c.urlMap).length ? { urlMap: c.urlMap } : {}),
      license: c.license,
      credit: c.credit,
      sourceUrl: c.sourceUrl,
      ...(c.platformCredit ? { platformCredit: c.platformCredit } : {}),
      ...(c.thumbnail ? { thumbnail: c.thumbnail } : {}),
    };
    submit([{ op: "addObject", id, source, height: typicalHeight(c.title) }], `Add ${c.title}`);
  };

  return (
    <section aria-label="Add">
      <h3>Shapes</h3>
      <div className="st-grid">
        {SHAPES.map((s) => (
          <button key={s.label} className="sp-btn" onClick={() => submit([{ op: "addObject", id: uniq(s.label.toLowerCase()), source: { type: "primitive", part: { name: `${uniq(s.label.toLowerCase())}_mesh`, shape: s.shape, dims: s.dims, color: s.color } } }], `Add ${s.label}`)} data-testid={`shape-${s.label.toLowerCase()}`}>
            {s.label}
          </button>
        ))}
        <button className="sp-btn" onClick={() => submit([{ op: "addLight", id: uniq("light"), kind: "point", position: [0, 3, 2] }], "Add light")}>
          Light
        </button>
      </div>

      <h3>Recipes</h3>
      <div className="st-grid">
        {RECIPES.map((rc) => (
          <button key={rc.id} className="sp-btn" title={rc.blurb} onClick={() => submit([{ op: "addObject", id: uniq(rc.id.replace(/-/g, "_")), source: { type: "recipe", recipe: rc.id } }], `Build ${rc.title}`)} data-testid={`recipe-${rc.id}`}>
            {rc.title}
          </button>
        ))}
      </div>

      <h3>Free model libraries</h3>
      <form
        className="sp-row"
        onSubmit={(e) => {
          e.preventDefault();
          void doSearch();
        }}
      >
        <input className="sp-input st-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="tree, dinosaur, chair…" aria-label="Search free models" data-testid="library-search" />
        <button className="sp-btn" type="submit" disabled={busy || !q.trim()}>
          {busy ? "…" : "Search"}
        </button>
      </form>
      <p className="st-muted st-tiny">Searching {libraries.map(providerName).join(", ")}. Only CC0 and CC BY models are shown, with credits kept.</p>
      {note && <p className="st-muted">{note}</p>}
      {results && results.length > 0 && (
        <div className="st-results" data-testid="library-results">
          {results.map((c) => (
            <button key={`${c.provider}:${c.assetId}`} className="sp-choice" onClick={() => addAsset(c)} title={c.credit}>
              {c.thumbnail ? <img src={c.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = "hidden")} /> : <span className="sp-choice-ph">3D</span>}
              <span className="sp-choice-label">{c.title}</span>
              <span className="sp-choice-detail">
                {providerName(c.provider)} · {c.license.label}
              </span>
            </button>
          ))}
        </div>
      )}
      {generateEnabled && q.trim() && (
        <button className="sp-btn" style={{ marginTop: 8 }} onClick={() => onGenerate(q.trim())} data-testid="generate-btn">
          ✨ Generate “{q.trim()}” with AI (Meshy)
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- properties

export function Properties({ world, id, submit, version }: { world: StudioWorld; id: string; submit: Submit; version: number }) {
  const rec = world.objects.get(id);
  const o = rec?.object;
  const [pos, setPos] = useState<string[]>([]);
  const [rot, setRot] = useState<string[]>([]);
  const [scl, setScl] = useState("1");
  const [info, setInfo] = useState("");
  useEffect(() => {
    if (!o) return;
    setPos([o.position.x, o.position.y, o.position.z].map((n) => String(r(n))));
    setRot([o.rotation.x, o.rotation.y, o.rotation.z].map((n) => String(r(n * R2D))));
    setScl(String(r(o.scale.x)));
    const click = world.interactionsOf(id).click;
    setInfo(click?.type === "showInfo" ? click.body : "");
  }, [o, id, world, version]);
  if (!rec || !o) return null;

  const num = (s: string) => (Number.isFinite(Number(s)) ? Number(s) : 0);
  const others = world.ids().filter((x) => x !== id);
  const motion = world.motionOf(id) ?? "none";

  return (
    <section aria-label={`Properties of ${id}`} data-testid="properties">
      <h3>{id}</h3>
      {rec.asset && (
        <p className="st-muted st-tiny">
          {rec.asset.credit}{" "}
          <a href={rec.asset.sourceUrl} target="_blank" rel="noreferrer">
            source
          </a>
        </p>
      )}
      <form
        className="st-props"
        onSubmit={(e) => {
          e.preventDefault();
          submit([{ op: "transform", target: id, position: pos.map(num) as never, rotation: rot.map(num) as never, scale: Math.max(0.001, num(scl)) }], `Update ${id}`);
        }}
      >
        <label>Position</label>
        <div className="st-vec">
          {["x", "y", "z"].map((a, i) => (
            <input key={a} aria-label={`Position ${a}`} value={pos[i] ?? ""} onChange={(e) => setPos(pos.map((v, j) => (j === i ? e.target.value : v)))} inputMode="decimal" />
          ))}
        </div>
        <label>Rotation °</label>
        <div className="st-vec">
          {["x", "y", "z"].map((a, i) => (
            <input key={a} aria-label={`Rotation ${a}`} value={rot[i] ?? ""} onChange={(e) => setRot(rot.map((v, j) => (j === i ? e.target.value : v)))} inputMode="decimal" />
          ))}
        </div>
        <label>Scale</label>
        <div className="st-vec">
          <input aria-label="Scale" value={scl} onChange={(e) => setScl(e.target.value)} inputMode="decimal" />
        </div>
        <button className="sp-btn" type="submit">
          Apply
        </button>
      </form>

      {rec.kind !== "light" && (
        <>
          <label className="st-label">Colour</label>
          <div className="sp-row">
            <input type="color" aria-label="Colour" defaultValue="#8b5cf6" onChange={(e) => submit([{ op: "setMaterial", mesh: id, color: e.target.value }], `Colour ${id}`)} />
            <button className="sp-btn" onClick={() => submit([{ op: "setMaterial", mesh: id, roughness: 0.9, metalness: 0 }], "Matte")}>
              Matte
            </button>
            <button className="sp-btn" onClick={() => submit([{ op: "setMaterial", mesh: id, roughness: 0.15, metalness: 0.9 }], "Metal")}>
              Metal
            </button>
            <button className="sp-btn" onClick={() => submit([{ op: "setMaterial", mesh: id, opacity: 0.4 }], "See-through")}>
              Glass
            </button>
          </div>
        </>
      )}

      <label className="st-label" htmlFor="motion">
        Motion
      </label>
      <div className="sp-row">
        <select
          id="motion"
          className="sp-select"
          value={motion}
          onChange={(e) => {
            const m = e.target.value;
            if (m === "orbit") {
              if (!others.length) return;
              submit([{ op: "animate", target: id, motion: "orbit", around: others[0]! }], `${id} orbits ${others[0]}`);
            } else submit([{ op: "animate", target: id, motion: m === "none" ? "stop" : m }], m === "none" ? `Stop ${id}` : `${id} ${m}`);
          }}
          data-testid="motion-select"
        >
          <option value="none">None</option>
          <option value="spin">Spin</option>
          <option value="orbit" disabled={!others.length}>
            Orbit…
          </option>
          <option value="bob">Float</option>
          <option value="pulse">Pulse</option>
          <option value="swing">Swing</option>
        </select>
        {motion === "orbit" && (
          <select className="sp-select" aria-label="Orbit around" onChange={(e) => submit([{ op: "animate", target: id, motion: "orbit", around: e.target.value }], `${id} orbits ${e.target.value}`)} defaultValue="">
            <option value="" disabled>
              around…
            </option>
            {others.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        )}
      </div>

      <label className="st-label" htmlFor="onclick">
        When clicked in Play mode, show
      </label>
      <form
        className="sp-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (info.trim()) submit([{ op: "addInteraction", target: id, trigger: "click", action: { type: "showInfo", title: id.replace(/[_-]+/g, " "), body: info.trim().slice(0, 600) } }], `Click action for ${id}`);
          else submit([{ op: "removeInteraction", target: id, trigger: "click" }], `Remove click action`);
        }}
      >
        <input id="onclick" className="sp-input" value={info} onChange={(e) => setInfo(e.target.value)} placeholder="A short explanation…" data-testid="onclick-input" />
        <button className="sp-btn" type="submit">
          Save
        </button>
      </form>

      <div className="sp-row" style={{ marginTop: 12 }}>
        <button className="sp-btn" onClick={() => submit([{ op: "duplicate", target: id, count: 1, layout: "row" }], `Copy ${id}`)}>
          Duplicate
        </button>
        <button className="sp-btn" onClick={() => submit([{ op: "removeObject", id }], `Delete ${id}`)}>
          Delete
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- credits

export function Credits({ world, version }: { world: StudioWorld; version: number }) {
  const credits = useMemo(() => world.credits(), [world, version]);
  const platforms = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of credits) if (c.platformCredit) m.set(c.platformCredit.text, c.platformCredit.url);
    return [...m.entries()];
  }, [credits]);
  if (!credits.length) return null;
  const seen = new Set<string>();
  return (
    <section aria-label="Credits" data-testid="credits">
      <h3>Credits</h3>
      <ul className="st-credits">
        {credits
          .filter((c) => (seen.has(c.credit) ? false : (seen.add(c.credit), true)))
          .map((c) => (
            <li key={c.credit}>
              <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                {c.credit}
              </a>
            </li>
          ))}
      </ul>
      {platforms.map(([text, url]) => (
        <p key={text} className="st-tiny">
          <a href={url} target="_blank" rel="noreferrer">
            {text}
          </a>
        </p>
      ))}
    </section>
  );
}
