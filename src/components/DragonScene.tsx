import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, Lightformer } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

// Feel constants
const WALK_SPEED = 0.9; // world units / s along path
const PATH_RADIUS = 2.6;
const STEP_RATE = 7; // leg cycles (rad/s)
const LEG_SWING = 0.65;
const JAW_OPEN = 0.55;
const ATTACK_TIME = 1.6;
const MAX_P = 500;

type V3 = [number, number, number];
const C = {
  red: "#c0262d", redHi: "#e2453c", redLo: "#8a1620", redDk: "#5e0e17",
  gold: "#f2b632", goldHi: "#ffd76a", goldLo: "#b97d14",
  bone: "#f4ead2", eye: "#fff35c", pupil: "#1a0a05", mouth: "#3a0610",
};

function V({ p, s, c, e }: { p: V3; s: V3; c: string; e?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} flatShading roughness={0.75} emissive={e ? c : "#000"} emissiveIntensity={e ?? 0} />
    </mesh>
  );
}

type Ctrl = { walking: boolean; mouth: boolean; attackUntil: number };

function Dragon({ ctrl }: { ctrl: React.MutableRefObject<Ctrl> }) {
  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const jaw = useRef<THREE.Group>(null!);
  const mouthPt = useRef<THREE.Object3D>(null!);
  const tail = useRef<THREE.Group[]>([]);
  const fire = useRef<THREE.InstancedMesh>(null!);
  const st = useRef({ angle: 0, phase: 0, walkAmt: 0, jaw: 0, t: 0, spawnAcc: 0 });
  const parts = useMemo(
    () => Array.from({ length: MAX_P }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, size: 1, big: false })),
    [],
  );
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), mp: new THREE.Vector3(), dir: new THREE.Vector3(), col: new THREE.Color(), p: new THREE.Vector3() }), []);
  const fireCols = useMemo(() => ["#fffbe0", "#ffe14a", "#ffa21f", "#f2521b", "#a3201a", "#4a3a36"].map((c) => new THREE.Color(c)), []);

  const spawn = (big: boolean) => {
    const pt = parts.find((q) => q.life <= 0);
    if (!pt) return;
    pt.p.copy(tmp.mp);
    const spread = big ? 0.35 : 0.5;
    const speed = big ? 4 + Math.random() * 2.5 : 0.6 + Math.random() * 0.7;
    pt.v.copy(tmp.dir).multiplyScalar(speed);
    pt.v.x += (Math.random() - 0.5) * spread * speed * 0.6;
    pt.v.z += (Math.random() - 0.5) * spread * speed * 0.6;
    pt.v.y += big ? (Math.random() - 0.3) * 0.8 : 0.5 + Math.random() * 0.6;
    pt.max = pt.life = big ? 0.7 + Math.random() * 0.5 : 0.35 + Math.random() * 0.3;
    pt.size = big ? 0.12 + Math.random() * 0.12 : 0.04 + Math.random() * 0.04;
    pt.big = big;
  };

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = st.current, c = ctrl.current;
    s.t += dt;
    const attacking = s.t < c.attackUntil;
    // walking
    const tw = c.walking && !attacking ? 1 : 0;
    s.walkAmt += (tw - s.walkAmt) * (1 - Math.exp(-8 * dt));
    if (s.walkAmt > 0.01) {
      s.angle += (WALK_SPEED / PATH_RADIUS) * dt * s.walkAmt;
      s.phase += STEP_RATE * dt * s.walkAmt;
    } else s.phase = Math.round(s.phase / Math.PI) * Math.PI; // plant
    root.current.position.set(Math.cos(s.angle) * PATH_RADIUS, 0, Math.sin(s.angle) * PATH_RADIUS);
    root.current.rotation.y = -s.angle + Math.PI; // face tangent (+z local)
    const sw = Math.sin(s.phase) * LEG_SWING * s.walkAmt;
    legL.current.rotation.x = sw;
    legR.current.rotation.x = -sw;
    armL.current.rotation.x = -sw * 0.5 - (attacking ? 0.6 : 0);
    armR.current.rotation.x = sw * 0.5 - (attacking ? 0.6 : 0);
    body.current.position.y = Math.abs(Math.sin(s.phase)) * 0.35 * s.walkAmt + Math.sin(s.t * 2) * 0.08;
    body.current.rotation.z = Math.sin(s.phase) * 0.05 * s.walkAmt;
    tail.current.forEach((g, i) => g && (g.rotation.y = Math.sin(s.t * 3 - i * 0.7) * (0.12 + 0.1 * s.walkAmt)));
    // head + jaw
    const open = attacking || c.mouth;
    const jt = attacking ? JAW_OPEN * 1.3 : open ? JAW_OPEN : 0;
    s.jaw += (jt - s.jaw) * (1 - Math.exp(-14 * dt));
    jaw.current.rotation.x = s.jaw;
    head.current.rotation.x = attacking ? -0.12 : -s.jaw * 0.2;
    // fire
    mouthPt.current.getWorldPosition(tmp.mp);
    root.current.getWorldDirection(tmp.dir);
    if (s.jaw > JAW_OPEN * 0.5) {
      s.spawnAcc += dt * (attacking ? 260 : 18);
      while (s.spawnAcc >= 1) { s.spawnAcc--; spawn(attacking); }
    } else s.spawnAcc = 0;
    const g = 0.05; // pixel snap
    let n = 0;
    for (const pt of parts) {
      if (pt.life <= 0) continue;
      pt.life -= dt;
      pt.p.addScaledVector(pt.v, dt);
      pt.v.y += (pt.big ? 0.9 : 1.2) * dt;
      pt.v.multiplyScalar(Math.exp(-(pt.big ? 1.2 : 2) * dt));
      const r = 1 - Math.max(pt.life, 0) / pt.max;
      const sz = pt.size * (pt.big ? 1 + r * 2.2 : 1 - r * 0.6);
      tmp.p.set(Math.round(pt.p.x / g) * g, Math.round(pt.p.y / g) * g, Math.round(pt.p.z / g) * g);
      tmp.s.setScalar(Math.round(sz / g) * g || g);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      fire.current.setMatrixAt(n, tmp.m);
      const f = r * (fireCols.length - 1), i0 = Math.floor(f);
      tmp.col.copy(fireCols[i0]!).lerp(fireCols[Math.min(i0 + 1, fireCols.length - 1)]!, f - i0);
      fire.current.setColorAt(n, tmp.col);
      n++;
    }
    fire.current.count = n;
    fire.current.instanceMatrix.needsUpdate = true;
    if (fire.current.instanceColor) fire.current.instanceColor.needsUpdate = true;
  });

  const leg = (x: number, ref: React.RefObject<THREE.Group>) => (
    <group ref={ref} position={[x, 5, 0]}>
      <V p={[0, -0.8, 0]} s={[2.4, 2, 2.4]} c={C.red} />
      <V p={[0, -2.6, 0]} s={[1.6, 1.8, 1.6]} c={C.redLo} />
      <V p={[0, -4.25, 0.5]} s={[2.2, 1, 3]} c={C.redDk} />
      {[-0.7, 0, 0.7].map((cx) => <V key={cx} p={[cx, -4.4, 2.3]} s={[0.5, 0.7, 0.8]} c={C.bone} />)}
    </group>
  );
  const arm = (x: number, ref: React.RefObject<THREE.Group>) => (
    <group ref={ref} position={[x, 9.3, 1.8]}>
      <V p={[0, -0.5, 0.6]} s={[1.1, 1.1, 2]} c={C.redHi} />
      <V p={[0, -1, 1.8]} s={[1, 0.6, 0.8]} c={C.bone} />
    </group>
  );

  return (
    <>
      <group ref={root}>
        <group scale={0.13}>
          {leg(-1.9, legL)}
          {leg(1.9, legR)}
          <group ref={body}>
            {/* torso: stepped plump shape */}
            <V p={[0, 8, 0]} s={[6, 6, 6]} c={C.red} />
            <V p={[0, 8, 0]} s={[7, 4, 5]} c={C.red} />
            <V p={[0, 7.5, 0]} s={[5, 3.5, 7]} c={C.red} />
            <V p={[0, 5.6, 0]} s={[5, 1.2, 5]} c={C.redLo} />
            <V p={[0, 11.2, -0.3]} s={[5, 0.8, 5]} c={C.redHi} />
            {/* belly plates */}
            {[6.2, 7.4, 8.6, 9.8].map((y, i) => <V key={y} p={[0, y, 3.55]} s={[i % 2 ? 3.6 : 3, 1, 0.3]} c={i % 2 ? C.gold : C.goldHi} />)}
            {/* back spikes */}
            {[[11.8, -1.5, 1.2], [10.8, -3.2, 1.0], [9.4, -3.9, 0.9]].map(([y, z, h], i) => (
              <group key={i}>
                <V p={[0, y!, z!]} s={[0.8, h!, 0.8]} c={C.gold} />
                <V p={[0, y! + h! * 0.75, z!]} s={[0.4, h! * 0.5, 0.4]} c={C.goldHi} />
              </group>
            ))}
            {/* stub wings */}
            {[-1, 1].map((sx) => (
              <group key={sx} position={[sx * 3.6, 10, -1.5]}>
                <V p={[sx * 0.8, 0.6, 0]} s={[1.6, 0.6, 1]} c={C.redLo} />
                <V p={[sx * 1.8, 1.2, -0.3]} s={[1.2, 0.6, 1.8]} c={C.redDk} />
                <V p={[sx * 1.2, 0, -0.6]} s={[1.6, 1.2, 0.3]} c={C.goldLo} />
              </group>
            ))}
            {arm(-3.6, armL)}
            {arm(3.6, armR)}
            {/* tail chain */}
            <group position={[0, 6.8, -3.4]}>
              {(() => {
                const sizes = [2.8, 2.2, 1.6, 1.1];
                const build = (i: number): React.ReactNode =>
                  i >= sizes.length ? (
                    <group>
                      <V p={[0, 0.4, -0.6]} s={[1.8, 0.4, 1.2]} c={C.gold} />
                      <V p={[0, 0.4, -1.4]} s={[0.8, 0.4, 0.6]} c={C.goldHi} />
                    </group>
                  ) : (
                    <group ref={(g) => { if (g) tail.current[i] = g; }}>
                      <V p={[0, 0, -1]} s={[sizes[i]!, sizes[i]!, 2]} c={i % 2 ? C.redLo : C.red} />
                      <V p={[0, sizes[i]! / 2 + 0.25, -1]} s={[0.5, 0.5, 0.6]} c={C.gold} />
                      <group position={[0, -0.25 + (i === 0 ? -0.4 : 0.1), -2]}>{build(i + 1)}</group>
                    </group>
                  );
                return build(0);
              })()}
            </group>
            {/* head */}
            <group ref={head} position={[0, 11.6, 1.6]}>
              <V p={[0, 2, 0]} s={[5, 4, 4.6]} c={C.red} />
              <V p={[0, 2, 0]} s={[5.6, 3, 3.6]} c={C.red} />
              <V p={[0, 4.2, -0.3]} s={[4, 0.6, 3.6]} c={C.redHi} />
              {/* brow */}
              <V p={[0, 3.5, 2.4]} s={[4.6, 0.7, 0.4]} c={C.redDk} />
              {/* eyes */}
              {[-1, 1].map((sx) => (
                <group key={sx}>
                  <V p={[sx * 1.35, 2.6, 2.35]} s={[1.3, 1, 0.2]} c={C.eye} e={2.2} />
                  <V p={[sx * 1.1, 2.5, 2.47]} s={[0.4, 0.7, 0.1]} c={C.pupil} />
                  <pointLight position={[sx * 1.4, 2.6, 3]} color={C.eye} intensity={0.6} distance={1.5} />
                </group>
              ))}
              {/* upper snout */}
              <V p={[0, 1.5, 3.4]} s={[3.8, 1.6, 2.6]} c={C.red} />
              <V p={[0, 2.4, 3.2]} s={[3, 0.4, 2]} c={C.redHi} />
              {[-0.9, 0.9].map((x) => <V key={x} p={[x, 1.9, 4.75]} s={[0.4, 0.4, 0.1]} c={C.redDk} />)}
              {[-1.4, -0.5, 0.5, 1.4].map((x) => <V key={x} p={[x, 0.55, 4.2]} s={[0.35, 0.4, 0.35]} c={C.bone} />)}
              <V p={[0, 0.9, 2.6]} s={[3.4, 0.4, 2.6]} c={C.mouth} />
              {/* horns / crown */}
              {[-1, 1].map((sx) => (
                <group key={sx}>
                  <V p={[sx * 2, 4.5, -0.8]} s={[0.9, 1, 0.9]} c={C.goldLo} />
                  <V p={[sx * 2.4, 5.4, -1.3]} s={[0.7, 1, 0.7]} c={C.gold} />
                  <V p={[sx * 2.7, 6.2, -1.9]} s={[0.5, 0.8, 0.5]} c={C.goldHi} />
                  <V p={[sx * 3, 2.2, -0.5]} s={[0.6, 1.2, 1]} c={C.gold} />
                </group>
              ))}
              {[-0.9, 0, 0.9].map((x) => (
                <V key={x} p={[x, x === 0 ? 5.1 : 4.8, 0.6]} s={[0.6, x === 0 ? 1.2 : 0.7, 0.6]} c={x === 0 ? C.goldHi : C.gold} />
              ))}
              {/* jaw */}
              <group ref={jaw} position={[0, 0.7, 1.4]}>
                <V p={[0, -0.6, 1.6]} s={[3.4, 1, 3]} c={C.redLo} />
                <V p={[0, -0.05, 1.6]} s={[2.8, 0.15, 2.6]} c={C.mouth} />
                {[-1.2, 1.2].map((x) => <V key={x} p={[x, 0.15, 2.8]} s={[0.35, 0.4, 0.35]} c={C.bone} />)}
                <V p={[0, -1.15, 1.2]} s={[2.4, 0.3, 2]} c={C.goldLo} />
              </group>
              <object3D ref={mouthPt} position={[0, 0.9, 4.8]} />
            </group>
          </group>
        </group>
      </group>
      <instancedMesh ref={fire} args={[undefined, undefined, MAX_P]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  );
}

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
  const ctrl = useRef<Ctrl>({ walking: true, mouth: false, attackUntil: 0 });
  const clock = useRef(0);
  const [ui, setUi] = useState({ walking: true, mouth: false });
  const [ready, setReady] = useState(false);

  const toggleWalk = () => { ctrl.current.walking = !ctrl.current.walking; setUi((u) => ({ ...u, walking: ctrl.current.walking })); };
  const toggleMouth = () => { ctrl.current.mouth = !ctrl.current.mouth; setUi((u) => ({ ...u, mouth: ctrl.current.mouth })); };
  const attack = () => { ctrl.current.attackUntil = clock.current + ATTACK_TIME; };

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
      <Canvas shadows camera={{ position: [5, 3.5, 6], fov: 42 }} dpr={[1, 2]} onCreated={() => setTimeout(() => setReady(true), 300)}>
        <Tick clock={clock} />
        <color attach="background" args={["#1c1210"]} />
        <fog attach="fog" args={["#1c1210", 9, 22]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[5, 8, 4]} intensity={2.2} color="#ffe2c2" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} />
        <directionalLight position={[-5, 3, -4]} intensity={0.8} color="#7aa0ff" />
        <Environment resolution={64}>
          <Lightformer intensity={1.5} position={[0, 5, 0]} scale={[10, 10, 1]} />
          <Lightformer intensity={0.8} color="#ffb070" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
        </Environment>
        <Dragon ctrl={ctrl} />
        <Ground />
        <OrbitControls target={[0, 1, 0]} minDistance={3} maxDistance={14} maxPolarAngle={Math.PI / 2.05} enablePan={false} />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-0 p-4 text-center">
        <h1 className="font-pixel text-sm text-primary sm:text-lg">PYRO REX</h1>
        <p className="mt-2 font-pixel text-[9px] text-muted-foreground sm:text-[10px]">Drag to rotate · pinch/scroll to zoom</p>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-2 p-4">
        <button className="pixel-btn" data-on={ui.walking} onClick={toggleWalk}>{ui.walking ? "Stop" : "Walk"} <kbd>W</kbd></button>
        <button className="pixel-btn" data-on={ui.mouth} onClick={toggleMouth}>{ui.mouth ? "Close" : "Open"} mouth <kbd>M</kbd></button>
        <button className="pixel-btn pixel-btn-fire" onClick={attack}>Fire! <kbd>Space</kbd></button>
      </div>
    </div>
  );
}

function Tick({ clock }: { clock: React.MutableRefObject<number> }) {
  useFrame((_, d) => { clock.current += Math.min(d, 0.05); });
  return null;
}
