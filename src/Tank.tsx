import { Edges } from "@react-three/drei";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import {
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  type RapierRigidBody,
} from "@react-three/rapier";
import { button, monitor, useControls } from "leva";
import { useEffect, useMemo, useRef } from "react";
import {
  MathUtils,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Plane,
  Vector3,
} from "three";
import Ambience from "./Ambience.tsx";
import { applyWaterForces } from "./buoyancy.ts";
import Bubbles from "./Bubbles.tsx";
import { fresnelOpacity } from "./fresnel.ts";
import { glassRoughness } from "./surfaceTextures.ts";
import Fish from "./fish/Fish.tsx";
import Plants from "./Plants.tsx";
import { TABLE, TANK, tankState, water } from "./tankState.ts";
import Water from "./water/Water.tsx";

const { w, h, d, glass } = TANK;
const WALL = 0.05;
const MAX_X = TABLE.w / 2 - w / 2 - 0.05;
const MAX_Z = TABLE.d / 2 - d / 2 - 0.05;

const glassMaterial = fresnelOpacity(
  new MeshPhysicalMaterial({
    color: "#d6eeec",
    transparent: true,
    opacity: 0.12,
    roughness: 0.085,
    roughnessMap: glassRoughness(),
    depthWrite: false,
  }),
  0.25,
  5,
);
// Float glass looks green through its 6 mm edge
const edgeMaterial = new MeshStandardMaterial({
  color: "#5e9c8a",
  transparent: true,
  opacity: 0.7,
  roughness: 0.1,
  depthWrite: false,
});

const dragPlane = new Plane(new Vector3(0, 1, 0), 0);
const hit = new Vector3();
const grabOffset = new Vector3();
const prevVel = new Vector3();
let shakeTime = 0;
let shakeStrength = 0.3;
export function shakeTank(strong: boolean) {
  shakeStrength = strong ? 0.3 : 0.045;
  shakeTime = strong ? 4 : 0.7;
}

function GlassPane({
  size,
  position,
}: {
  size: [number, number, number];
  position: [number, number, number];
}) {
  const materials = useMemo(() => {
    const thin = size.indexOf(Math.min(...size));
    return [0, 1, 2, 3, 4, 5].map((face) =>
      Math.floor(face / 2) === thin ? glassMaterial : edgeMaterial,
    );
  }, [size]);
  return (
    <mesh position={position} material={materials}>
      <boxGeometry args={size} />
      <Edges color="#8cc2b0" />
    </mesh>
  );
}

export default function Tank({ damping }: { damping: number }) {
  const body = useRef<RapierRigidBody>(null);
  const dragging = useRef(false);
  const controls = useThree((s) => s.controls) as unknown as {
    enabled: boolean;
  } | null;
  // A scene reset remounts the tank
  useEffect(() => {
    shakeTime = 0;
  }, []);

  const tune = useControls("Tank", {
    stiffness: { value: 120, min: 10, max: 600 },
    damping: { value: 20, min: 1, max: 60 },
    maxSpeed: { value: 1.5, min: 0.2, max: 4 },
    maxAccel: { value: 15, min: 2, max: 60 },
    accSmoothing: { value: 0.3, min: 0, max: 0.95 },
    "speed m/s": monitor(() => tankState.vel.length(), { graph: true }),
    "acc m/s²": monitor(() => tankState.acc.length(), { graph: true }),
    "shake test": button(() => shakeTank(true)),
  });

  useBeforePhysicsStep((world) => {
    const dt = world.timestep;
    const { pos, vel, acc, target } = tankState;
    prevVel.copy(vel);

    if (shakeTime > 0) {
      shakeTime -= dt;
      target.set(
        shakeTime > 0
          ? shakeStrength * Math.sign(Math.sin(2 * Math.PI * 3 * shakeTime))
          : 0,
        0,
        0,
      );
    }

    let ax = tune.stiffness * (target.x - pos.x) - tune.damping * vel.x;
    let az = tune.stiffness * (target.z - pos.z) - tune.damping * vel.z;
    const a = Math.hypot(ax, az);
    if (a > tune.maxAccel) {
      ax *= tune.maxAccel / a;
      az *= tune.maxAccel / a;
    }
    vel.x += ax * dt;
    vel.z += az * dt;
    if (vel.length() > tune.maxSpeed) vel.setLength(tune.maxSpeed);
    pos.addScaledVector(vel, dt);

    const s = tune.accSmoothing;
    acc.x = s * acc.x + (1 - s) * ((vel.x - prevVel.x) / dt);
    acc.z = s * acc.z + (1 - s) * ((vel.z - prevVel.z) / dt);

    body.current?.setNextKinematicTranslation(pos);
    water.step(dt, acc.x, acc.z);
    applyWaterForces(dt);
  });

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    if (controls) controls.enabled = false;
    dragPlane.constant = -e.point.y;
    grabOffset.copy(tankState.pos).sub(e.point);
    dragging.current = true;
    document.body.style.cursor = "grabbing";
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current || !e.ray.intersectPlane(dragPlane, hit)) return;
    tankState.target.set(
      MathUtils.clamp(hit.x + grabOffset.x, -MAX_X, MAX_X),
      0,
      MathUtils.clamp(hit.z + grabOffset.z, -MAX_Z, MAX_Z),
    );
  };

  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    dragging.current = false;
    (e.target as Element).releasePointerCapture(e.pointerId);
    if (controls) controls.enabled = true;
    document.body.style.cursor = "grab";
  };

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false}>
      <CuboidCollider
        args={[w / 2 + WALL, WALL / 2, d / 2 + WALL]}
        position={[0, glass - WALL / 2, 0]}
      />
      <CuboidCollider
        args={[WALL / 2, h / 2, d / 2 + WALL]}
        position={[-(w / 2 - glass + WALL / 2), h / 2, 0]}
      />
      <CuboidCollider
        args={[WALL / 2, h / 2, d / 2 + WALL]}
        position={[w / 2 - glass + WALL / 2, h / 2, 0]}
      />
      <CuboidCollider
        args={[w / 2 + WALL, h / 2, WALL / 2]}
        position={[0, h / 2, -(d / 2 - glass + WALL / 2)]}
      />
      <CuboidCollider
        args={[w / 2 + WALL, h / 2, WALL / 2]}
        position={[0, h / 2, d / 2 - glass + WALL / 2]}
      />
      <Plants />
      <Fish />
      <Bubbles />
      <Ambience />

      <group
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onLostPointerCapture={endDrag}
        onPointerOver={() => {
          document.body.style.cursor = "grab";
        }}
        onPointerOut={() => {
          if (!dragging.current) document.body.style.cursor = "";
        }}
      >
        <GlassPane size={[w, glass, d]} position={[0, glass / 2, 0]} />
        <GlassPane
          size={[glass, h, d]}
          position={[-(w / 2 - glass / 2), h / 2, 0]}
        />
        <GlassPane
          size={[glass, h, d]}
          position={[w / 2 - glass / 2, h / 2, 0]}
        />
        <GlassPane
          size={[w - 2 * glass, h, glass]}
          position={[0, h / 2, -(d / 2 - glass / 2)]}
        />
        <GlassPane
          size={[w - 2 * glass, h, glass]}
          position={[0, h / 2, d / 2 - glass / 2]}
        />
        <Water damping={damping} />
      </group>
    </RigidBody>
  );
}
