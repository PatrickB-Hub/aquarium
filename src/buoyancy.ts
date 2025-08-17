import type { RapierRigidBody } from "@react-three/rapier";
import { surfaceY, tankState, water } from "./tankState.ts";

const RHO = 1000;

export const waterBodies = new Map<RapierRigidBody, number>();

export const drag = { cd: 1, linear: 1 };

// Runs once per physics tick, after water.step and before world.step. Everything is approximated by an
// equivalent sphere
export function applyWaterForces(dt: number) {
  const { pos, vel, acc } = tankState;
  for (const [body, density] of waterBodies) {
    if (body.isSleeping()) continue;
    const m = body.mass();
    if (m === 0) continue;
    const volume = m / density;
    const radius = Math.cbrt((3 * volume) / (4 * Math.PI));

    const t = body.translation();
    const lx = t.x - pos.x;
    const lz = t.z - pos.z;
    const s = Math.min(
      1,
      Math.max(0, (surfaceY(lx, lz) - (t.y - radius)) / (2 * radius)),
    );
    if (s === 0) continue;

    const b = RHO * volume * s * dt;

    // Drag against the water's velocity (tank + slosh)
    const [wu, wv] = water.velocityAt(lx, lz);
    const v = body.linvel();
    const rx = v.x - (vel.x + wu);
    const ry = v.y;
    const rz = v.z - (vel.z + wv);
    const quadratic =
      (0.5 * RHO * drag.cd * Math.PI * radius ** 2 * Math.hypot(rx, ry, rz)) /
      m;
    const k = Math.min(1, s * dt * (drag.linear + quadratic));

    body.applyImpulse(
      {
        x: b * acc.x - m * k * rx,
        y: b * water.g - m * k * ry,
        z: b * acc.z - m * k * rz,
      },
      true,
    );
  }
}
