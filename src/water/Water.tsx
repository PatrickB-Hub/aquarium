import { useFrame } from "@react-three/fiber";
import { monitor, useControls } from "leva";
import { useEffect, useMemo } from "react";
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  MeshPhysicalMaterial,
  PlaneGeometry,
  Vector2,
} from "three";
import { waterNormals } from "../surfaceTextures.ts";
import { drag, waterBodies } from "../buoyancy.ts";
import { surfaceY, TANK, water, waveDepth } from "../tankState.ts";

// Level the wave depth was last calibrated for
let calibrated = water.level;

const waterMaterial = new MeshPhysicalMaterial({
  color: "#2d7fa6",
  transparent: true,
  // The volume's tint comes from the underwater shader
  opacity: 0.1,
  roughness: 0.08,
  ior: 1.33,
  side: DoubleSide,
  depthWrite: false,
});

// Four vertical strips along the glass
function sidesGeometry(meniscus = false) {
  const hx = water.lx / 2;
  const hz = water.lz / 2;
  const edges: [number, number, number, number, number][] = [
    [-hx, hz, hx, hz, water.nx],
    [hx, hz, hx, -hz, water.nz],
    [hx, -hz, -hx, -hz, water.nx],
    [-hx, -hz, -hx, hz, water.nz],
  ];
  const position: number[] = [];
  const index: number[] = [];
  for (const [x0, z0, x1, z1, n] of edges) {
    const base = position.length / 3;
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n;
      const z = z0 + ((z1 - z0) * k) / n;
      if (meniscus) {
        // 2.5 mm curved-up contact band, inset from the glass to avoid z-fighting
        position.push(
          x * (1 - 0.0003 / hx),
          0,
          z * (1 - 0.0003 / hz),
          x * (1 - 0.0025 / hx),
          0,
          z * (1 - 0.0025 / hz),
        );
      } else position.push(x, TANK.glass, z, x, surfaceY(x, z), z);
      const a = base + 2 * k;
      if (k < n) index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(position, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export default function Water({ damping }: { damping: number }) {
  const tune = useControls("Water", {
    waveDepth: { value: water.depth, min: 0.05, max: TANK.water },
    dragCd: { value: drag.cd, min: 0, max: 3 },
    linearDrag: { value: drag.linear, min: 0, max: 10 },
    "bodies in water": monitor(() => waterBodies.size),
    "level cm": monitor(() => water.level * 100),
    "spilled l": monitor(() => water.spilled * 1000),
  });
  useEffect(() => {
    water.damping = damping;
    water.depth = tune.waveDepth;
    drag.cd = tune.dragCd;
    drag.linear = tune.linearDrag;
  }, [damping, tune.waveDepth, tune.dragCd, tune.linearDrag]);

  const surface = useMemo(
    () =>
      new PlaneGeometry(water.lx, water.lz, water.nx, water.nz).rotateX(
        -Math.PI / 2,
      ),
    [],
  );
  const sides = useMemo(() => sidesGeometry(), []);
  const meniscus = useMemo(() => sidesGeometry(true), []);
  const detail = useMemo(() => {
    const normals = waterNormals();
    normals.repeat.set(water.lx / 0.16, water.lz / 0.16);
    const material = waterMaterial.clone();
    material.normalMap = normals;
    material.normalScale = new Vector2(0.24, 0.24);
    material.color.set("#73aaa5");
    material.opacity = 0.16;
    return { normals, material };
  }, []);
  useEffect(
    () => () => {
      surface.dispose();
      sides.dispose();
      meniscus.dispose();
      detail.normals.dispose();
      detail.material.dispose();
    },
    [surface, sides, meniscus, detail],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    detail.normals.offset.x = (detail.normals.offset.x + dt * 0.018) % 1;
    detail.normals.offset.y = (detail.normals.offset.y + dt * 0.011) % 1;
    if (Math.abs(water.level - calibrated) > 0.01) {
      calibrated = water.level;
      water.depth = waveDepth(water.level);
    }

    const p = surface.attributes.position;
    for (let k = 0; k < p.count; k++) p.setY(k, surfaceY(p.getX(k), p.getZ(k)));
    p.needsUpdate = true;
    surface.computeVertexNormals();

    const s = sides.attributes.position;
    for (let k = 1; k < s.count; k += 2)
      s.setY(k, surfaceY(s.getX(k), s.getZ(k)));
    s.needsUpdate = true;

    const rim = meniscus.attributes.position;
    for (let k = 0; k < rim.count; k++) {
      const lift = k % 2 === 0 ? 0.0014 : 0.0002;
      rim.setY(
        k,
        Math.min(TANK.h - 0.0005, surfaceY(rim.getX(k), rim.getZ(k)) + lift),
      );
    }
    rim.needsUpdate = true;
  });

  return (
    <>
      <mesh geometry={surface} material={detail.material} />
      <mesh geometry={meniscus}>
        <meshBasicMaterial
          color="#bddbd2"
          transparent
          opacity={0.32}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh geometry={sides} material={waterMaterial} />
    </>
  );
}
