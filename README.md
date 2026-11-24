# Specter

**Interactive 3D for the web that you can edit by speaking.** Specter is a cloneable kit built on Three.js. Say or type “add a hotspot on the nucleus about DNA” or “paint the sofa blue”. Specter turns the sentence into a validated **Spec**, shows you what it will change, and applies it to the scene on Apply. Undo is always available.

Built with [Kiro](https://kiro.dev) for Kiroween 2026, category **Skeleton Crew**.

| App | What it is | Folder |
|---|---|---|
| **LearnForge** | Education explorer: an animal cell, the solar system and DNA, with clickable explanations | `apps/learnforge` |
| **HauntHouse Walk** | Guided apartment tour with room cards. Redecorate and leave notes by voice | `apps/haunthouse-walk` |
| **Crypt Forge** | Product configurator for a lantern. Panel controls and voice produce the same Spec | `apps/crypt-forge` |

Live: [LearnForge](https://specter-learnforge.vercel.app) · [HauntHouse Walk](https://specter-haunthouse-walk.vercel.app) · [Crypt Forge](https://specter-crypt-forge.vercel.app) · [Embed demo](https://specter-learnforge.vercel.app/embed/)

## Who it is for

- **Teachers and course authors:** add or rewrite explanations on a 3D model without touching code, then share a link or embed it in an LMS.
- **Tour and property authors:** turn one prepared model into a guided walkthrough you can annotate.
- **Developers:** get scene setup, loading, hotspots, materials, camera paths, disposal and a safe voice pipeline already built and tested. Add a new 3D app with little new code.

Use cases the kit supports: classroom science, museum and heritage tours, real-estate showings, interior previews, product training.

## How it works

```mermaid
flowchart LR
  Mic[Voice, any of 10 languages] --> Confirm[Readable preview + Apply / Cancel / Undo]
  Text[Text box] --> Confirm
  Chips[One-click chips] --> Confirm
  Confirm --> Interp[interpret]
  Interp -->|first| API[/api/spec: Groq, OpenAI or Anthropic/]
  API --> Zod[Validate against ops + scene targets]
  Interp -->|fallback, offline| Parser[Built-in parser]
  Zod --> Ops[Spec: list of ops]
  Parser --> Ops
  Ops --> Apply[OpRegistry.apply, atomic, undoable]
  Apply --> Scene[specter-core scene]
  Apply --> Todo[voice-todo: no 3D]
```

A Spec is a short list of edit operations, not a whole scene:

```json
{ "version": 1, "ops": [{ "op": "setMaterial", "mesh": "sofa", "color": "#2563eb" }] }
```

Ops: `addHotspot`, `updateHotspot`, `removeHotspot`, `addNote`, `setMaterial`, `setVisibility`, `setCamera`, `loadPack`. Every answer from the AI is checked against the same op schemas and against the names of things that actually exist in the scene. Unknown ops and unknown targets are rejected. If the AI is slow, down, or returns something invalid, the built-in parser handles the command instead, so the apps work with the network off.

## Packages

| Package | Purpose |
|---|---|
| `specter-voice` | Engine-agnostic. Op registry, Zod schemas, offline parser, AI client, command flow, voice input, read-aloud, share links, server handler. **No Three.js.** |
| `specter-core` | Three.js scene, GLB loader (Draco + Meshopt), lighting presets with image-based light, ACES tone mapping, shadows, optional ambient occlusion and bloom, hotspots, materials, camera paths, budget checks, disposal, Gaussian splat loading |
| `specter-ui` | Shared React UI: canvas host, command bar, toolbar, theme |
| `specter-viewer` | `<specter-viewer>` web component for any HTML page |
| `specter-r3f` | Thin React Three Fiber adapter (`<SpecterBridge>`) |

Examples: `examples/voice-todo` (the voice pipeline with no 3D at all) and `examples/r3f-demo`.

## Run it

Requires Node 20+ and pnpm 10.

```bash
pnpm install
pnpm dev:learnforge     # http://localhost:5173
pnpm dev:walk           # http://localhost:5174
pnpm dev:forge          # http://localhost:5175
```

AI interpretation is optional. To enable it, copy `.env.example` to `apps/<app>/.env.local` and set `GROQ_API_KEY` (or `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`). Without a key, everything runs on the built-in parser.

```bash
pnpm test          # unit + property-based tests (Vitest + fast-check)
pnpm test:e2e      # Playwright, against local dev servers
pnpm build         # all packages and apps
```

URL flags: `?demo=1` (demo badge), `?nollm=1` (skip the AI), `?quality=standard|cinematic`, `?pack=cell|solar-system|dna`, `?embed=1` (no chrome, for iframes), `?spec=...` (share link).

## Using your own models

```bash
pnpm models:audit path/to/model.glb --init-config   # mesh names, triangles, warnings, writes a sidecar
pnpm models:optimize path/to/model.glb              # Draco + WebP + resize
```

- LearnForge: put `cell.glb` (+ `cell.config.json`) in `apps/learnforge/public/models/`.
- HauntHouse Walk: `apartment.glb` (+ `apartment.config.json` with `tour`, `hotspots`, `aliases`) in `apps/haunthouse-walk/public/models/`.
- Scan scene: `place.spz` (or `.ply` / `.splat`) in the same folder adds a “Real place (scan)” button.

If a file is missing or fails to load, the app uses its procedural model. Voice commands can only target **named** meshes, so the audit warns when a model has generic names like `Object_12`. See `assets/ATTRIBUTIONS.md` for licensing.

## Embed

```html
<script type="module" src="https://specter-learnforge.vercel.app/embed/specter-viewer.js"></script>
<specter-viewer src="model.glb" hotspots='[{"mesh":"door","title":"Front door","body":"Solid oak."}]'></specter-viewer>
```

Each app's Share button also produces an iframe snippet.

## Built with Kiro

`.kiro/` holds the specs (EARS requirements, design, tasks), steering (3D architecture, performance budget, voice-authoring rules), hooks and custom agents. `powers/specter-3d/` is a Kiro Power. See `docs/KIRO-WRITEUP.md` and `docs/BUGS-CAUGHT.md`.

## Limits

- Specter edits prepared models. It does **not** generate photoreal buildings or new geometry from speech.
- No physics simulation and no multiplayer.
- Voice input uses the browser's speech recognition, which works in Chrome and Edge. Other browsers use the text box with the same features.
- Gaussian splat scans support camera moves and position-anchored hotspots only, because scans have no named parts.
- Procedural models are stylised, and sizes in the solar system are compressed to fit on screen.

## License

MIT. See `LICENSE`.
