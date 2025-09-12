import { useFrame } from "@react-three/fiber";
import { useControls } from "leva";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  Color,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector2,
  Vector3,
  type InstancedMesh,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { obstacles } from "../Decor.tsx";
import { surfaceY, TANK, tankState, water } from "../tankState.ts";
import { fishParams, spawnFish, stepFish, type Env } from "./boids.ts";
import { SPECIES } from "./species.ts";

type Look = {
  height: number;
  width: number;
  tail: number;
  bigFins?: boolean;
  tang?: boolean;
  color: (x: number, y: number) => string;
};
const LOOKS: Record<string, Look> = {
  neon: {
    height: 0.26,
    width: 0.14,
    tail: 0.14,
    color: (x, y) =>
      y > 0.01 && y < 0.06
        ? "#29d8ff"
        : y < -0.01 && x < 0.1
          ? "#e02a3c"
          : "#b9c6cf",
  },
  guppy: {
    height: 0.28,
    width: 0.15,
    tail: 0.3,
    color: (x) => (x < -0.3 ? "#ffffff" : "#a3adb3"),
  },
  // Palette surgeonfish
  tang: {
    height: 0.6,
    width: 0.12,
    tail: 0.25,
    bigFins: true,
    tang: true,
    color: () => "#ffffff",
  },
  corydoras: {
    height: 0.3,
    width: 0.22,
    tail: 0.18,
    color: (x, y) =>
      Math.sin(x * 60) * Math.sin(y * 70) > 0.5 ? "#4a3b2c" : "#b89f80",
  },
};
const GUPPY_COLORS = ["#ff9a4d", "#6cbcff", "#ff6680", "#ffe066"];

const fin = (points: [number, number][]) =>
  new ShapeGeometry(new Shape(points.map(([x, y]) => new Vector2(x, y))));

function fishGeometry(l: Look) {
  const h = l.height;
  const g = mergeGeometries([
    new SphereGeometry(0.5, 20, 14).scale(0.8, h, l.width).translate(0.1, 0, 0),
    fin([
      [-0.26, 0],
      [-0.5, l.tail],
      [-0.44, 0],
      [-0.5, -l.tail],
    ]),
    ...(l.bigFins
      ? [
          fin([
            [0.15, h * 0.45],
            [-0.3, h * 1.1],
            [-0.25, h * 0.3],
          ]),
          fin([
            [0.1, -h * 0.45],
            [-0.35, -h * 1.2],
            [-0.25, -h * 0.3],
          ]),
        ]
      : [
          fin([
            [0.05, h * 0.48],
            [-0.1, h * 0.8],
            [-0.2, h * 0.4],
          ]),
        ]),
  ]);
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const c = new Color();
  for (let i = 0; i < p.count; i++)
    c.set(l.color(p.getX(i), p.getY(i))).toArray(colors, i * 3);
  g.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return g;
}

// Palette surgeonfish in fish-local coordinates
const tangPattern = `
vec3 tangColor(vec3 p) {
  const vec3 blue = vec3(0.012, 0.1, 0.7);
  const vec3 black = vec3(0.004, 0.005, 0.012);
  const vec3 yellow = vec3(1.0, 0.62, 0.01);
  float aa = 0.006;
  if (abs(p.z) < 1e-4) {
    // Flat fins
    float tailEdge = 0.25 * (-0.26 - p.x) / 0.24;
    if (p.x < -0.26 && abs(p.y) < tailEdge + 0.005) {
      float margin = smoothstep(0.6 * tailEdge - aa, 0.6 * tailEdge + aa, abs(p.y));
      float base = 1.0 - smoothstep(-0.33 - aa, -0.33 + aa, p.x);
      return mix(yellow, black, max(margin, 1.0 - base));
    }
    vec2 a = p.y > 0.0 ? vec2(0.15, 0.27) : vec2(0.1, -0.27);
    vec2 b = p.y > 0.0 ? vec2(-0.3, 0.66) : vec2(-0.35, -0.72);
    vec2 n = normalize(vec2(b.y - a.y, a.x - b.x));
    float edge = abs(dot(p.xy - a, n));
    float rays = 0.75 + 0.25 * step(0.5, fract(p.x * 45.0));
    return mix(blue * rays, black, 1.0 - smoothstep(0.035 - aa, 0.035 + aa, edge));
  }
  vec3 c = blue * (1.0 + 0.4 * smoothstep(0.0, -0.25, p.y));
  // Yellow-green base of the pectoral fin
  float pec = length((p.xy - vec2(0.12, -0.07)) / vec2(0.05, 0.025));
  c = mix(c, vec3(0.35, 0.6, 0.05), 1.0 - smoothstep(1.0 - 0.2, 1.0 + 0.2, pec));
  float outer = length((p.xy - vec2(-0.05, 0.07)) / vec2(0.3, 0.16));
  float inner = length((p.xy - vec2(0.0, 0.04)) / vec2(0.15, 0.06));
  float band = (1.0 - smoothstep(1.0 - 0.03, 1.0 + 0.03, outer)) * smoothstep(1.0 - 0.06, 1.0 + 0.06, inner);
  // Stripe from the eye up into the band
  vec2 e0 = vec2(0.38, 0.04), e1 = vec2(0.22, 0.14);
  float s = clamp(dot(p.xy - e0, e1 - e0) / dot(e1 - e0, e1 - e0), 0.0, 1.0);
  band = max(band, 1.0 - smoothstep(0.035 - aa, 0.035 + aa, length(p.xy - mix(e0, e1, s))));
  float eye = 1.0 - smoothstep(0.028 - aa, 0.028 + aa, length(p.xy - vec2(0.38, 0.04)));
  return mix(c, black, max(band, eye));
}`;

function fishShader(shader: WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nattribute float aWag;\nvarying vec3 vFish;",
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
    vFish = position;
    // Tail beat
    float tailW = clamp((0.25 - position.x) / 0.8, 0.0, 1.0);
    transformed.z += 0.09 * tailW * tailW * sin(aWag - position.x * 6.0);`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>\nvarying vec3 vFish;\n#ifdef TANG\n${tangPattern}\n#endif`,
    )
    .replace(
      "#include <color_fragment>",
      "#include <color_fragment>\n#ifdef TANG\ndiffuseColor.rgb *= tangColor(vFish);\n#endif",
    );
}
const material = new MeshStandardMaterial({
  vertexColors: true,
  side: DoubleSide,
  roughness: 0.45,
});
material.onBeforeCompile = fishShader;
// Same shader source
const tangMaterial = new MeshStandardMaterial({
  vertexColors: true,
  side: DoubleSide,
  roughness: 0.35,
});
// @types/three only declares `defines` on ShaderMaterial; three reads it on every material
(tangMaterial as { defines?: Record<string, string> }).defines = { TANG: "" };
tangMaterial.onBeforeCompile = fishShader;

const env: Env = {
  hx: water.lx / 2,
  hz: water.lz / 2,
  floorY: TANK.glass + 0.03, // Top of the gravel
  surfaceY,
  flow: (x, z) => water.velocityAt(x, z),
  obstacles: [],
  acc: tankState.acc,
};

const matrix = new Matrix4();
const quaternion = new Quaternion();
const euler = new Euler(0, 0, 0, "YZX");
const position = new Vector3();
const scale = new Vector3();

export default function Fish() {
  const tune = useControls("Fish", {
    startleAcc: {
      value: fishParams.startleAcc,
      min: 0.5,
      max: 15,
      hint: "tank acceleration (m/s²) that startles the fish",
    },
    flowCarry: {
      value: fishParams.flowCarry,
      min: 0,
      max: 1,
      hint: "how much the sloshing water carries them",
    },
  });
  useEffect(() => {
    fishParams.startleAcc = tune.startleAcc;
    fishParams.flowCarry = tune.flowCarry;
  }, [tune.startleAcc, tune.flowCarry]);

  const fish = useMemo(() => spawnFish(SPECIES, env), []);
  const schools = useMemo(
    () =>
      SPECIES.map((s, k) => {
        const geometry = fishGeometry(LOOKS[s.name]);
        const wag = new InstancedBufferAttribute(
          Float32Array.from({ length: s.count }, () => Math.random() * 6),
          1,
        );
        geometry.setAttribute("aWag", wag);
        return {
          geometry,
          wag,
          members: fish.filter((f) => f.species === k),
          yaw: new Float32Array(s.count),
          pitch: new Float32Array(s.count),
        };
      }),
    [fish],
  );
  const meshes = useRef<(InstancedMesh | null)[]>([]);

  useLayoutEffect(() => {
    schools.forEach((_, k) => {
      const mesh = meshes.current[k]!;
      const tint = new Color();
      for (let i = 0; i < SPECIES[k].count; i++)
        mesh.setColorAt(
          i,
          SPECIES[k].name === "guppy"
            ? tint.set(GUPPY_COLORS[i % GUPPY_COLORS.length])
            : tint.set("#ffffff"),
        );
      mesh.instanceColor!.needsUpdate = true;
    });
  }, [schools]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    env.obstacles.length = 0;
    for (const [body, r] of obstacles) {
      const t = body.translation();
      env.obstacles.push({
        x: t.x - tankState.pos.x,
        y: t.y,
        z: t.z - tankState.pos.z,
        r,
      });
    }
    stepFish(fish, SPECIES, env, dt);

    schools.forEach((school, k) => {
      const mesh = meshes.current[k];
      if (!mesh) return;
      const { length } = SPECIES[k];
      school.members.forEach((f, i) => {
        const vh = Math.hypot(f.vx, f.vz);
        if (vh > 1e-4) {
          school.yaw[i] = Math.atan2(-f.vz, f.vx);
          school.pitch[i] = Math.atan2(f.vy, vh);
        }
        // Idle beat plus roughly one beat per body length travelled
        const beat = 1.5 + Math.hypot(f.vx, f.vy, f.vz) / length;
        school.wag.array[i] =
          (school.wag.array[i] + dt * 2 * Math.PI * beat) % (2 * Math.PI);
        euler.set(0, school.yaw[i], school.pitch[i]);
        matrix.compose(
          position.set(f.x, f.y, f.z),
          quaternion.setFromEuler(euler),
          scale.setScalar(length),
        );
        mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      school.wag.needsUpdate = true;
    });
  });

  return schools.map((school, k) => (
    <instancedMesh
      key={SPECIES[k].name}
      ref={(mesh) => {
        meshes.current[k] = mesh;
      }}
      args={[
        school.geometry,
        LOOKS[SPECIES[k].name].tang ? tangMaterial : material,
        SPECIES[k].count,
      ]}
      castShadow
      frustumCulled={false}
    />
  ));
}
