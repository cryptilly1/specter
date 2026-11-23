import * as THREE from "three";
import { namedGroup, namedMesh, pbr } from "specter-core";
import type { Pack } from "./types";

const PAIRS = 26;
const RADIUS = 1.15;
const RISE = 0.34;
const TWIST = (Math.PI * 2) / 10.5; // about 10.5 base pairs per turn, as in real B-DNA

class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly phase: number,
    private readonly turns: number,
  ) {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = this.phase + t * this.turns * Math.PI * 2;
    return target.set(Math.cos(a) * RADIUS, (t - 0.5) * PAIRS * RISE, Math.sin(a) * RADIUS);
  }
}

function buildDna(): THREE.Object3D {
  const root = new THREE.Group();
  root.name = "dna_model";
  const turns = ((PAIRS - 1) * TWIST) / (Math.PI * 2);

  const backbone = namedGroup("sugar_phosphate_backbone", [
    namedMesh("backbone_strand_a", new THREE.TubeGeometry(new Helix(0, turns), 260, 0.13, 12, false), pbr("#4cc9f0", { roughness: 0.3, metalness: 0.1 })),
    namedMesh("backbone_strand_b", new THREE.TubeGeometry(new Helix(Math.PI, turns), 260, 0.13, 12, false), pbr("#f72585", { roughness: 0.3, metalness: 0.1 })),
  ]);

  const at: THREE.Object3D[] = [];
  const gc: THREE.Object3D[] = [];
  const half = new THREE.CylinderGeometry(0.075, 0.075, RADIUS, 12);
  const cap = new THREE.SphereGeometry(0.17, 16, 12);
  const mats = {
    A: pbr("#ff5d5d", { roughness: 0.4 }),
    T: pbr("#ffd166", { roughness: 0.4 }),
    G: pbr("#06d6a0", { roughness: 0.4 }),
    C: pbr("#9b5de5", { roughness: 0.4 }),
  };
  for (let i = 0; i < PAIRS; i++) {
    const a = i * TWIST;
    const y = (i / (PAIRS - 1) - 0.5) * PAIRS * RISE;
    const isAT = i % 2 === 0;
    const [m1, m2] = isAT ? [mats.A, mats.T] : [mats.G, mats.C];
    const pair = new THREE.Group();
    pair.name = `pair_${i}`;
    pair.position.set(0, y, 0);
    pair.rotation.y = -a;
    const left = new THREE.Mesh(half, m1);
    left.rotation.z = Math.PI / 2;
    left.position.x = RADIUS / 2;
    const right = new THREE.Mesh(half, m2);
    right.rotation.z = Math.PI / 2;
    right.position.x = -RADIUS / 2;
    const c1 = new THREE.Mesh(cap, m1);
    c1.position.x = 0.02;
    const c2 = new THREE.Mesh(cap, m2);
    c2.position.x = -0.02;
    pair.add(left, right, c1, c2);
    left.castShadow = right.castShadow = true;
    (isAT ? at : gc).push(pair);
  }
  const atGroup = namedGroup("adenine_thymine", at);
  const gcGroup = namedGroup("guanine_cytosine", gc);
  root.add(backbone, atGroup, gcGroup);
  root.rotation.z = 0.28;
  return namedGroup("dna", [root]);
}

export const dnaPack: Pack = {
  id: "dna",
  title: "DNA double helix",
  blurb: "Two sugar-phosphate backbones twist around base pairs, the letters of the genetic code.",
  subject: "a 3D DNA double helix with a sugar-phosphate backbone and base pairs",
  build: buildDna,
  lighting: "studio",
  background: ["#17304a", "#050a14"],
  hotspots: [
    { id: "hs-backbone", mesh: "sugar_phosphate_backbone", offset: [2.2, 3.4, 0], title: "Sugar-phosphate backbone", body: "The two outer spirals are chains of sugar and phosphate. They give DNA its shape and protect the code held inside." },
    { id: "hs-at", mesh: "adenine_thymine", offset: [2.4, 0.4, 0], title: "A–T base pairs", body: "Adenine always pairs with thymine, joined by two hydrogen bonds. Here they are red and yellow." },
    { id: "hs-gc", mesh: "guanine_cytosine", offset: [-2.4, -1.6, 0], title: "G–C base pairs", body: "Guanine always pairs with cytosine, joined by three hydrogen bonds, which makes G–C pairs a little stronger. Here they are green and purple." },
  ],
  views: {
    overview: { position: [7.5, 1.5, 12.5], target: [0, 0, 0] },
    top: { position: [0, 7.5, 3.5], target: [0, 3, 0] },
    bottom: { position: [0, -6, 5], target: [0, -3, 0] },
    "side-view": { position: [9, 0, 0.1], target: [0, 0, 0] },
  },
  aliases: {
    backbone: "sugar_phosphate_backbone",
    spirals: "sugar_phosphate_backbone",
    strands: "sugar_phosphate_backbone",
    "base pairs": "adenine_thymine",
    "a t": "adenine_thymine",
    "g c": "guanine_cytosine",
    adenine: "adenine_thymine",
    thymine: "adenine_thymine",
    guanine: "guanine_cytosine",
    cytosine: "guanine_cytosine",
    helix: "dna",
  },
  facts: {
    genes: "A gene is a stretch of DNA that holds the instructions for one protein or RNA molecule.",
    heredity: "Heredity is how traits pass from parents to children. DNA is copied and passed on when cells divide and when parents have offspring.",
    mutation: "A mutation is a change in the DNA sequence. Many are harmless, some cause disease, and a few are helpful.",
    code: "The genetic code is the order of the four bases A, T, G and C. Groups of three bases name the amino acids that build a protein.",
    replication: "Before a cell divides, the helix unzips and each strand is used as a template to build a new partner strand.",
  },
  chips: [
    { label: "Backbone gold", text: "Paint the backbone gold" },
    { label: "Hotspot about genes", text: "Add a hotspot on the base pairs about genes" },
    { label: "Hide A–T pairs", text: "Hide the adenine thymine" },
    { label: "Side view", text: "Go to the side view" },
    { label: "Show the cell", text: "Switch to the cell" },
  ],
  tick: (root, dt) => {
    const m = root.getObjectByName("dna_model");
    if (m) m.rotation.y += dt * 0.25;
  },
};
