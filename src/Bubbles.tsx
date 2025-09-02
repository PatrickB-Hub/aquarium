import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  MathUtils,
  MeshStandardMaterial,
  Object3D,
  type InstancedMesh,
} from "three";
import { fresnelOpacity } from "./fresnel.ts";
import { surfaceY, TANK, tankState, water } from "./tankState.ts";

const POOL = 40;
const STONE = { x: 0.3, z: -0.15, y: TANK.glass + 0.03 };
/** Seconds between single bubbles, between bursts, and bubbles per burst */
const SINGLE_EVERY: [number, number] = [0.25, 0.8];
const BURST_EVERY: [number, number] = [2.5, 4.5];
const BURST_SIZE: [number, number] = [8, 14];
const dummy = new Object3D();
// Nearly clear in the middle, bright silvery rim
const bubbleMaterial = fresnelOpacity(
  new MeshStandardMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.06,
    roughness: 0.05,
    depthWrite: false,
  }),
  0.85,
  2,
);

type Bubble = {
  active: boolean;
  x: number;
  y: number;
  z: number;
  r: number;
  rise: number;
  driftX: number;
  driftZ: number;
  phase: number;
};

const between = ([a, b]: [number, number]) => a + Math.random() * (b - a);

function launch(b: Bubble, spread: number, r: number, dy = 0) {
  b.active = true;
  b.x = STONE.x + (Math.random() - 0.5) * spread;
  b.z = STONE.z + (Math.random() - 0.5) * spread;
  b.y = STONE.y + dy;
  b.r = r;
  // Bigger bubbles rise faster: ≈0.17 m/s at 1 mm radius, ≈0.28 m/s at 4 mm
  b.rise = 0.13 + 37 * r;
  // Slight sideways drift fans the column out as it rises
  b.driftX = (Math.random() - 0.5) * 0.03;
  b.driftZ = (Math.random() - 0.5) * 0.03;
  b.phase = Math.random() * Math.PI * 2;
}

// Tank-local: rendered inside the tank's rigid body.
export default function Bubbles() {
  const mesh = useRef<InstancedMesh>(null);
  const bubbles = useMemo(
    () =>
      Array.from(
        { length: POOL },
        (): Bubble => ({
          active: false,
          x: 0,
          y: 0,
          z: 0,
          r: 0,
          rise: 0,
          driftX: 0,
          driftZ: 0,
          phase: 0,
        }),
      ),
    [],
  );
  const timers = useMemo(() => ({ single: 0, burst: 1 }), []);

  useFrame((_, delta) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(delta, 1 / 30);
    const free = () => bubbles.find((b) => !b.active);

    // A steady trickle of single bubbles, and now and then a burst that rises as a loose blob
    timers.single -= dt;
    if (timers.single <= 0) {
      const b = free();
      if (b) launch(b, 0.02, 0.001 + Math.random() * 0.0015);
      timers.single = between(SINGLE_EVERY);
    }
    timers.burst -= dt;
    if (timers.burst <= 0) {
      const n = Math.round(between(BURST_SIZE));
      for (let i = 0; i < n; i++) {
        const b = free();
        if (!b) break;
        launch(b, 0.04, 0.0015 + Math.random() * 0.0025, Math.random() * 0.03);
      }
      timers.burst = between(BURST_EVERY);
    }

    const { acc } = tankState;
    bubbles.forEach((b, i) => {
      if (b.active) {
        const [u, w] = water.velocityAt(b.x, b.z);
        // Terminal velocity points against the effective gravity g - a, so bubbles lean into the acceleration.
        b.x = MathUtils.clamp(
          b.x + (u + b.driftX + (b.rise * acc.x) / water.g) * dt,
          -water.lx / 2,
          water.lx / 2,
        );
        b.z = MathUtils.clamp(
          b.z + (w + b.driftZ + (b.rise * acc.z) / water.g) * dt,
          -water.lz / 2,
          water.lz / 2,
        );
        b.y += b.rise * dt;
        b.phase += dt * 12;
        if (b.y > surfaceY(b.x, b.z)) b.active = false;
      }
      // Small zig-zag wobble
      dummy.position.set(
        b.x + Math.sin(b.phase) * 0.004,
        b.y,
        b.z + Math.cos(b.phase * 0.8) * 0.004,
      );
      dummy.scale.setScalar(b.active ? b.r : 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      {/* Air stone standing on the tank floor with bubbles leaving from its top */}
      <mesh
        position={[STONE.x, (TANK.glass + STONE.y) / 2, STONE.z]}
        castShadow
      >
        <cylinderGeometry args={[0.014, 0.016, STONE.y - TANK.glass, 20]} />
        <meshStandardMaterial color="#3b3f42" roughness={1} />
      </mesh>
      <instancedMesh
        ref={mesh}
        args={[undefined, bubbleMaterial, POOL]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 10, 8]} />
      </instancedMesh>
    </>
  );
}
