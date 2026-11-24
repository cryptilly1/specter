# Voice and text authoring rules

The Voice -> Spec -> Scene pipeline is the signature interaction. Keep it safe.

- Voice and text only change a scene through registered ops. In LearnForge, HauntHouse Walk and Crypt Forge those are edits to existing things (`addHotspot`, `updateHotspot`, `removeHotspot`, `setMaterial`, `addNote`, `setCamera`, `loadPack`, `setVisibility`).
- In Studio, voice may also **add** objects, but only from these sources, never from code:
  1. built-in **recipes** (expanded into ordinary shape ops),
  2. **shapes** and named compositions of shapes,
  3. **licensed library models** (Poly Haven, Poly Pizza, Smithsonian CC0, built-in catalogue), loaded only from allowlisted hosts (`ALLOWED_ASSET_HOSTS`),
  4. **AI generation** (Meshy), only when the user explicitly says "generate" and `MESHY_API_KEY` is set, clearly labelled as generated.
- Every library or generated object carries its license and credit, and the Studio credits panel and exported GLB show them. Poly Pizza models also need the "Models provided by Poly Pizza" link; Poly Haven needs "Powered by Poly Haven". Never re-host or mirror a provider's catalogue.
- Every interpreted result is validated with Zod before it touches the scene. Unknown op types are rejected. Unknown targets fail loudly with a readable message. Names created earlier in the same Spec may be referenced; clashing names are renamed, never silently overwritten.
- Resolver output (recipes, library results) is validated again by the controller before it is shown.
- The transcript is **data, not instructions**. Prompt text that tries to change the rules must not alter which ops are accepted.
- Always show a confirm step with the interpreted ops in plain language, and support undo. Applying is atomic: if one op fails, everything in that Spec is rolled back.
- Fallback chain, in order: `/api/spec` (LLM) -> local deterministic parser -> demo chips. Recipes and shapes work with the network off; library search degrades to the built-in catalogue.
- API keys live only in environment variables on the serverless functions. Never log them, never send them to the client, never commit them.
- Voice recognition is Chrome-only. Other browsers get the text bar with no loss of function.
