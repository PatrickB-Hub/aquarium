import { useTexture } from "@react-three/drei";
import { RepeatWrapping, SRGBColorSpace } from "three";

/**
 * Color/normal/roughness set from public/textures/<name>/, tiled `repeat` times over the geometry's uv range
 */
export function usePbr(name: string, repeatX: number, repeatY = repeatX) {
  const base = `${import.meta.env.BASE_URL}textures/${name}/`;
  const maps = useTexture({
    map: `${base}color.jpg`,
    normalMap: `${base}normal.jpg`,
    roughnessMap: `${base}roughness.jpg`,
  });
  if (maps.map.colorSpace !== SRGBColorSpace) {
    for (const t of [maps.map, maps.normalMap, maps.roughnessMap]) {
      t.wrapS = t.wrapT = RepeatWrapping;
      t.repeat.set(repeatX, repeatY);
      t.anisotropy = 8;
      t.needsUpdate = true;
    }
    maps.map.colorSpace = SRGBColorSpace;
  }
  return maps;
}
