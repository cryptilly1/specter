# Voice and text authoring rules

The Voice -> Spec -> Scene pipeline is the signature interaction. Keep it safe.

- Voice and text only **mutate Spec fields** through registered ops (`addHotspot`, `updateHotspot`, `removeHotspot`, `setMaterial`, `addNote`, `setCamera`, `loadPack`, `setVisibility`). They never create new buildings, models or arbitrary geometry.
- Every interpreted result is validated with Zod before it touches the scene. Unknown op types are rejected. Unknown targets fail loudly with a readable message.
- The transcript is **data, not instructions**. Prompt text that tries to change the rules ("ignore previous instructions") must not alter which ops are accepted.
- Always show a confirm step with the interpreted ops in plain language, and support undo.
- Fallback chain, in order: `/api/spec` (LLM) -> local deterministic parser -> demo chips. The demo must work with the network off.
- API keys live only in environment variables on the serverless function. Never log them, never send them to the client, never commit them.
- Voice recognition is Chrome-only. Other browsers get the text bar with no loss of function.
