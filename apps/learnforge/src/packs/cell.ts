import * as THREE from "three";
import { namedGroup, namedMesh, pbr, seededRandom } from "specter-core";
import type { Pack } from "./types";

function mitochondrion(name: string, pos: [number, number, number], rot: [number, number, number], scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(...pos);
  g.rotation.set(...rot);
  g.scale.setScalar(scale);
  g.add(namedMesh(`${name}_shell`, new THREE.CapsuleGeometry(0.5, 1.5, 12, 24), pbr("#e2554f", { roughness: 0.4, opacity: 0.55 })));
  // cristae: folded inner membrane
  for (let i = -3; i <= 3; i++) {
    const ring = namedMesh(`${name}_cristae_${i + 3}`, new THREE.TorusGeometry(0.34, 0.045, 8, 28), pbr("#ffb2a6", { roughness: 0.5 }), [0, i * 0.26, 0], {
      rotation: [Math.PI / 2, 0, 0],
      scale: [1, 1, 1],
      castShadow: false,
    });
    g.add(ring);
  }
  return g;
}

function buildCell(): THREE.Object3D {
  const rand = seededRandom(7);
  const root = new THREE.Group();
  root.name = "cell";

  // membrane: a translucent shell so every organelle stays visible
  root.add(
    namedMesh("cell_membrane", new THREE.SphereGeometry(5, 64, 48), pbr("#ff9fbb", { roughness: 0.25, opacity: 0.11, side: THREE.DoubleSide }), [0, 0, 0], {
      scale: [1.15, 0.95, 1],
      castShadow: false,
    }),
  );

  // nucleus with nucleolus
  const nucleus = namedGroup("nucleus", [
    namedMesh("nucleus_envelope", new THREE.SphereGeometry(1.7, 48, 36), pbr("#7a63e0", { roughness: 0.35, opacity: 0.55 }), [0, 0, 0], { castShadow: false }),
    namedMesh("nucleolus", new THREE.SphereGeometry(0.6, 32, 24), pbr("#2b1a66", { roughness: 0.5 }), [0.25, 0.2, 0.35]),
    ...Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * Math.PI * 2;
      return namedMesh(`chromatin_${i}`, new THREE.TorusKnotGeometry(0.28, 0.06, 64, 8, 2, 3), pbr("#d6c8ff", { roughness: 0.6 }), [Math.cos(a) * 0.85, Math.sin(a * 1.7) * 0.6, Math.sin(a) * 0.85], {
        rotation: [a, a * 0.7, 0],
        castShadow: false,
      });
    }),
  ]);
  nucleus.position.set(-0.8, 0.3, 0);
  root.add(nucleus);

  // rough ER: stacked ribbons hugging the nucleus
  const er = new THREE.Group();
  er.name = "rough_er";
  for (let i = 0; i < 6; i++) {
    const r = 2.2 + i * 0.22;
    er.add(
      namedMesh(`rough_er_sheet_${i}`, new THREE.TorusGeometry(r, 0.07, 10, 56, Math.PI * (1.15 + (i % 3) * 0.12)), pbr("#f0a6c8", { roughness: 0.55 }), [0, (i - 2.5) * 0.12, 0], {
        rotation: [Math.PI / 2 + (i % 2 ? 0.06 : -0.06), 0, i * 0.5],
        scale: [1, 1, 0.5],
      }),
    );
  }
  er.position.set(-0.8, 0.3, 0);
  root.add(er);

  // ribosomes: small dots on the ER and free in the cytoplasm
  const ribosomes = new THREE.Group();
  ribosomes.name = "ribosomes";
  const dot = new THREE.SphereGeometry(0.09, 10, 8);
  const dotMat = pbr("#2f1b5e", { roughness: 0.5 });
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const r = 2.2 + rand() * 1.1;
    const m = new THREE.Mesh(dot, dotMat);
    m.name = `ribosome_${i}`;
    m.position.set(-0.8 + Math.cos(a) * r, 0.3 + (rand() - 0.5) * 0.7, Math.sin(a) * r * 0.5);
    m.castShadow = false;
    ribosomes.add(m);
  }
  root.add(ribosomes);

  // mitochondria (a cluster, so "paint the mitochondria" changes them all)
  root.add(
    namedGroup("mitochondria", [
      mitochondrion("mitochondrion_a", [0, 0, 0], [0.3, 0.4, 1.1], 1),
      mitochondrion("mitochondrion_b", [-0.6, -1.2, 0.9], [1.2, 0.2, 0.2], 0.8),
      mitochondrion("mitochondrion_c", [0.9, -0.9, -1.0], [0.4, 1.0, 0.7], 0.85),
    ]),
  );
  root.getObjectByName("mitochondria")!.position.set(2.6, 1.5, -0.8);

  // golgi apparatus: stack of curved plates
  const golgi = new THREE.Group();
  golgi.name = "golgi_apparatus";
  for (let i = 0; i < 5; i++) {
    golgi.add(
      namedMesh(`golgi_plate_${i}`, new THREE.TorusGeometry(1.15 - i * 0.07, 0.085, 10, 36, Math.PI * 0.95), pbr("#ffc56b", { roughness: 0.4 }), [0, i * 0.3, 0], {
        rotation: [Math.PI / 2, 0, 0],
        scale: [1, 1, 1],
      }),
    );
  }
  for (let i = 0; i < 6; i++) {
    const v = namedMesh(`vesicle_${i}`, new THREE.SphereGeometry(0.14, 14, 10), pbr("#ffd98f", { roughness: 0.35 }), [Math.cos(i) * 1.5, 0.2 + (i % 3) * 0.35, Math.sin(i) * 0.9]);
    golgi.add(v);
  }
  golgi.position.set(2.3, -2.0, 0.6);
  golgi.rotation.y = -0.5;
  root.add(golgi);

  // lysosomes
  root.add(
    namedGroup(
      "lysosomes",
      [
        namedMesh("lysosome_a", new THREE.SphereGeometry(0.34, 20, 16), pbr("#79e29a", { roughness: 0.3, emissive: "#2fb260", emissiveIntensity: 0.55 }), [0, 0, 0]),
        namedMesh("lysosome_b", new THREE.SphereGeometry(0.28, 20, 16), pbr("#79e29a", { roughness: 0.3, emissive: "#2fb260", emissiveIntensity: 0.55 }), [0.8, -0.4, 0.5]),
        namedMesh("lysosome_c", new THREE.SphereGeometry(0.3, 20, 16), pbr("#79e29a", { roughness: 0.3, emissive: "#2fb260", emissiveIntensity: 0.55 }), [-0.4, 0.5, 0.9]),
      ],
      [-3.6, -1.6, 1.4],
    ),
  );

  // centrioles: two short cylinders at right angles
  root.add(
    namedGroup(
      "centrioles",
      [
        namedMesh("centriole_a", new THREE.CylinderGeometry(0.16, 0.16, 0.75, 16), pbr("#ffe27a", { roughness: 0.4 }), [0, 0, 0]),
        namedMesh("centriole_b", new THREE.CylinderGeometry(0.16, 0.16, 0.75, 16), pbr("#ffe27a", { roughness: 0.4 }), [0.5, -0.1, 0], { rotation: [0, 0, Math.PI / 2] }),
      ],
      [-3.4, 2.5, -0.6],
    ),
  );

  return root;
}

export const cellPack: Pack = {
  id: "cell",
  title: "Animal cell",
  blurb: "Fly through a cutaway animal cell and meet the organelles that keep it alive.",
  subject: "a 3D animal cell with labelled organelles",
  glb: "/models/cell.glb",
  build: buildCell,
  lighting: "studio",
  background: ["#2a1a48", "#0a0714"],
  hotspots: [
    { id: "hs-nucleus", mesh: "nucleus", title: "Nucleus", body: "The nucleus stores the cell's DNA and controls which genes are switched on. The dark spot inside, the nucleolus, builds the parts of ribosomes." },
    { id: "hs-mitochondria", mesh: "mitochondria", title: "Mitochondria", body: "Mitochondria turn sugars and oxygen into ATP, the energy currency of the cell. Their folded inner membrane, the cristae, gives more surface for this work." },
    { id: "hs-rough-er", mesh: "rough_er", title: "Rough endoplasmic reticulum", body: "Folded sheets studded with ribosomes. Proteins made here are folded and sent on to the Golgi apparatus." },
    { id: "hs-golgi", mesh: "golgi_apparatus", title: "Golgi apparatus", body: "The cell's post office. It sorts, tags and packs proteins into vesicles that travel to where they are needed." },
    { id: "hs-lysosomes", mesh: "lysosomes", title: "Lysosomes", body: "Small sacs of digestive enzymes that break down worn-out parts and invaders so the cell can recycle them." },
    { id: "hs-centrioles", mesh: "centrioles", title: "Centrioles", body: "A pair of tiny tubes that help organise the spindle fibres that pull chromosomes apart when a cell divides." },
    { id: "hs-membrane", mesh: "cell_membrane", offset: [5.2, 1.4, 0.4], title: "Cell membrane", body: "A flexible double layer of fats that holds the cell together and decides what may enter or leave." },
  ],
  views: {
    overview: { position: [7.5, 4.6, 17.5], target: [0, -0.3, 0] },
    "nucleus-closeup": { position: [-0.2, 1.6, 5.2], target: [-0.8, 0.3, 0] },
    "mitochondria-closeup": { position: [5.4, 3.0, 3.6], target: [2.6, 1.5, -0.8] },
    "golgi-closeup": { position: [4.8, -0.9, 3.6], target: [2.3, -1.6, 0.6] },
  },
  aliases: {
    powerhouse: "mitochondria",
    mitochondrion: "mitochondria",
    "powerhouse of the cell": "mitochondria",
    membrane: "cell_membrane",
    golgi: "golgi_apparatus",
    "golgi body": "golgi_apparatus",
    er: "rough_er",
    "endoplasmic reticulum": "rough_er",
    "rough endoplasmic reticulum": "rough_er",
    lysosome: "lysosomes",
    centriole: "centrioles",
    ribosome: "ribosomes",
    "dna storage": "nucleus",
  },
  facts: {
    DNA: "DNA is the molecule that carries the cell's genetic instructions. It is coiled up inside the nucleus as chromatin.",
    ATP: "ATP is the small molecule cells use as energy. Mitochondria make most of it from glucose and oxygen.",
    proteins: "Proteins are the cell's workers. Ribosomes build them by reading instructions copied from DNA.",
    RNA: "RNA is a copy of a gene's instructions. Messenger RNA carries it from the nucleus to the ribosomes.",
    "cell division": "Before a cell divides it copies its DNA, then centrioles help pull the copies into two new cells.",
    energy: "Cells run on ATP. Mitochondria make most of it by breaking down sugars with oxygen.",
    chromosomes: "Chromosomes are tightly coiled packages of DNA. Humans have 46 in most cells.",
  },
  chips: [
    { label: "Hotspot on nucleus about DNA", text: "Add a hotspot on the nucleus about DNA" },
    { label: "Mitochondria glow red", text: "Make the mitochondria glow red" },
    { label: "Paint the golgi gold", text: "Paint the golgi apparatus gold" },
    { label: "Hide membrane", text: "Hide the cell membrane" },
    { label: "Go to nucleus", text: "Go to the nucleus closeup" },
    { label: "Solar system", text: "Switch to the solar system" },
  ],
};
