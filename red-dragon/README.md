# Red Dragon — blocky pixel-art 3D character

Self-contained React Three Fiber component. Contains **only the dragon** (body, wings, animations, fire particles) —
no lights, ground, camera or controls, so it drops into any scene.

## Requirements
`three`, `@react-three/fiber` (v9 / React 19), `react`. Copy this folder into your project.

## Usage
```tsx
import { useRef } from "react";
import { RedDragon, type RedDragonHandle } from "./red-dragon";

const dragon = useRef<RedDragonHandle>(null);

<RedDragon
  ref={dragon}
  walking={isMoving}          // legs alternate; plant when false
  mouthOpen={breathing}       // jaw opens + small sparks
  position={[x, 0, 0]}
  rotation-y={Math.PI / 2}    // face right (side view / 2D games)
  scale={1}
/>

dragon.current?.fire();       // big fire burst in facing direction (or pass attacking={true})
```

## Props
| Prop | Default | Notes |
| --- | --- | --- |
| `walking` | `false` | Walk-in-place leg cycle. Move the dragon yourself via `position`. |
| `mouthOpen` | `false` | Ambient sparks while open. |
| `attacking` | `false` | Controlled big fire. |
| `walkSpeed` | `1` | Leg cycle multiplier. |
| `maxParticles` | `500` | Lower on weak devices. |
| `onFireParticle(pos, big)` | — | Per live particle each frame, for damage checks. |
| any `<group>` prop | — | `position`, `rotation`, `scale`, `visible`… |

## Handle (`ref`)
- `fire(seconds?)` — trigger big fire attack.
- `getMouthPosition(vec3)` — world-space mouth position.
- `group` — root `THREE.Group`.

## Notes
- Faces +Z locally, feet at y = 0, about 2 units tall.
- 2D games: use an orthographic camera looking down −Z with `rotation-y={Math.PI/2}` (faces right) or `-Math.PI/2` (faces left).
- Shares one box geometry and one material per colour; fire uses a single instanced mesh (1 draw call).
- Never render it on the server (it uses WebGL).
