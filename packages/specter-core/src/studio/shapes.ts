import * as THREE from "three";
import type { Part } from "specter-voice";

const DEG = Math.PI / 180;

function labelSprite(text: string, color = "#ffffff"): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = 64;
  let width = 512;
  if (ctx) {
    ctx.font = `600 ${font}px system-ui, sans-serif`;
    width = Math.min(2048, Math.ceil(ctx.measureText(text).width) + 48);
  }
  canvas.width = width;
  canvas.height = 112;
  const g = canvas.getContext("2d");
  if (g) {
    g.fillStyle = "rgba(15,10,25,0.78)";
    const r = 28;
    g.beginPath();
    g.roundRect?.(0, 0, canvas.width, canvas.height, r);
    if (!g.roundRect) g.rect(0, 0, canvas.width, canvas.height);
    g.fill();
    g.font = `600 ${font}px system-ui, sans-serif`;
    g.fillStyle = color;
    g.textBaseline = "middle";
    g.textAlign = "center";
    g.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true });
  const s = new THREE.Sprite(mat);
  const h = 0.35;
  s.scale.set((h * canvas.width) / canvas.height, h, 1);
  s.userData.label = text;
  return s;
}

function geometryFor(p: Part): THREE.BufferGeometry | null {
  const d = p.dims ?? {};
  const arc = (d.arc ?? 360) * DEG;
  switch (p.shape) {
    case "box":
      return new THREE.BoxGeometry(d.width ?? 1, d.height ?? 1, d.depth ?? d.width ?? 1);
    case "sphere":
      return new THREE.SphereGeometry(d.radius ?? 0.5, 48, 32);
    case "cylinder":
      return new THREE.CylinderGeometry(d.radius ?? 0.4, d.radius ?? 0.4, d.height ?? 1, 40, 1, false, 0, arc);
    case "cone":
      return new THREE.ConeGeometry(d.radius ?? 0.5, d.height ?? 1, 40);
    case "pyramid":
      return new THREE.ConeGeometry(d.radius ?? 0.7, d.height ?? 1, 4);
    case "torus":
      return new THREE.TorusGeometry(d.radius ?? 0.5, d.tube ?? 0.15, 20, 64, arc);
    case "ring":
      return new THREE.RingGeometry(d.inner ?? 0.5, d.outer ?? 0.8, 64, 1, 0, arc);
    case "plane": {
      const g = new THREE.PlaneGeometry(d.width ?? 2, d.depth ?? d.height ?? d.width ?? 2);
      g.rotateX(-Math.PI / 2); // planes lie flat by default
      return g;
    }
    case "capsule":
      return new THREE.CapsuleGeometry(d.radius ?? 0.3, Math.max(0.01, (d.height ?? 1) - 2 * (d.radius ?? 0.3)), 12, 32);
    default:
      return null;
  }
}

/** Build one part. Positions are the shape's centre, taken literally, so recipes stay predictable. */
export function buildPart(p: Part): THREE.Object3D {
  let obj: THREE.Object3D;
  if (p.shape === "group") {
    obj = new THREE.Group();
  } else if (p.shape === "label") {
    obj = labelSprite(p.text ?? p.name, p.color);
  } else if (p.shape === "pointLight" || p.shape === "spotLight") {
    const color = new THREE.Color(p.color ?? "#ffffff");
    const light = p.shape === "pointLight" ? new THREE.PointLight(color, p.intensity ?? 20, 0, 2) : new THREE.SpotLight(color, p.intensity ?? 40, 0, Math.PI / 6, 0.4, 2);
    light.castShadow = false;
    obj = light;
  } else {
    const geo = geometryFor(p)!;
    const mat = new THREE.MeshStandardMaterial({
      color: p.color ?? "#b9b3c9",
      roughness: p.roughness ?? 0.55,
      metalness: p.metalness ?? 0.05,
      side: p.shape === "ring" || p.shape === "plane" || (p.dims?.arc ?? 360) < 360 ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (p.emissive) {
      mat.emissive = new THREE.Color(p.emissive);
      mat.emissiveIntensity = p.emissiveIntensity ?? 1.2;
    }
    if (p.opacity !== undefined && p.opacity < 1) {
      mat.transparent = true;
      mat.opacity = p.opacity;
      mat.depthWrite = false;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = !(p.opacity !== undefined && p.opacity < 0.9);
    mesh.receiveShadow = true;
    obj = mesh;
  }
  obj.name = p.name;
  if (p.position) obj.position.set(...p.position);
  if (p.rotation) obj.rotation.set(p.rotation[0] * DEG, p.rotation[1] * DEG, p.rotation[2] * DEG);
  if (p.scale) obj.scale.set(...p.scale);
  obj.userData.part = { shape: p.shape };
  return obj;
}

/** Build a group of parts, nesting by `parent`. Throws on cycles (validation already rejects unknown parents). */
export function buildParts(parts: Part[], root: THREE.Group): void {
  const built = new Map<string, THREE.Object3D>();
  for (const p of parts) built.set(p.name, buildPart(p));
  for (const p of parts) {
    const o = built.get(p.name)!;
    let parent: THREE.Object3D = root;
    if (p.parent) {
      // guard against cycles a -> b -> a
      let cur: string | undefined = p.parent;
      const seen = new Set([p.name]);
      while (cur) {
        if (seen.has(cur)) throw new Error(`Part "${p.name}" has a parent loop`);
        seen.add(cur);
        cur = parts.find((x) => x.name === cur)?.parent;
      }
      parent = built.get(p.parent) ?? root;
    }
    parent.add(o);
  }
}

export const DEG2RAD = DEG;
