import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createSpecterRegistry } from "specter-core";
import { parseCommand } from "specter-voice";
import { R3FHost } from "./bridge";

function setup() {
  document.body.innerHTML = "";
  const wrap = document.createElement("div");
  const canvas = document.createElement("canvas");
  wrap.appendChild(canvas);
  document.body.appendChild(wrap);
  const group = new THREE.Group();
  const cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: "#8b5cf6" }));
  cube.name = "crate";
  const ball = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshStandardMaterial({ color: "#38bdf8" }));
  ball.name = "ball";
  group.add(cube, ball);
  const host = new R3FHost(group, new THREE.PerspectiveCamera(), canvas);
  return { host, group, cube, ball, registry: createSpecterRegistry() };
}

describe("R3F bridge", () => {
  it("applies a parsed command to an R3F tree and only touches the named mesh", async () => {
    const { host, cube, ball, registry } = setup();
    const before = (ball.material as THREE.MeshStandardMaterial).color.getHexString();
    const out = parseCommand("paint the crate gold", host.getSpecContext({ app: "r3f" }), registry);
    expect(out.spec).toBeDefined();
    await registry.apply(host, out.spec!);
    expect((cube.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("d4a017");
    expect((ball.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(before);
    await registry.undo();
    expect((cube.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("8b5cf6");
    host.destroy();
  });

  it("adds hotspots and notes, and fails loudly for unknown targets", async () => {
    const { host, registry } = setup();
    await registry.apply(host, { version: 1, ops: [{ op: "addHotspot", id: "h", mesh: "ball", title: "Ball", body: "Round." }] });
    expect(host.hotspots.list()).toHaveLength(1);
    await expect(registry.apply(host, { version: 1, ops: [{ op: "setMaterial", mesh: "ghost", color: "#ffffff" }] })).rejects.toThrow(/Could not find mesh/);
    host.destroy();
    expect(document.querySelector(".specter-overlay")).toBeNull();
  });
});
