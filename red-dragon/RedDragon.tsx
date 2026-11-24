import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";

/** Feel constants — tweak freely. */
export const STEP_RATE = 7; // leg cycles (rad/s)
export const LEG_SWING = 0.65;
export const JAW_OPEN = 0.55;
export const ATTACK_TIME = 1.6;
const MAX_P = 500;

type V3 = [number, number, number];
const C = {
  red: "#c0262d", redHi: "#e2453c", redLo: "#8a1620", redDk: "#5e0e17",
  gold: "#f2b632", goldHi: "#ffd76a", goldLo: "#b97d14",
  bone: "#f4ead2", eye: "#fff35c", pupil: "#1a0a05", mouth: "#3a0610",
};

// One shared unit cube + one material per colour: ~15 materials total, no per-block allocations.
const BOX = new THREE.BoxGeometry(1, 1, 1);
const MATS = new Map<string, THREE.MeshStandardMaterial>();
function mat(c: string, e = 0) {
  const k = c + e;
  let m = MATS.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.75, emissive: e ? c : "#000", emissiveIntensity: e });
    MATS.set(k, m);
  }
  return m;
}
function V({ p, s, c, e }: { p: V3; s: V3; c: string; e?: number }) {
  return <mesh geometry={BOX} material={mat(c, e)} position={p} scale={s} castShadow receiveShadow />;
}

export type RedDragonHandle = {
  /** Big fire attack in the facing direction. */
  fire: (seconds?: number) => void;
  /** World position of the mouth (useful for hit tests). */
  getMouthPosition: (target: THREE.Vector3) => THREE.Vector3;
  /** Root group: move / rotate this from your game. */
  group: THREE.Group | null;
};

export type RedDragonProps = Omit<ThreeElements["group"], "ref"> & {
  ref?: React.Ref<RedDragonHandle>;
  /** Legs alternate while true, plant when false. Dragon stays in place; move it yourself. */
  walking?: boolean;
  /** Opens the jaw and emits small ambient sparks. */
  mouthOpen?: boolean;
  /** Controlled alternative to ref.fire(): true while attacking. */
  attacking?: boolean;
  /** Leg cycle speed multiplier (e.g. map to your movement speed). */
  walkSpeed?: number;
  /** Max fire particles (lower for weaker devices). */
  maxParticles?: number;
  castShadow?: boolean;
  /** Called every frame with each live fire particle (for damage / collision). */
  onFireParticle?: (pos: THREE.Vector3, big: boolean) => void;
};

/**
 * Blocky pixel-art red dragon. Faces +Z in local space, feet at y=0, ~2 units tall.
 * Self-contained: no lights, ground, camera or controls.
 */
export function RedDragon({ ref, walking = false, mouthOpen = false, attacking: attackingProp = false, walkSpeed = 1, maxParticles = MAX_P, onFireParticle, ...groupProps }: RedDragonProps) {
  const ctrl = useRef({ attackUntil: 0 });
  const root = useRef<THREE.Group>(null!);
  const MAXN = maxParticles;
  const body = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const jaw = useRef<THREE.Group>(null!);
  const mouthPt = useRef<THREE.Object3D>(null!);
  const tail = useRef<THREE.Group[]>([]);
  const wings = useRef<THREE.Group[]>([]);
  const fire = useRef<THREE.InstancedMesh>(null!);
  const st = useRef({ phase: 0, walkAmt: 0, jaw: 0, t: 0, spawnAcc: 0 });
  const parts = useMemo(
    () => Array.from({ length: MAXN }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, size: 1, big: false })),
    [MAXN],
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
    const s = st.current, c = { walking, mouth: mouthOpen, attackUntil: ctrl.current.attackUntil };
    s.t += dt;
    const attacking = attackingProp || s.t < c.attackUntil;
    // walking
    const tw = c.walking && !attacking ? 1 : 0;
    s.walkAmt += (tw - s.walkAmt) * (1 - Math.exp(-8 * dt));
    if (s.walkAmt > 0.01) {
      s.phase += STEP_RATE * walkSpeed * dt * s.walkAmt;
    } else s.phase = Math.round(s.phase / Math.PI) * Math.PI; // plant
    const sw = Math.sin(s.phase) * LEG_SWING * s.walkAmt;
    legL.current.rotation.x = sw;
    legR.current.rotation.x = -sw;
    armL.current.rotation.x = -sw * 0.5 - (attacking ? 0.6 : 0);
    armR.current.rotation.x = sw * 0.5 - (attacking ? 0.6 : 0);
    body.current.position.y = Math.abs(Math.sin(s.phase)) * 0.35 * s.walkAmt + Math.sin(s.t * 2) * 0.08;
    body.current.rotation.z = Math.sin(s.phase) * 0.05 * s.walkAmt;
    tail.current.forEach((g, i) => g && (g.rotation.y = Math.sin(s.t * 3 - i * 0.7) * (0.12 + 0.1 * s.walkAmt)));
    const flap = Math.sin(s.t * (attacking ? 9 : 2.5)) * (attacking ? 0.35 : 0.15);
    if (wings.current[0]) wings.current[0].rotation.z = -0.35 - flap;
    if (wings.current[1]) wings.current[1].rotation.z = 0.35 + flap;
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
      onFireParticle?.(pt.p, pt.big);
      n++;
    }
    fire.current.count = n;
    fire.current.instanceMatrix.needsUpdate = true;
    if (fire.current.instanceColor) fire.current.instanceColor.needsUpdate = true;
  });

  useImperativeHandle(ref, () => ({
    fire: (sec = ATTACK_TIME) => { ctrl.current.attackUntil = st.current.t + sec; },
    getMouthPosition: (t) => mouthPt.current.getWorldPosition(t),
    get group() { return root.current; },
  }), []);

  const leg = (x: number, ref: React.RefObject<THREE.Group | null>) => (
    <group ref={ref} position={[x, 5, 0]}>
      <V p={[0, -0.8, 0]} s={[2.4, 2, 2.4]} c={C.red} />
      <V p={[0, -2.6, 0]} s={[1.6, 1.8, 1.6]} c={C.redLo} />
      <V p={[0, -4.25, 0.5]} s={[2.2, 1, 3]} c={C.redDk} />
      {[-0.7, 0, 0.7].map((cx) => <V key={cx} p={[cx, -4.4, 2.3]} s={[0.5, 0.7, 0.8]} c={C.bone} />)}
    </group>
  );
  const arm = (x: number, ref: React.RefObject<THREE.Group | null>) => (
    <group ref={ref} position={[x, 9.3, 1.8]}>
      <V p={[0, -0.5, 0.6]} s={[1.1, 1.1, 2]} c={C.redHi} />
      <V p={[0, -1, 1.8]} s={[1, 0.6, 0.8]} c={C.bone} />
    </group>
  );

  return (
    <>
      <group ref={root} {...groupProps}>
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
            {/* wings: stepped bone arm + pixel membrane */}
            {[-1, 1].map((sx) => (
              <group key={sx} ref={(g) => { if (g) wings.current[sx < 0 ? 0 : 1] = g; }} position={[sx * 2.8, 10.6, -2]} rotation-y={sx * 1.25}>
                <V p={[sx * 1.5, 0.8, 0]} s={[3, 0.8, 0.8]} c={C.redLo} />
                <V p={[sx * 3.8, 2.2, -0.2]} s={[2.2, 0.8, 0.8]} c={C.redLo} />
                <V p={[sx * 5.6, 3.4, -0.4]} s={[1.8, 0.7, 0.7]} c={C.redDk} />
                <V p={[sx * 6.8, 4.2, -0.4]} s={[0.7, 1, 0.7]} c={C.gold} />
                {[
                  [1.5, -0.4, 2.6], [3, 0.2, 4], [4.4, 1, 4.4], [5.6, 1.6, 4.2], [6.6, 2.4, 3.2],
                ].map(([x, y, h], i) => (
                  <group key={i}>
                    <V p={[sx * x!, y! - h! / 2 + 0.6, -0.5]} s={[1.3, h!, 0.3]} c={i % 2 ? C.goldLo : C.gold} />
                    <V p={[sx * x!, y! - h! + 0.4, -0.5]} s={[0.5, 0.5, 0.35]} c={C.redDk} />
                  </group>
                ))}
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
      <instancedMesh ref={fire} args={[undefined, undefined, MAXN]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  );
}
