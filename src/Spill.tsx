import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  DataTexture,
  LinearFilter,
  Object3D,
  PlaneGeometry,
  Vector3,
  type InstancedMesh,
} from "three";
import { TABLE, TANK, tankState, water } from "./tankState.ts";

// Water spilled over the rim
const POOL = 2000;
/** Each drop stands for this much water (m³) */
const DROP_VOLUME = 5e-6;
const DROP_RADIUS = 0.0025;
/** Puddles dry with this e-folding time, s */
const DRY_TIME = 25;
// Expand the wet floor independently of the tank's drag limits
const FLOOR_W = TABLE.w * 2;
const FLOOR_D = TABLE.d * 2;
// Keep the same texel size and droplet footprint on the larger surface
const TEX_W = 256;
const TEX_H = 128;

const px = new Float32Array(POOL);
const py = new Float32Array(POOL);
const pz = new Float32Array(POOL);
const vx = new Float32Array(POOL);
const vy = new Float32Array(POOL);
const vz = new Float32Array(POOL);
const alive = new Uint8Array(POOL);
let next = 0;
let carry = 0;

const wet = new Float32Array(TEX_W * TEX_H);
let wetAny = false;

// Called from water.step inside the physics tick, with tank-local wall coordinates.
function emit(
  x: number,
  z: number,
  ox: number,
  oz: number,
  head: number,
  volume: number,
) {
  carry += volume;
  const { pos, vel } = tankState;
  // Water pours over the crest at about the critical speed sqrt(g·head)
  const speed = Math.sqrt(water.g * head);
  const spread = ox !== 0 ? water.dz : water.dx;
  while (carry >= DROP_VOLUME) {
    carry -= DROP_VOLUME;
    const i = next;
    next = (next + 1) % POOL;
    const along = (Math.random() - 0.5) * spread;
    const out = speed * (0.6 + 0.6 * Math.random());
    px[i] = pos.x + x + ox * (TANK.glass + 0.003) + (ox === 0 ? along : 0);
    pz[i] = pos.z + z + oz * (TANK.glass + 0.003) + (oz === 0 ? along : 0);
    py[i] = TANK.h + 0.002 + Math.random() * head;
    vx[i] = vel.x + ox * out + (Math.random() - 0.5) * 0.05;
    vz[i] = vel.z + oz * out + (Math.random() - 0.5) * 0.05;
    vy[i] = Math.random() * 0.1;
    alive[i] = 1;
  }
}

function wetAt(x: number, z: number) {
  // Puddle plane uv
  const cx = Math.floor(((x + FLOOR_W / 2) / FLOOR_W) * TEX_W);
  const cy = Math.floor(((FLOOR_D / 2 - z) / FLOOR_D) * TEX_H);
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const tx = cx + i;
      const ty = cy + j;
      if (tx < 0 || ty < 0 || tx >= TEX_W || ty >= TEX_H) continue;
      const k = tx + ty * TEX_W;
      wet[k] = Math.min(1, wet[k] + (i === 0 && j === 0 ? 0.12 : 0.04));
    }
  wetAny = true;
}

export function clearSpill() {
  alive.fill(0);
  wet.fill(0);
  carry = 0;
  // One more texture pass writes the cleared wetness
  wetAny = true;
}

const dummy = new Object3D();
const up = new Vector3(0, 1, 0);
const dir = new Vector3();

export default function Spill() {
  const drops = useRef<InstancedMesh>(null);
  const texture = useMemo(() => {
    const t = new DataTexture(new Uint8Array(TEX_W * TEX_H * 4), TEX_W, TEX_H);
    t.magFilter = t.minFilter = LinearFilter;
    t.needsUpdate = true;
    return t;
  }, []);
  const plane = useMemo(
    () => new PlaneGeometry(FLOOR_W, FLOOR_D).rotateX(-Math.PI / 2),
    [],
  );

  useEffect(() => {
    water.onSpill = emit;
    return () => {
      water.onSpill = undefined;
    };
  }, []);

  useFrame((_, delta) => {
    const mesh = drops.current;
    if (!mesh) return;
    const dt = Math.min(delta, 1 / 30);
    const { pos, vel } = tankState;
    let n = 0;
    for (let i = 0; i < POOL; i++) {
      if (!alive[i]) continue;
      const wasAbove = py[i] >= TANK.h;
      vy[i] -= water.g * dt;
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      pz[i] += vz[i] * dt;

      // Tank exterior
      const lx = px[i] - pos.x;
      const lz = pz[i] - pos.z;
      const inX = TANK.w / 2 - Math.abs(lx);
      const inZ = TANK.d / 2 - Math.abs(lz);
      if (py[i] < TANK.h && inX > 0 && inZ > 0) {
        if (wasAbove) {
          alive[i] = 0;
          continue;
        }
        if (inX < inZ) {
          px[i] = pos.x + (Math.sign(lx) * TANK.w) / 2;
          vx[i] = vel.x;
        } else {
          pz[i] = pos.z + (Math.sign(lz) * TANK.d) / 2;
          vz[i] = vel.z;
        }
      }

      if (
        py[i] <= 0 &&
        Math.abs(px[i]) < FLOOR_W / 2 &&
        Math.abs(pz[i]) < FLOOR_D / 2
      ) {
        alive[i] = 0;
        wetAt(px[i], pz[i]);
        continue;
      }
      if (py[i] < -2) {
        alive[i] = 0;
        continue;
      }

      const speed = Math.hypot(vx[i], vy[i], vz[i]);
      dummy.position.set(px[i], py[i], pz[i]);
      dummy.quaternion.setFromUnitVectors(
        up,
        dir.set(vx[i], vy[i], vz[i]).divideScalar(speed || 1),
      );
      dummy.scale.set(
        DROP_RADIUS,
        DROP_RADIUS + Math.min(0.03, speed * 0.012),
        DROP_RADIUS,
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(n++, dummy.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;

    if (wetAny) {
      const keep = Math.exp(-dt / DRY_TIME);
      const data = texture.image.data as Uint8Array;
      wetAny = false;
      for (let k = 0; k < wet.length; k++) {
        wet[k] *= keep;
        if (wet[k] < 0.004) wet[k] = 0;
        else wetAny = true;
        // alphaMap reads the green channel
        const x = k % TEX_W;
        const y = Math.floor(k / TEX_W);
        // Fade to transparent before the mesh ends, including after a strong throw
        const edge = Math.min(
          1,
          x / 8,
          (TEX_W - 1 - x) / 8,
          y / 8,
          (TEX_H - 1 - y) / 8,
        );
        data[4 * k + 1] = wet[k] * edge * 255;
      }
      texture.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh
        ref={drops}
        args={[undefined, undefined, POOL]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial
          color="#cfe8f2"
          transparent
          opacity={0.6}
          roughness={0.05}
          depthWrite={false}
        />
      </instancedMesh>
      {/* Wet floor is darker and glossy where drops landed */}
      <mesh geometry={plane} position={[0, 0.0005, 0]} receiveShadow>
        <meshStandardMaterial
          color="#52736a"
          roughness={0.12}
          alphaMap={texture}
          transparent
          opacity={0.35}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
    </>
  );
}
