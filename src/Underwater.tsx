import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "leva";
import { Color, MeshStandardMaterial, Vector3, type Mesh } from "three";
import { TANK, tankState, water } from "./tankState.ts";

const uniforms = {
  uwTime: { value: 0 },
  uwTank: { value: new Vector3() },
  uwHalf: { value: [TANK.w / 2 - TANK.glass, TANK.d / 2 - TANK.glass] },
  uwSurface: { value: TANK.glass + TANK.water },
  uwCaustics: { value: 1.3 },
  uwFloor: { value: TANK.glass },
  uwAbsorb: { value: 0.8 },
  uwHaze: { value: 0.48 },
  uwFog: { value: new Color("#4a8f88") },
};

const vertexHead = `#include <common>
varying vec3 vUwWorld;`;

const vertexWorld = `#include <worldpos_vertex>
vec4 uwPos = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  uwPos = instanceMatrix * uwPos;
#endif
vUwWorld = (modelMatrix * uwPos).xyz;`;

const fragmentHead = `#include <common>
varying vec3 vUwWorld;
uniform float uwTime;
uniform vec3 uwTank;
uniform vec2 uwHalf;
uniform float uwSurface;
uniform float uwCaustics;
uniform float uwFloor;
uniform float uwAbsorb;
uniform float uwHaze;
uniform vec3 uwFog;

vec2 uwHash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// Animated cellular noise
float uwCell(vec2 p, float t) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 h = uwHash(cell + o);
      vec2 r = o + 0.5 + 0.4 * sin(t * (0.5 + h) + 6.2831 * h) - f;
      float d = length(r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  return 1.0 - smoothstep(0.0, 0.15, d2 - d1);
}`;

// Runs after lighting, in tank-local coordinates (so everything moves with the tank)
const fragmentLight = `vec3 uwLocal = vUwWorld - uwTank;
float uwDepth = uwSurface - uwLocal.y;
// Caustics only on surfaces inside the water
if (uwDepth > 0.0 && uwLocal.y > 0.001 && abs(uwLocal.x) < uwHalf.x && abs(uwLocal.z) < uwHalf.y) {
  vec2 uwP = uwLocal.xz * 22.0;
  float caustic = uwCell(uwP, uwTime) * 0.65 + uwCell(uwP * 1.6 + 7.0, uwTime * 1.3) * 0.35;
  float up = 0.35 + 0.65 * max(inverseTransformDirection(normal, viewMatrix).y, 0.0);
  outgoingLight += diffuseColor.rgb * uwCaustics * caustic * up * exp(-uwDepth * 2.5);
}
// Light on its way to the camera through the water box (floor to rest surface)
// Applies to anything seen through the water, also the table and wall behind the tank
vec3 uwRay = cameraPosition - uwTank - uwLocal;
float uwLength = length(uwRay);
vec3 uwDir = uwRay / uwLength;
vec3 uwInv = (vec3(greaterThanEqual(uwDir, vec3(0.0))) * 2.0 - 1.0) / max(abs(uwDir), vec3(1e-6));
vec3 uwT0 = (vec3(-uwHalf.x, uwFloor, -uwHalf.y) - uwLocal) * uwInv;
vec3 uwT1 = (vec3(uwHalf.x, uwSurface, uwHalf.y) - uwLocal) * uwInv;
vec3 uwNear = min(uwT0, uwT1);
vec3 uwFar = max(uwT0, uwT1);
float uwEntry = max(max(uwNear.x, uwNear.y), max(uwNear.z, 0.0));
float uwPath = max(min(min(uwFar.x, uwFar.y), min(uwFar.z, uwLength)) - uwEntry, 0.0);
if (uwPath > 0.0) {
  outgoingLight *= exp(-uwPath * uwAbsorb * vec3(1.0, 0.42, 0.3));
  // Average depth along the submerged ray
  float uwMidY = uwLocal.y + uwDir.y * (uwEntry + 0.5 * uwPath);
  float uwDepthFraction = clamp((uwSurface - uwMidY) / max(uwSurface - uwFloor, 0.01), 0.0, 1.0);
  vec3 uwScatter = uwFog * mix(1.08, 0.72, uwDepthFraction);
  outgoingLight = mix(outgoingLight, uwScatter, 1.0 - exp(-uwPath * uwHaze * (0.65 + 0.7 * uwDepthFraction)));
}
#include <opaque_fragment>`;

function patch(material: MeshStandardMaterial) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", vertexHead)
      .replace("#include <worldpos_vertex>", vertexWorld);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", fragmentHead)
      .replace("#include <opaque_fragment>", fragmentLight);
  };
  material.customProgramCacheKey = () => `${previousKey}|underwater`;
  material.userData.underwater = true;
  material.needsUpdate = true;
}

export default function Underwater() {
  const scene = useThree((s) => s.scene);
  const tune = useControls("Optics", {
    caustics: { value: 1.3, min: 0, max: 3 },
    absorption: {
      value: 0.8,
      min: 0,
      max: 5,
      hint: "per meter of water the light travels to the camera; red most",
    },
    haze: {
      value: 0.48,
      min: 0,
      max: 6,
      hint: "per meter, fades toward the water color",
    },
    waterColor: "#4a8f88",
  });

  useFrame((_, delta) => {
    uniforms.uwTime.value += Math.min(delta, 0.1);
    uniforms.uwTank.value.copy(tankState.pos);
    uniforms.uwSurface.value = TANK.glass + water.level;
    uniforms.uwCaustics.value = tune.caustics;
    uniforms.uwAbsorb.value = tune.absorption;
    uniforms.uwHaze.value = tune.haze;
    uniforms.uwFog.value.set(tune.waterColor);
    scene.traverse((o) => {
      const m = (o as Mesh).material;
      if (
        m instanceof MeshStandardMaterial &&
        !m.transparent &&
        !m.userData.underwater
      )
        patch(m);
    });
  });

  return null;
}
