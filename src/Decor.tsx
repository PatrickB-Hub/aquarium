import {
  RigidBody,
  useBeforePhysicsStep,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Quaternion, Vector3 } from "three";
import { waterBodies } from "./buoyancy.ts";
import { pebbleGeometry } from "./Pebbles.tsx";
import { surfaceY, tankState, water } from "./tankState.ts";
import { usePbr } from "./textures.ts";

type Vec3 = [number, number, number];

/** Righting spring toward the local water normal: 1/s² and 1/s (≈1.4 Hz rocking) */
const UPRIGHT_STIFFNESS = 80;
const UPRIGHT_DAMPING = 6;
const hullRotation = new Quaternion();
const hullUp = new Vector3();
const surfaceNormal = new Vector3();
const rightingAxis = new Vector3();

// Densities in kg/m³ (water = 1000)
export const obstacles = new Map<RapierRigidBody, number>();

type PieceProps = {
  at: Vec3;
  rotation?: Vec3;
  density: number;
  avoid: number;
  upright?: boolean;
  children: ReactNode;
};

function Piece({
  at,
  rotation = [0, 0, 0],
  density,
  avoid,
  upright = false,
  children,
}: PieceProps) {
  const body = useRef<RapierRigidBody>(null);
  useEffect(() => {
    const b = body.current!;
    waterBodies.set(b, density);
    obstacles.set(b, avoid);
    return () => {
      waterBodies.delete(b);
      obstacles.delete(b);
    };
  }, [density, avoid]);

  // Buoyancy acts at the center of mass, so nothing rights a floating hull by itself
  useBeforePhysicsStep((world) => {
    const b = body.current;
    if (!upright || !b) return;
    const t = b.translation();
    const lx = t.x - tankState.pos.x;
    const lz = t.z - tankState.pos.z;
    if (t.y - surfaceY(lx, lz) > 0.05) return;
    const e = 0.01;
    surfaceNormal
      .set(
        water.heightAt(lx - e, lz) - water.heightAt(lx + e, lz),
        2 * e,
        water.heightAt(lx, lz - e) - water.heightAt(lx, lz + e),
      )
      .normalize();
    hullUp.set(0, 1, 0).applyQuaternion(hullRotation.copy(b.rotation()));
    rightingAxis.crossVectors(hullUp, surfaceNormal);
    const w = b.angvel();
    const dt = world.timestep;
    const keep = 1 - UPRIGHT_DAMPING * dt;
    b.setAngvel(
      {
        x: (w.x + UPRIGHT_STIFFNESS * rightingAxis.x * dt) * keep,
        y: w.y,
        z: (w.z + UPRIGHT_STIFFNESS * rightingAxis.z * dt) * keep,
      },
      true,
    );
  });

  return (
    <RigidBody
      ref={body}
      // Floaters must stay awake, or they'd ignore the sloshing once they come to rest
      canSleep={density >= 1000}
      // Rotational water drag, left to Rapier
      angularDamping={1}
      colliders="hull"
      position={[tankState.pos.x + at[0], at[1], tankState.pos.z + at[2]]}
      rotation={rotation}
      density={density}
      friction={0.7}
      restitution={0.1}
    >
      {children}
    </RigidBody>
  );
}

function Chest({ at }: { at: Vec3 }) {
  // Planks ~1.5 cm wide on a 10 cm toy chest
  const wood = usePbr("chest", 0.5);
  return (
    <Piece at={at} rotation={[0, 0.4, 0]} density={1400} avoid={0.07}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.1, 0.055, 0.07]} />
        <meshStandardMaterial {...wood} roughness={1} />
      </mesh>
      <mesh castShadow position={[0, 0.0275, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry
          args={[0.035, 0.035, 0.1, 16, 1, false, 0, Math.PI]}
        />
        <meshStandardMaterial {...wood} color="#d8c8b8" roughness={1} />
      </mesh>
      <mesh position={[0, 0, 0.0355]}>
        <boxGeometry args={[0.014, 0.02, 0.002]} />
        <meshStandardMaterial color="#d4a73c" metalness={0.9} roughness={0.3} />
      </mesh>
    </Piece>
  );
}

// s scales the whole piece
function Driftwood({
  at,
  yaw = -0.3,
  s = 1,
}: {
  at: Vec3;
  yaw?: number;
  s?: number;
}) {
  // Cylinder uv: u around, v along the branch
  const bark = usePbr("driftwood", 1, 2);
  return (
    <Piece at={at} rotation={[0, yaw, 0]} density={1100} avoid={0.07 * s}>
      <mesh castShadow rotation={[0, 0, Math.PI / 2 - 0.15]}>
        <cylinderGeometry args={[0.012 * s, 0.018 * s, 0.28 * s, 8]} />
        <meshStandardMaterial {...bark} roughness={1} />
      </mesh>
      <mesh
        castShadow
        position={[0.05 * s, 0.04 * s, 0.01 * s]}
        rotation={[0.3, 0, -0.7]}
      >
        <cylinderGeometry args={[0.006 * s, 0.01 * s, 0.12 * s, 6]} />
        <meshStandardMaterial {...bark} roughness={1} />
      </mesh>
      <mesh
        castShadow
        position={[-0.07 * s, 0.03 * s, -0.015 * s]}
        rotation={[-0.4, 0, 0.9]}
      >
        <cylinderGeometry args={[0.005 * s, 0.009 * s, 0.1 * s, 6]} />
        <meshStandardMaterial {...bark} roughness={1} />
      </mesh>
    </Piece>
  );
}

function Diver({ at }: { at: Vec3 }) {
  return (
    <Piece at={at} rotation={[0, -0.6, 0]} density={1800} avoid={0.05}>
      <mesh castShadow>
        <capsuleGeometry args={[0.016, 0.045, 4, 12]} />
        <meshStandardMaterial color="#c8c0a8" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, 0.045, 0]}>
        <sphereGeometry args={[0.02, 16, 12]} />
        <meshStandardMaterial
          color="#b8893a"
          metalness={0.8}
          roughness={0.35}
        />
      </mesh>
      <mesh castShadow position={[0, 0.01, -0.018]}>
        <boxGeometry args={[0.022, 0.04, 0.012]} />
        <meshStandardMaterial color="#8c8c8c" metalness={0.6} roughness={0.4} />
      </mesh>
    </Piece>
  );
}

function Stone({ at, size, seed }: { at: Vec3; size: Vec3; seed: number }) {
  const geometry = useMemo(() => pebbleGeometry(size, seed), [size, seed]);
  // uvs are in meters, one tile per 15 cm
  const rock = usePbr("stones", 1 / 0.15);
  return (
    <Piece
      at={at}
      rotation={[0, seed, 0]}
      density={2500}
      avoid={size[0] + 0.01}
    >
      <mesh castShadow receiveShadow geometry={geometry}>
        <meshStandardMaterial {...rock} roughness={1} />
      </mesh>
    </Piece>
  );
}

function Shell({ at, seed }: { at: Vec3; seed: number }) {
  return (
    <Piece at={at} rotation={[0, seed, 0]} density={2000} avoid={0.02}>
      <mesh castShadow scale={[1, 0.35, 1.1]}>
        <sphereGeometry args={[0.017, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#eadbc4" roughness={0.6} side={2} />
      </mesh>
    </Piece>
  );
}

function Boat({ at }: { at: Vec3 }) {
  return (
    <Piece at={at} rotation={[0, 0.8, 0]} density={430} avoid={0.05} upright>
      <mesh castShadow>
        <boxGeometry args={[0.06, 0.018, 0.03]} />
        <meshStandardMaterial color="#c0392b" roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0.03, 0, 0]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[0.0212, 0.018, 0.0212]} />
        <meshStandardMaterial color="#c0392b" roughness={0.6} />
      </mesh>
      <mesh castShadow position={[-0.012, 0.016, 0]}>
        <boxGeometry args={[0.022, 0.014, 0.02]} />
        <meshStandardMaterial color="#f2efe6" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0.012, 0.035, 0]}>
        <cylinderGeometry args={[0.0015, 0.0015, 0.05, 6]} />
        <meshStandardMaterial color="#6b4a2b" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0.002, 0.036, 0]}>
        <boxGeometry args={[0.018, 0.036, 0.0015]} />
        <meshStandardMaterial color="#fafafa" roughness={0.9} />
      </mesh>
    </Piece>
  );
}

export default function Decor() {
  return (
    <>
      <Chest at={[-0.24, 0.14, -0.07]} />
      <Driftwood at={[0.1, 0.2, -0.09]} />
      <Driftwood at={[-0.08, 0.24, 0.06]} yaw={0.9} s={0.55} />
      <Diver at={[0.27, 0.18, 0.08]} />
      <Stone at={[-0.05, 0.16, -0.1]} size={[0.05, 0.035, 0.04]} seed={1.3} />
      <Stone at={[0.3, 0.16, -0.1]} size={[0.035, 0.03, 0.03]} seed={4.1} />
      <Stone at={[0.12, 0.2, 0.1]} size={[0.048, 0.033, 0.04]} seed={2.7} />
      <Shell at={[-0.1, 0.12, 0.1]} seed={0.5} />
      <Shell at={[0.05, 0.12, 0.12]} seed={2.2} />
      <Shell at={[-0.3, 0.12, 0.11]} seed={3.9} />
      <Shell at={[0.18, 0.12, 0.02]} seed={5.4} />
      {/* Floaters */}
      <Piece at={[0.0, 0.25, 0.02]} density={250} avoid={0.025}>
        <mesh castShadow>
          <cylinderGeometry args={[0.015, 0.013, 0.03, 16]} />
          <meshStandardMaterial color="#c49a6c" roughness={0.9} />
        </mesh>
      </Piece>
      <Boat at={[-0.15, 0.4, 0.06]} />
    </>
  );
}
