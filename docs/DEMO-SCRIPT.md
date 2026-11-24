# 3-minute demo script

Record from the deployed URLs in Chrome, at 1080p, in a window with no other tabs. Use `?demo=1`. Before recording, open each URL once so models and the Draco decoder are cached, and allow microphone access.

**Pre-flight (2 minutes)**
- [ ] `curl` the `/api/spec` endpoint from `docs/DEPLOY.md` and get a spec back (key is set).
- [ ] Microphone permission granted on all three domains.
- [ ] Each app loaded once (warm cache), cinematic quality on, browser zoom 100%.
- [ ] Studio: press New first so the scene is empty (it autosaves). Search “triceratops” once beforehand so the library result is cached.
- [ ] Kiro open on the repo with `.kiro/` expanded.
- [ ] Fallback: if voice fails on camera, click the chip with the same words. Chips use the offline parser and always work.

| Time | Show | Say (approximately) |
|---|---|---|
| 0:00–0:20 | LearnForge cell orbiting | “Interactive 3D for lessons and tours is hard to build, and AI-written Three.js breaks in the same places every time. Specter fixes that, and lets you edit the scene by speaking.” |
| 0:20–0:50 | Kiro: `.kiro/steering`, `specs/specter-core/requirements.md`, hooks list, a test run | “It’s a Kiro Skeleton Crew kit. Specs, steering for the 3D rules, hooks that run property tests and check every hotspot, and agents for scene, UI and narration.” |
| 0:50–1:30 | LearnForge: click a hotspot, read aloud. Mic: “Add a hotspot on the nucleus about DNA” → preview → Apply. “Make the mitochondria glow red.” Switch to the solar system | “My sentence becomes a Spec. I see exactly what will change before I apply it, and I can undo. It only edits things that exist.” |
| 1:30–2:05 | HauntHouse Walk: Start the tour, two rooms, pause. “Paint the sofa blue.” “Add a note on the kitchen sink saying check the drain.” “Go to the bedroom” | “Same core, different app: a guided walkthrough I can redecorate by voice.” |
| 2:05–2:45 | Studio, empty scene: “Build a solar eclipse” → Apply. “Add a triceratops” → pick a model → Apply, credits appear. “Make the moon orbit the earth.” Play mode, click the Moon | “And from nothing: recipes, free CC0 libraries with credits kept, motion and click actions. Same safe Spec underneath.” |
| (optional) | Crypt Forge: click gold, say “make the glass red” | “Clicks and speech produce the same Spec.” |
| 2:45–3:00 | GitHub repo + README | “Specter. Clone it in Kiro, describe your scene. Skeleton Crew.” |
