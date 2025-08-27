import { useControls } from "leva";
import { useMemo } from "react";
import { CanvasTexture, Object3D, SRGBColorSpace } from "three";
import { TANK } from "./tankState.ts";
import { usePbr } from "./textures.ts";

// Soft overhead illumination, back wall foil and substrate
const { w, h, d, glass } = TANK;

function backdropTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "#95bdb4");
  gradient.addColorStop(0.55, "#497e79");
  gradient.addColorStop(1, "#1e4647");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export default function Ambience() {
  const tune = useControls("Optics", {
    light: { value: 3, min: 0, max: 10, hint: "top light intensity" },
  });
  const backdrop = useMemo(backdropTexture, []);
  // Sand under the pebbles, one tile per 20 cm
  const sand = usePbr("sand", (w - 2 * glass) / 0.2, (d - 2 * glass) / 0.2);
  const target = useMemo(() => new Object3D(), []);
  return (
    <>
      {/* Broad overhead light keeps the open tank evenly illuminated. */}
      <primitive object={target} position={[0, 0, 0]} />
      <spotLight
        position={[0, h + 0.35, 0.02]}
        target={target}
        angle={0.72}
        penumbra={0.5}
        decay={0}
        intensity={tune.light}
        color="#eaf6ff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.01}
        shadow-camera-near={0.1}
        shadow-camera-far={1.5}
      />
      {/* Back wall foil, just behind the rear glass */}
      <mesh position={[0, glass + (h - glass) / 2, -d / 2 - 0.001]}>
        <planeGeometry args={[w - 2 * glass, h - glass]} />
        <meshStandardMaterial
          color="#000000"
          emissive="#ffffff"
          emissiveMap={backdrop}
          emissiveIntensity={0.8}
          roughness={1}
        />
      </mesh>

      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, glass + 0.0005, 0]}
        receiveShadow
      >
        <planeGeometry args={[w - 2 * glass, d - 2 * glass]} />
        <meshStandardMaterial {...sand} roughness={1} />
      </mesh>
    </>
  );
}
