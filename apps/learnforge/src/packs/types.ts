import type * as THREE from "three";
import type { CameraView, LightingPreset } from "specter-core";

export interface PackHotspot {
  id: string;
  mesh: string;
  title: string;
  body: string;
  offset?: [number, number, number];
}

export interface Pack {
  id: string;
  title: string;
  blurb: string;
  /** Plain description for the LLM prompt. */
  subject: string;
  /** Optional GLB to try first. The procedural model is the permanent fallback. */
  glb?: string;
  build: () => THREE.Object3D;
  hotspots: PackHotspot[];
  /** Must include "overview". */
  views: Record<string, CameraView>;
  /** Spoken name -> mesh id. */
  aliases: Record<string, string>;
  /** Topic -> short explanation, so offline "about DNA" commands still write a real hotspot. */
  facts: Record<string, string>;
  chips: { label: string; text: string }[];
  lighting: LightingPreset;
  background: [string, string];
  /** Per-frame animation (orbits, rotation). */
  tick?: (root: THREE.Object3D, dt: number) => void;
}
