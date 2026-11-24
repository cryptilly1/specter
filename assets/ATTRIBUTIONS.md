# Asset attributions

All 3D content currently shipped is **procedural** (built in code in `apps/*/src`) and is covered by this repo's MIT license. Environment lighting uses Three.js `RoomEnvironment` (MIT), so no HDRI file is downloaded.

When you add a model, scan or HDRI, add a row here and keep the license file next to it if it has one.

| File | Source URL | Author | License | Changes |
|---|---|---|---|---|
| Built-in catalogue (loaded at runtime from GitHub, not bundled) | https://github.com/KhronosGroup/glTF-Sample-Assets | Khronos sample models: Avocado, Lantern, Water Bottle, Boom Box, Toy Car, Sheen Chair (CC0); Fox (CC0 model by PixelMannen, CC BY 4.0 rig by tomkranis) | per model metadata.json | none |

License notes:
- CC0 / public domain: no credit required, but listing it here is good practice.
- CC-BY: credit is **required**. Put the author and link here and in the README.
- Avoid CC-BY-NC and CC-BY-ND for anything shown in a hackathon submission.

Good sources: Sketchfab (filter Downloadable + CC0/CC-BY), Poly Pizza, Quaternius, Kenney, Poly Haven, NASA 3D Resources, Smithsonian Open Access 3D, Khronos glTF Sample Assets.

## Models added in Studio

Studio does not ship third-party models. When a user adds one from Poly Haven, Poly Pizza, Smithsonian Open Access or Meshy, it is loaded from the provider's server, and its credit and license are shown in the Studio credits panel and written into exported GLB files.
