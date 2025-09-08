import { useFrame } from "@react-three/fiber";
import {
  BallCollider,
  InstancedRigidBodies,
  RoundCuboidCollider,
  type InstancedRigidBodyProps,
  type RapierRigidBody,
} from "@react-three/rapier";
import { monitor, useControls } from "leva";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import {
  BufferAttribute,
  Color,
  IcosahedronGeometry,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
} from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { waterBodies } from "./buoyancy.ts";
import { TANK, tankState } from "./tankState.ts";
import { usePbr } from "./textures.ts";

type Vec3 = [number, number, number];
type PebbleKind = { size: Vec3; round?: boolean; share: number };

const DENSITY = 2600;
const BORDER = 0.003;
const KINDS: PebbleKind[] = [
  { size: [0.009, 0.006, 0.007], share: 1 },
  { size: [0.012, 0.007, 0.009], share: 1 },
  { size: [0.015, 0.008, 0.011], share: 1 },
  { size: [0.008, 0.008, 0.008], round: true, share: 0.75 },
  { size: [0.011, 0.011, 0.011], round: true, share: 0.75 },
];
const COLORS = [
  "#eee9dc",
  "#d6c2a5",
  "#a7b5af",
  "#f3e9ce",
  "#8d9691",
  "#c5b4a1",
  "#a4aaa9",
  "#ddd7c9",
].map((c) => new Color(c));
/** Pebble texture tile size, m */
const TILE = 0.05;
const GAIN = new Color(2.6, 2.6, 2.6);
const SPACING = 0.034;
let escaped = 0;
let asleep = 0;

const ta = new Vector3();
const tb = new Vector3();
const tc = new Vector3();

// noise is a function of position so shared vertices stay welded
export function pebbleGeometry([x, y, z]: Vec3, seed = 0): BufferGeometry {
  let g = new IcosahedronGeometry(1, 2);
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  g = mergeVertices(g) as IcosahedronGeometry;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i);
    const py = p.getY(i);
    const pz = p.getZ(i);
    const n =
      1 +
      0.08 * Math.sin(px * 5.1 + seed) * Math.cos(pz * 4.3 + py * 3.7 + seed);
    p.setXYZ(i, px * x * n, py * y * n, pz * z * n);
  }
  g.computeVertexNormals();

  const flat = g.toNonIndexed();
  const fp = flat.attributes.position;
  const uv = new Float32Array(fp.count * 2);
  for (let i = 0; i < fp.count; i += 3) {
    ta.fromBufferAttribute(fp, i);
    tb.fromBufferAttribute(fp, i + 1).sub(ta);
    tc.fromBufferAttribute(fp, i + 2).sub(ta);
    const n = tb.cross(tc);
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const px = fp.getX(i + k);
      const py = fp.getY(i + k);
      const pz = fp.getZ(i + k);
      const [u, v] =
        ax >= ay && ax >= az ? [pz, py] : ay >= az ? [px, pz] : [px, py];
      uv[(i + k) * 2] = u;
      uv[(i + k) * 2 + 1] = v;
    }
  }
  flat.setAttribute("uv", new BufferAttribute(uv, 2));
  return flat;
}

function spawnPositions(count: number): Vec3[] {
  const nx = Math.floor((TANK.w - 2 * TANK.glass - 0.02) / SPACING);
  const nz = Math.floor((TANK.d - 2 * TANK.glass - 0.02) / SPACING);
  const cells: Vec3[] = [];
  for (let layer = 0; cells.length < count; layer++)
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++)
        cells.push([
          tankState.pos.x + (i - (nx - 1) / 2) * SPACING,
          TANK.glass + 0.02 + layer * SPACING,
          tankState.pos.z + (j - (nz - 1) / 2) * SPACING,
        ]);
  return cells.sort(() => Math.random() - 0.5).slice(0, count);
}

function PebbleClass({
  kind,
  positions,
  bodies,
}: {
  kind: PebbleKind;
  positions: Vec3[];
  bodies: RefObject<(RapierRigidBody | null)[] | null>;
}) {
  const { size, round } = kind;
  const mesh = useRef<InstancedMesh>(null);
  const maps = usePbr("pebbles", 1 / TILE);
  const geometry = useMemo(() => pebbleGeometry(size, size[0] * 1000), [size]);
  const instances = useMemo<InstancedRigidBodyProps[]>(
    () =>
      positions.map((position, i) => ({
        key: i,
        position,
        rotation: [Math.random() * 6, Math.random() * 6, Math.random() * 6],
      })),
    [positions],
  );

  useEffect(() => {
    const list = (bodies.current ?? []).filter(
      (b): b is RapierRigidBody => b !== null,
    );
    list.forEach((b) => waterBodies.set(b, DENSITY));
    return () => list.forEach((b) => waterBodies.delete(b));
  }, [bodies, positions]);

  useLayoutEffect(() => {
    const tint = new Color();
    positions.forEach((_, i) => {
      tint.copy(COLORS[Math.floor(Math.random() * COLORS.length)]);
      tint.multiplyScalar(0.9 + Math.random() * 0.2);
      mesh.current!.setColorAt(i, tint);
    });
    mesh.current!.instanceColor!.needsUpdate = true;
  }, [positions]);

  const collider = round ? (
    <BallCollider
      args={[size[0]]}
      density={DENSITY}
      friction={0.9}
      restitution={0.05}
    />
  ) : (
    <RoundCuboidCollider
      args={[size[0] - BORDER, size[1] - BORDER, size[2] - BORDER, BORDER]}
      density={DENSITY}
      friction={0.9}
      restitution={0.05}
    />
  );

  return (
    <InstancedRigidBodies
      ref={bodies}
      instances={instances}
      colliders={false}
      angularDamping={round ? 1.5 : 0.3}
      colliderNodes={[collider]}
    >
      <instancedMesh
        ref={mesh}
        args={[geometry, undefined, positions.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <meshStandardMaterial
          {...maps}
          color={GAIN}
          roughness={round ? 0.72 : 0.86}
        />
      </instancedMesh>
    </InstancedRigidBodies>
  );
}

export default function Pebbles() {
  const { count } = useControls("Pebbles", {
    count: { value: 600, min: 50, max: 1200, step: 50 },
    "outside tank": monitor(() => escaped),
    asleep: monitor(() => asleep),
  });
  const positions = useMemo(() => spawnPositions(count), [count]);
  // Split the (shuffled) positions by share
  const groups = useMemo(() => {
    const total = KINDS.reduce((sum, k) => sum + k.share, 0);
    let start = 0;
    return KINDS.map((kind, k) => {
      const end =
        k === KINDS.length - 1
          ? positions.length
          : start + Math.round((positions.length * kind.share) / total);
      const slice = positions.slice(start, end);
      start = end;
      return slice;
    });
  }, [positions]);
  const bodies = useMemo(
    () =>
      KINDS.map(
        (): RefObject<(RapierRigidBody | null)[] | null> => ({
          current: null,
        }),
      ),
    [],
  );

  useFrame(() => {
    escaped = 0;
    asleep = 0;
    for (const ref of bodies)
      for (const b of ref.current ?? []) {
        if (!b) continue;
        if (b.isSleeping()) asleep++;
        const t = b.translation();
        const x = t.x - tankState.pos.x;
        const z = t.z - tankState.pos.z;
        if (Math.abs(x) > TANK.w / 2 || Math.abs(z) > TANK.d / 2 || t.y < 0) {
          escaped++;
        }
      }
  });

  return KINDS.map((kind, k) => (
    <PebbleClass
      key={`${k}-${count}`}
      kind={kind}
      positions={groups[k]}
      bodies={bodies[k]}
    />
  ));
}
