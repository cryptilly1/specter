// Audit a .glb before using it with Specter: mesh names (what voice can target), triangles, textures, extensions.
// Usage: node scripts/audit-model.mjs path/to/model.glb [--init-config] [--max-tris=300000]
// --init-config writes <model>.config.json next to the file with one hotspot per named mesh, ready to edit.
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Usage: node scripts/audit-model.mjs <model.glb> [--init-config] [--max-tris=300000]");
  process.exit(2);
}
const maxTris = Number((args.find((a) => a.startsWith("--max-tris=")) ?? "--max-tris=300000").split("=")[1]);

const buf = readFileSync(file);
if (buf.readUInt32LE(0) !== 0x46546c67) {
  console.error("Not a binary glTF (.glb) file.");
  process.exit(2);
}
const jsonLen = buf.readUInt32LE(12);
if (buf.readUInt32LE(16) !== 0x4e4f534a) {
  console.error("First chunk is not JSON.");
  process.exit(2);
}
const gltf = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));

const GENERIC = /^(scene|root|sketchfab_model|rootnode|auxscene|object_\d+|mesh_?\d*|node_?\d*|group_?\d*|geometry_?\d*|cube(\.\d+)?|sphere(\.\d+)?|plane(\.\d+)?)$/i;
const nodes = gltf.nodes ?? [];
const meshes = gltf.meshes ?? [];
const accessors = gltf.accessors ?? [];

function meshTris(mesh) {
  let tris = 0;
  for (const p of mesh.primitives ?? []) {
    const mode = p.mode ?? 4;
    const count = p.indices !== undefined ? accessors[p.indices]?.count : accessors[p.attributes?.POSITION]?.count;
    if (!count) continue;
    tris += mode === 4 ? Math.floor(count / 3) : mode === 5 || mode === 6 ? Math.max(0, count - 2) : 0;
  }
  return tris;
}

const named = [];
let totalTris = 0;
for (const n of nodes) {
  const mesh = n.mesh !== undefined ? meshes[n.mesh] : undefined;
  const tris = mesh ? meshTris(mesh) : 0;
  totalTris += tris;
  if (n.name) named.push({ name: n.name, tris, isMesh: !!mesh, children: (n.children ?? []).length, generic: GENERIC.test(n.name) });
}

const images = gltf.images ?? [];
const textures = (gltf.textures ?? []).length;
const used = gltf.extensionsUsed ?? [];
const sizeMb = statSync(file).size / (1024 * 1024);

console.log(`\n${basename(file)}  ${sizeMb.toFixed(1)} MB`);
console.log(`  nodes ${nodes.length}  meshes ${meshes.length}  materials ${(gltf.materials ?? []).length}  textures ${textures}  images ${images.length}  animations ${(gltf.animations ?? []).length}`);
console.log(`  triangles ~${totalTris.toLocaleString()}  (budget ${maxTris.toLocaleString()})`);
console.log(`  extensions: ${used.length ? used.join(", ") : "none"}`);
if (used.includes("KHR_draco_mesh_compression")) console.log("  note: Draco decoder must be served at /draco/ (apps copy it automatically).");
if (used.includes("KHR_texture_basisu")) console.log("  note: KTX2 textures need a KTX2 loader. Re-export with WebP/PNG, or add KTX2Loader.");

const targets = named.filter((n) => (n.isMesh || n.children > 0) && !n.generic);
const generic = named.filter((n) => n.generic);
console.log(`\nVoice-targetable names (${targets.length}):`);
for (const t of targets.slice(0, 80)) console.log(`  ${t.name}${t.isMesh ? `  (${t.tris.toLocaleString()} tris)` : "  (group)"}`);
if (targets.length > 80) console.log(`  ... and ${targets.length - 80} more`);

const warnings = [];
if (totalTris > maxTris) warnings.push(`Triangle count exceeds ${maxTris.toLocaleString()}. Run: pnpm models:optimize ${file}`);
if (sizeMb > 15) warnings.push(`File is ${sizeMb.toFixed(1)} MB (budget 15 MB). Run: pnpm models:optimize ${file}`);
if (targets.length < 3) warnings.push("Fewer than 3 named parts. Voice commands can only target named meshes, so ask the artist for separate named parts, or split it in Blender.");
if (generic.length > targets.length) warnings.push(`${generic.length} nodes have generic names like "Object_12". Rename the important ones in Blender before exporting.`);
if (!used.includes("KHR_draco_mesh_compression") && !used.includes("EXT_meshopt_compression") && sizeMb > 5) warnings.push("Geometry is not compressed. pnpm models:optimize adds Draco/Meshopt.");
console.log(warnings.length ? `\nWarnings:\n${warnings.map((w) => `  - ${w}`).join("\n")}` : "\nNo warnings.");

if (args.includes("--init-config")) {
  const out = join(dirname(file), basename(file).replace(/\.glb$/i, "") + ".config.json");
  const humanize = (s) => s.replace(/[_\-.]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  const config = {
    $comment: "Edit titles/bodies, delete hotspots you do not want, and add aliases (spoken name -> mesh name). Views are optional.",
    hotspots: targets
      .filter((t) => t.isMesh || t.children > 0)
      .slice(0, 8)
      .map((t) => ({ id: `hs-${t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, mesh: t.name, title: humanize(t.name), body: `Describe ${humanize(t.name)} here.` })),
    aliases: {},
    facts: {},
  };
  writeFileSync(out, JSON.stringify(config, null, 2) + "\n");
  console.log(`\nWrote ${out}`);
}
process.exit(warnings.length && args.includes("--strict") ? 1 : 0);
