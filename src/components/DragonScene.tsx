import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Lightformer } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RedDragon, type RedDragonHandle } from "../../red-dragon";


function Ground() {
  const tex = useMemo(() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g = cv.getContext("2d")!;
    const cols = ["#3d2a22", "#47322a", "#523a2f", "#36251e"];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      g.fillStyle = cols[(x * 7 + y * 13 + ((x ^ y) & 3)) % 4]!;
      g.fillRect(x * 8, y * 8, 8, 8);
    }
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[30, 30]} />
      <meshStandardMaterial map={tex} roughness={1} />
    </mesh>
  );
}

export default function DragonScene() {
  const dragon = useRef<RedDragonHandle>(null);
  const [ui, setUi] = useState({ walking: false, mouth: false });
  const [ready, setReady] = useState(false);

  const toggleWalk = () => setUi((u) => ({ ...u, walking: !u.walking }));
  const toggleMouth = () => setUi((u) => ({ ...u, mouth: !u.mouth }));
  const attack = () => dragon.current?.fire();

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "KeyW") toggleWalk();
      if (e.code === "KeyM") toggleMouth();
      if (e.code === "Space") { e.preventDefault(); attack(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  return (
    <div className="relative h-dvh w-full bg-background" data-scene-ready={ready ? "" : undefined}>
      <Canvas shadows camera={{ position: [0.5, 1.6, typeof window !== "undefined" && window.innerWidth < 600 ? 10 : 6.5], fov: 40 }} dpr={[1, 2]} onCreated={() => setTimeout(() => setReady(true), 300)}>
        <color attach="background" args={["#1c1210"]} />
        <fog attach="fog" args={["#1c1210", 9, 22]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[5, 8, 4]} intensity={2.2} color="#ffe2c2" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} />
        <directionalLight position={[-5, 3, -4]} intensity={0.8} color="#7aa0ff" />
        <Environment resolution={64}>
          <Lightformer intensity={1.5} position={[0, 5, 0]} scale={[10, 10, 1]} />
          <Lightformer intensity={0.8} color="#ffb070" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
        </Environment>
        <RedDragon ref={dragon} walking={ui.walking} mouthOpen={ui.mouth} rotation-y={Math.PI / 2} />
        <Ground />
        <OrbitControls target={[0, 1, 0]} minDistance={3} maxDistance={14} maxPolarAngle={Math.PI / 2.05} enablePan={false} />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-0 p-4 text-center">
        <h1 className="font-pixel text-sm text-primary sm:text-lg">PYRO REX</h1>
        <p className="mt-2 font-pixel text-[9px] text-muted-foreground sm:text-[10px]">Drag to rotate · pinch/scroll to zoom</p>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap justify-center gap-2 p-4">
        <button type="button" className="pixel-btn" data-on={ui.walking} onClick={toggleWalk}>{ui.walking ? "Stop" : "Walk"} <kbd>W</kbd></button>
        <button type="button" className="pixel-btn" data-on={ui.mouth} onClick={toggleMouth}>{ui.mouth ? "Close" : "Open"} mouth <kbd>M</kbd></button>
        <button type="button" className="pixel-btn pixel-btn-fire" onClick={attack}>Fire! <kbd>Space</kbd></button>
      </div>
    </div>
  );
}
