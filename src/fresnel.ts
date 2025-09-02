import type { Material } from "three";

/** Transparent surfaces (glass, bubbles) reflect more and turn more opaque toward grazing angles */
export function fresnelOpacity<T extends Material>(
  material: T,
  edgeOpacity: number,
  power: number,
): T {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `#include <opaque_fragment>
      gl_FragColor.a = mix(gl_FragColor.a, ${edgeOpacity.toFixed(3)}, pow(1.0 - saturate(abs(dot(normal, geometryViewDir))), ${power.toFixed(2)}));`,
    );
  };
  material.customProgramCacheKey = () => `fresnel|${edgeOpacity}|${power}`;
  return material;
}
