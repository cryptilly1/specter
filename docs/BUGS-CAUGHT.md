# Bugs the tests caught

Real failures from this build, for the Kiro write-up. Each one was found by a test before it reached the demo.

| Test | What failed | Fix |
|---|---|---|
| Property P1 (targets resolve or fail loudly), `content.test.ts` | Mesh named `cube` in the embed demo was filtered out by the "generic exporter name" rule, so `paint the cube gold` could not find it. | Renamed the demo meshes (`block`, `crate`). The rule stays, because exporter names like `Cube.001` should not be voice targets. |
| Camera op test | `setCamera` to an unknown room threw `TargetNotFoundError`, but the registry wraps it as `SpecApplyError`. The test expected the wrong type. | Kept the wrapping (atomic rollback needs it) and asserted on the message. |
| Handler test "no secrets in output" | The assertion searched for the one-letter key `g` and matched normal words. | Used a distinctive fake key, `sk-secret-xyz`. Confirms no key reaches the response. |
| Playwright share-link test | Opening a second WebGL page while the first was still running timed out under software rendering. | Close the first page before opening the share link. |
| R3F bridge test | The adapter reused `SpecterScene` as its type, so the R3F host could not satisfy it. | Added a small `SpecterHost` interface that both `SpecterScene` and `R3FHost` implement. |
| Screenshot review | Several hotspot markers on one mesh stacked on the same spot. | Markers on the same mesh now spread around the mesh's bounding sphere. |
| Screenshot review | The hotspot panel sat under the command dock. | Panel moved to the top-left. |
| Console budget warning | Solar system had 235 draw calls (budget 200) because each asteroid was its own mesh. | Asteroid belt is now one `InstancedMesh`. |
| Three.js r187 warning | `PCFSoftShadowMap` is removed. | Switched to `PCFShadowMap`. |
| Playwright suite against the live apps, once the Groq key was set | `?nollm=1` (the offline switch) was ignored by the text box: the command bar always sent `localOnly: false`, overriding the app setting. Found because the live AI picked `#ffd700` for gold where the offline parser uses `#d4a017`. | The command bar only ever forces local mode, never turns it off. Unit regression test added. |
| Live AI responses | The model added unrequested properties (`opacity: 1`), which made the see-through mitochondria shell solid. | Prompt rule: only include properties the user asked to change. |
| Studio core tests | Objects the user named "cube" or "sphere" were skipped as generic exporter names, so "move the sphere up" moved its inner mesh instead (the same family as the first bug in this list). | Studio objects are always targetable, and an exact object name always wins over fuzzy matching. |
| Studio parser tests | "add a triceratops" searched for "triceratop" (over-eager plural stripping). | Plurals are only singularised when a count is given ("five trees"). |
| Studio parser tests | "put **a** lantern on the table" moved the existing lantern instead of adding one. | "put a/an …" adds; only "put the …" moves. |
| Studio parser tests | "rotate the table 45 degrees" started a spin animation. | A turn by degrees is a one-off rotation. |
| Live library probe | "tree" matched the catalogue Lantern because "s**tree**t lamp" contains "tree". | Whole-word matching. |
| Live library probe | Smithsonian key rejected: it was pasted into `.env.local` with backticks around it. | Key readers strip stray quotes/backticks. |
| Live library probe | Smithsonian's text search with a 3D filter returned no 3D records. | Search the 3D file API first, then confirm CC0 per package through Open Access. Results must contain a query word in the title (it returned mussels for "barn"). |
| Licence check on the catalogue | Khronos "Duck" is under Sony's SCEA licence, not CC0. | Replaced with CC0 models, verified against each model's metadata.json. |
| Live AI in the browser | "add a small red barn next to it": the AI's position put the barn inside the snowman, "small" was ignored, and the red tint wiped the model's colours. | Overlapping positions fall back to free space; size words scale models; library models are blended toward a colour instead of flattened. |
| Dev server | The API plugin imported workspace TypeScript at config time and Node couldn't resolve it, so no app started. | Handlers load through Vite's module loader in dev, and through the bundled functions in preview. |
