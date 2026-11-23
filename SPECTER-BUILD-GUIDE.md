# Specter — Full Build Guide (Build in Kiro)

**One-liner:** Voice/text-authorable 3D experience kit — cloneable skeleton + two apps (education explorer + walkthrough).  
**Category:** Skeleton Crew  
**Build surface:** **Kiro IDE** (primary), optional Kiro CLI / Crew  
**Deadline:** Dec 4, 2026 2pm PT  
**Rules checklist:** see [KIROWEEN-2026-RULES-CHECKLIST.md](./KIROWEEN-2026-RULES-CHECKLIST.md)

---

## 0. Photoreal / physics / multiplayer — time limit or impossibility?

| Capability | Verdict | Why |
|---|---|---|
| **Photoreal architecture from a text/voice prompt** (Matterport-quality apartment from “cozy loft”) | **Impossibility for this product** (not fixed by more days in a Three.js kit) | Specter loads **prepared GLB/GLTF** (or simple procedural meshes). Generative photoreal 3D from language is a different research/product stack, unreliable in a 3‑min judge demo, and not what your engine is. **Do:** ship 1–2 authored models; voice edits **hotspots, materials, camera paths, labels** on those models. |
| **Perfect game-engine physics** | **Impossibility at “perfect”**; soft approximation is a **scope/time** choice | Rigid-body perfection needs a real physics engine + tuning. Optional light collisions = cut if late. |
| **Multiplayer 3D** | **Mostly time/scope**, not physics-law impossible | Syncing transforms + presence is a whole kit (see “The Binding”). Cut from Specter MVP. |
| **AI inventing correct custom GLSL / broken Three.js APIs** | **Mitigated by Kiro MCP + steering** — still don’t depend on exotic shaders | Keep materials standard; MCP = current Three.js docs. |
| **Guided walkthrough of one apartment GLB + hotspots** | **Fully possible** | This is the honest walkthrough demo. |
| **Education object with clickable parts + explanations** | **Fully possible** | Use a CC0 model or simple composed meshes. |

**Pitch honesty rule:** Never claim “describe any building and get a photoreal tour.” Claim “author interactive spatial learning/tours on Specter with voice + Kiro.”

---

## 1. Product definition

### Unlock (InteractionKit effect)
Developers (and educators/agents) can **ship interactive 3D web experiences** by describing them — without being Three.js experts — because Specter is the baseplate and Kiro fills the slots.

### Primary user
- Hackathon / judges: **developers using the template in Kiro**
- End users of demos: students / apartment browsers

### Demo apps (required — two folders)

| Folder | App | What it proves |
|---|---|---|
| `apps/learnforge/` | **LearnForge** | Education: explore a 3D subject (cell, solar system, artifact); hotspots + plain explanations |
| `apps/haunthouse-walk/` | **HauntHouse Walk** | Walkthrough: guided camera path through **one** apartment/museum GLB; room cards |

Optional stretch (do not block ship): voice authoring overlay shared from `packages/specter-core`.

---

## 2. Repo layout (Skeleton Crew compliant)

```text
specter/
  LICENSE                 # OSI (MIT recommended)
  README.md
  package.json            # monorepo or workspaces
  .gitignore              # MUST NOT ignore .kiro
  .kiro/
    specs/
      specter-core/
      learnforge/
      haunthouse-walk/
    steering/
      3d-architecture.md
      performance-budget.md
      voice-authoring.md
    hooks/
      ...
  packages/
    specter-core/         # scene, camera, loaders, hotspots, voice→spec
  apps/
    learnforge/
    haunthouse-walk/
  assets/
    models/               # GLBs you have rights to
```

---

## 3. Build only in Kiro — workflow

1. `git init` + create GitHub repo; clone; **Open folder in Kiro IDE**.
2. Ask Kiro (Spec mode) to create **specter-core** requirements/design/tasks using EARS-style requirements.
3. Add steering **before** bulk generation (see §5).
4. Implement core via **spec tasks**, not endless vibe-only chat.
5. Create specs for LearnForge and HauntHouse Walk; implement into `apps/*`.
6. Wire **MCP** for Three.js docs (Context7 or equivalent Three.js doc MCP).
7. Add **hooks** (new hotspot → register raycaster + a11y label; new model → dispose old GPU resources).
8. Optional: **Crew** — Scene Agent + UI Agent + Narration Agent.
9. Add **PBT** properties (§5).
10. Commit `.kiro` continuously; deploy both apps (Vercel/Netlify/static).
11. Record ≤3 min YouTube demo; write Kiro usage essay; submit Devpost.

**Do not** develop the project in Cursor. If you already brainstormed elsewhere, **implementation and `/.kiro` must be produced in Kiro.**

---

## 4. Core technical MVP (must ship)

### specter-core
- [ ] Scene / camera / WebGLRenderer with resize
- [ ] OrbitControls (LearnForge) + scripted camera path player (Walk)
- [ ] GLTFLoader pipeline + loading/error UI
- [ ] Lighting presets: studio / indoor
- [ ] Hotspot system: anchor to mesh or world position; panel with title/body
- [ ] Material/color swap API for named meshes
- [ ] **Voice/text → Specter Spec** JSON (schema below) → apply to scene
- [ ] Performance budget: warn if triangles/textures exceed limits
- [ ] Dispose helpers (no GPU leaks on route change)

### Specter Spec schema (voice/text target)

```json
{
  "app": "learnforge" | "haunthouse-walk",
  "model": "assets/models/....glb",
  "camera": { "mode": "orbit" | "path", "pathId": "main" },
  "hotspots": [
    { "id": "mito", "mesh": "mitochondria", "title": "...", "body": "..." }
  ],
  "materials": [{ "mesh": "sofa", "color": "#3b82f6" }],
  "labels": []
}
```

Voice flow: mic → SpeechRecognition (or API) → confirm transcript → LLM/Kiro maps to Spec → `applySpec(spec)`.

---

## 5. Kiro artifacts (max Tech score)

### Steering (non-negotiable)
- All meshes under scene graph; never orphan GPU resources  
- Hotspots always have `title`, `body`, and a resolvable target  
- No custom GLSL in MVP  
- Max texture size / triangle budget documented  
- Voice never invents a new photoreal building — only mutates Spec fields  

### Hooks (examples)
- `FileCreated` / post-edit on `hotspots/*` → regenerate registry + ARIA  
- After applySpec → run PBT suite  
- README / docs refresh when apps change  

### MCP
- Three.js / R3F accurate docs (stop hallucinated APIs)  
- Optional: browser MCP to screenshot demos for README  

### Crew (recommended for score)
- **Scene Agent** — graph, loaders, paths  
- **UI Agent** — hotspot panels, voice confirm UI  
- **Narration Agent** — education copy / tour scripts  

### PBT properties
- Every hotspot target resolves or fails loudly  
- Camera path keyframes are monotonic in time  
- After `applySpec`, scene disposable without WebGL context loss  
- Material swaps only affect listed meshes  

### Powers
- Install/create a small **Specter 3D** power with skills: “add hotspot”, “author walk path”, “voice to spec”

---

## 6. Demo apps — detailed

### LearnForge (education)
**Layman journey:** Open app → see 3D subject → click glowing points → read explanation → optional voice: “Add a hotspot on the nucleus about DNA.” → hotspot appears → share link.

**Content:** One strong model (CC0 cell / solar system / artifact). Prefer quality over quantity.

### HauntHouse Walk (walkthrough)
**Layman journey:** Start tour → camera moves room to room → click cards for each room → voice: “Paint the sofa blue” / “Add a note on the kitchen sink” → updates on the **existing** GLB.

**Content:** One apartment/interior GLB you have rights to (purchase/CC0). Pre-authored camera path.

---

## 7. Max each judging score

| Criterion | Specter moves |
|---|---|
| **Impact** | Make LearnForge + Walk the demos (teachers / agents), not “Three.js boilerplate.” Say who uses it and show them using it. |
| **Tech** | Specs + steering + hooks + Three.js MCP + Crew + PBT + Power — all visible in `/.kiro` and write-up. |
| **Design** | One visual language across core + both apps; loading states; mobile-passable; no raw debug UI in demo. |
| **Innovation** | **Voice → Spec → scene** as signature interaction (InteractionKit energy). Honest limits in README. |
| **Presentation** | 3-min video script below; jaw-drop in first 30s. |

---

## 8. 3-minute demo video script

0:00–0:20 — Problem: “Shipping interactive 3D for learning/tours is hard; vibe-coding Three.js breaks.”  
0:20–0:50 — Clone Specter in **Kiro**; show `.kiro` steering/spec.  
0:50–1:30 — LearnForge: orbit, hotspots, **voice adds a hotspot**.  
1:30–2:20 — HauntHouse Walk: guided path; voice changes material / adds note.  
2:20–2:45 — Same core, two apps; “describe it in Kiro.”  
2:45–3:00 — CTA: GitHub + “Skeleton Crew.”

---

## 9. 12-day plan (order)

| Days | Focus |
|---|---|
| 1–2 | Repo + specter-core scene/loader/hotspots; Kiro specs/steering |
| 3–4 | LearnForge end-to-end with final model |
| 5–6 | HauntHouse Walk path + room cards |
| 7–8 | Voice → Spec → apply; polish UI |
| 9 | Hooks, MCP, PBT, Crew agents |
| 10 | Deploy both apps; README; performance pass |
| 11 | Demo video + Kiro write-up + blog/social draft |
| 12 | Buffer, Devpost submit early |

### Cut if late (never cut)
**Cut:** physics, multiplayer, AR, AI mesh generation, fancy post-processing, second education model.  
**Never cut:** two distinct apps, voice or text Spec apply, committed `/.kiro`, working deploy, ≤3 min video.

---

## 10. Devpost / README claims (safe wording)

**Do say:** interactive 3D kit; voice-authorable hotspots/materials/paths; education + walkthrough demos; built with Kiro specs/hooks/MCP/Crew.  
**Don’t say:** generates photoreal buildings from speech; replaces Matterport; perfect physics; multiplayer worlds.

---

## 11. Submission checklist (Specter-specific)

- [ ] Category: Skeleton Crew  
- [ ] `apps/learnforge` + `apps/haunthouse-walk`  
- [ ] `/.kiro` committed  
- [ ] Two working URLs  
- [ ] License on GitHub  
- [ ] YouTube ≤3 min  
- [ ] Kiro write-up with Crew/MCP/hooks/specs/steering/PBT/powers as used  
- [ ] Blog + `#KiroweenHackathon26` social (recommended)  
