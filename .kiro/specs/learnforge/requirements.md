# Requirements: LearnForge (education app)

## Introduction
LearnForge lets students explore 3D subjects (an animal cell, the solar system, the DNA double helix) and lets teachers add or change explanations by voice or text.

## Requirements

### R1: Subjects
1. THE app SHALL offer at least three subject packs, selectable from the sidebar and by the `loadPack` op ("switch to the solar system").
2. WHEN a pack is loaded, THE app SHALL replace the model, hotspots, camera views, lighting and background, and dispose the previous model.
3. WHEN a pack declares a GLB and the file exists, THE app SHALL load it and use its `.config.json` sidecar for hotspots and aliases; otherwise it SHALL use the procedural model with no error shown.

### R2: Hotspots
1. THE app SHALL list every hotspot in the sidebar; selecting one SHALL open its panel and move the camera to the target.
2. WHEN a hotspot panel is open, THE app SHALL offer read-aloud narration in the selected language.

### R3: Voice and text authoring
1. THE app SHALL accept "Add a hotspot on the nucleus about DNA" and create a hotspot whose body explains DNA, with or without the AI service.
2. THE app SHALL show the interpreted change and require Apply before changing the scene, and SHALL support Undo.
3. THE app SHALL offer one-click command chips for the current pack.

### R4: Sharing
1. THE app SHALL produce a share link that reproduces the current pack and edits, and an iframe embed snippet.
2. IF a share link is invalid, THEN THE app SHALL show a message and load the default scene.
