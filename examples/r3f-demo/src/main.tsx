import { Canvas } from "@react-three/fiber";
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type * as THREE from "three";
import type { SpecterHost } from "specter-core";
import { SpecterBridge, type R3FHost } from "specter-r3f";
import { parseCommand, type OpRegistry } from "specter-voice";

// A normal R3F scene. The only Specter-specific parts are the group ref, <SpecterBridge> and the text box.
function App() {
  const group = useRef<THREE.Group>(null);
  const bridge = useRef<{ host: R3FHost; registry: OpRegistry<SpecterHost> } | null>(null);
  const [text, setText] = useState("paint the crate gold");
  const [msg, setMsg] = useState("");

  const run = async () => {
    const b = bridge.current;
    if (!b) return;
    const ctx = b.host.getSpecContext({ app: "r3f-demo" });
    const out = parseCommand(text, ctx, b.registry);
    if (!out.spec) return setMsg(out.errors.join(" "));
    try {
      await b.registry.apply(b.host, out.spec);
      setMsg(b.registry.describe(out.spec).join("; "));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Canvas camera={{ position: [4, 3, 6], fov: 45 }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 8, 5]} intensity={2} />
        <group ref={group}>
          <mesh name="crate" position={[-1.2, 0.5, 0]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#8b5cf6" />
          </mesh>
          <mesh name="ball" position={[1.2, 0.5, 0]}>
            <sphereGeometry args={[0.6, 32, 24]} />
            <meshStandardMaterial color="#38bdf8" />
          </mesh>
        </group>
        <SpecterBridge
          target={group}
          hotspots={[{ id: "h1", mesh: "ball", title: "The ball", body: "A hotspot created from an R3F tree." }]}
          onReady={(host, registry) => {
            bridge.current = { host, registry };
          }}
        />
      </Canvas>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
        style={{ position: "absolute", left: 12, bottom: 12, display: "flex", gap: 8, font: "14px system-ui" }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Command" style={{ padding: 8, width: 280 }} />
        <button type="submit">Apply</button>
        <span style={{ color: "#ddd", alignSelf: "center" }}>{msg}</span>
      </form>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
