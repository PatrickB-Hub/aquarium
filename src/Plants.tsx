import { useFrame } from "@react-three/fiber";
import { useControls } from "leva";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  type InstancedMesh,
} from "three";
import { TANK, tankState, water } from "./tankState.ts";

type Kind = "grass" | "sword";

// Tank-local base positions, mostly along the back like a typical aquascape
const PLANTS: { x: number; z: number; kind: Kind }[] = [
  { x: -0.34, z: -0.14, kind: "grass" },
  { x: -0.2, z: -0.16, kind: "sword" },
  { x: -0.02, z: -0.15, kind: "grass" },
  { x: 0.17, z: -0.16, kind: "grass" },
  { x: 0.34, z: -0.13, kind: "sword" },
  { x: -0.35, z: 0.1, kind: "sword" },
  { x: 0.36, z: 0.12, kind: "grass" },
];
const BASE_Y = TANK.glass + 0.008;
const ZETA = 0.35;

type Blade = {
  plant: number;
  matrix: Matrix4;
  color: Color;
  phase: number;
  height: number;
};

function buildBlades(): Blade[] {
  const dummy = new Object3D();
  dummy.rotation.order = "YZX";
  const blades: Blade[] = [];
  PLANTS.forEach(({ x, z, kind }, plant) => {
    const grass = kind === "grass";
    const n = grass ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const height = grass
        ? 0.2 + Math.random() * 0.1
        : 0.12 + Math.random() * 0.07;
      dummy.position.set(
        x + (Math.random() - 0.5) * 0.02,
        BASE_Y,
        z + (Math.random() - 0.5) * 0.02,
      );
      dummy.rotation.set(
        0,
        (i / n) * Math.PI * 2 + Math.random() * 0.6,
        -(grass ? 0.05 + Math.random() * 0.2 : 0.35 + Math.random() * 0.35),
      );
      dummy.scale.set(
        grass ? 0.008 + Math.random() * 0.004 : 0.03 + Math.random() * 0.012,
        height,
        height,
      );
      dummy.updateMatrix();
      const color = new Color().setHSL(
        0.27 + Math.random() * 0.07,
        0.55,
        grass ? 0.3 + Math.random() * 0.1 : 0.26 + Math.random() * 0.08,
      );
      blades.push({
        plant,
        matrix: dummy.matrix.clone(),
        color,
        phase: Math.random() * Math.PI * 2,
        height,
      });
    }
  });
  return blades;
}

function bladeGeometry() {
  const g = new PlaneGeometry(1, 1, 1, 8).translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) * Math.pow(Math.sin(Math.PI * (0.1 + 0.9 * y)), 0.7));
    p.setZ(i, 0.15 * y * y);
  }
  g.computeVertexNormals();
  return g;
}

const uniforms = {
  uTime: { value: 0 },
  uSway: { value: 0 },
  uHalf: { value: [water.lx / 2 - 0.003, water.lz / 2 - 0.003] },
};
const material = new MeshStandardMaterial({
  side: DoubleSide,
  roughness: 0.65,
});
material.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>
      uniform float uTime;
      uniform float uSway;
      uniform vec2 uHalf;
      attribute vec2 aBend;
      attribute float aPhase;`,
    )
    .replace(
      "#include <project_vertex>",
      `vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
      // Bend in tank space
      float t = clamp(position.y, 0.0, 1.0);
      vec2 bend = aBend + uSway * vec2(sin(uTime * 1.3 + aPhase), cos(uTime * 0.9 + aPhase * 1.7));
      mvPosition.xz += bend * t * t;
      // Drop the tip so the blade doesn't visibly stretch
      mvPosition.y -= dot(bend, bend) * t * t * t / (2.0 * length(instanceMatrix[1].xyz));
      // Leaves press against the glass instead of passing through it
      mvPosition.xz = clamp(mvPosition.xz, -uHalf, uHalf);
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`,
    );
};

export default function Plants() {
  const mesh = useRef<InstancedMesh>(null);
  const tune = useControls("Plants", {
    flowGain: {
      value: 0.25,
      min: 0,
      max: 1,
      hint: "tip offset (m) per m/s of water flow",
    },
    accGainMm: {
      value: 4,
      min: 0,
      max: 20,
      step: 0.5,
      hint: "lean in mm per m/s² — plants are lighter than water, so they lean with the acceleration",
    },
    frequency: { value: 1.2, min: 0.3, max: 4, hint: "Hz" },
    swayMm: { value: 6, min: 0, max: 30 },
  });

  const geometry = useMemo(bladeGeometry, []);
  const blades = useMemo(buildBlades, []);
  const springs = useMemo(
    () => PLANTS.map(() => ({ bx: 0, bz: 0, vx: 0, vz: 0 })),
    [],
  );
  const bend = useMemo(
    () => new InstancedBufferAttribute(new Float32Array(blades.length * 2), 2),
    [blades],
  );

  useLayoutEffect(() => {
    const m = mesh.current!;
    blades.forEach((b, i) => {
      m.setMatrixAt(i, b.matrix);
      m.setColorAt(i, b.color);
    });
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor!.needsUpdate = true;
    geometry.setAttribute("aBend", bend);
    geometry.setAttribute(
      "aPhase",
      new InstancedBufferAttribute(
        Float32Array.from(blades, (b) => b.phase),
        1,
      ),
    );
  }, [blades, geometry, bend]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    uniforms.uTime.value += dt;
    uniforms.uSway.value = tune.swayMm / 1000;
    const w = 2 * Math.PI * tune.frequency;
    const { acc } = tankState;

    PLANTS.forEach(({ x, z }, i) => {
      const s = springs[i];
      const [u, v] = water.velocityAt(x, z);
      const tx = tune.flowGain * u + (tune.accGainMm / 1000) * acc.x;
      const tz = tune.flowGain * v + (tune.accGainMm / 1000) * acc.z;
      s.vx += (w * w * (tx - s.bx) - 2 * ZETA * w * s.vx) * dt;
      s.vz += (w * w * (tz - s.bz) - 2 * ZETA * w * s.vz) * dt;
      s.bx += s.vx * dt;
      s.bz += s.vz * dt;
    });

    blades.forEach((b, i) => {
      const { bx, bz } = springs[b.plant];
      // Cap the tip offset at 70 % of the blade length
      const scale = Math.min(1, (0.7 * b.height) / (Math.hypot(bx, bz) || 1));
      bend.setXY(i, bx * scale, bz * scale);
    });
    bend.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, blades.length]}
      receiveShadow
      frustumCulled={false}
    />
  );
}
