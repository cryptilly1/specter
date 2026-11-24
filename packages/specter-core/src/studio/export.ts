import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { StudioWorld } from "./world";

/**
 * Export the Studio scene as a single .glb. Editor-only helpers (light bulbs) and labels are left out, and the
 * credits for every library or generated model are written into the file's metadata (scene extras).
 */
export async function exportStudioGlb(world: StudioWorld): Promise<ArrayBuffer> {
  const slot = world.scene.modelSlot;
  const hidden: THREE.Object3D[] = [];
  slot.traverse((o) => {
    if ((o.userData.editorOnly || (o as THREE.Sprite).isSprite) && o.visible) {
      o.visible = false;
      hidden.push(o);
    }
  });
  const credits = world.credits().map((c) => ({ title: c.title, credit: c.credit, license: c.license.label, source: c.sourceUrl, platform: c.platformCredit?.text }));
  const prevExtras = slot.userData.credits;
  slot.userData.credits = credits;
  slot.userData.generator = "Specter Studio";
  try {
    const out = await new GLTFExporter().parseAsync(slot, { binary: true, onlyVisible: true });
    if (!(out instanceof ArrayBuffer)) throw new Error("Export did not produce a binary file");
    return out;
  } finally {
    hidden.forEach((o) => (o.visible = true));
    slot.userData.credits = prevExtras;
    world.setMode(world.mode);
  }
}
