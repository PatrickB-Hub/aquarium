/// <reference types="node" />
import type { RapierRigidBody } from "@react-three/rapier";
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyWaterForces, waterBodies } from "./buoyancy.ts";
import { TANK, tankState, water } from "./tankState.ts";

const DT = 1 / 120;
const SURFACE = TANK.glass + TANK.water;

function fakeBody(mass: number, y: number, vx = 0) {
  const impulse = { x: 0, y: 0, z: 0 };
  const body = {
    mass: () => mass,
    isSleeping: () => false,
    translation: () => ({ x: 0, y, z: 0 }),
    linvel: () => ({ x: vx, y: 0, z: 0 }),
    applyImpulse: (i: typeof impulse) => Object.assign(impulse, i),
  };
  return { body: body as unknown as RapierRigidBody, impulse };
}

function reset() {
  waterBodies.clear();
  tankState.pos.set(0, 0, 0);
  tankState.vel.set(0, 0, 0);
  tankState.acc.set(0, 0, 0);
  water.reset();
}

test("a cork at rest floats with its density ratio submerged", () => {
  reset();
  const density = 250;
  const volume = 2e-5;
  const mass = density * volume;
  const r = Math.cbrt((3 * volume) / (4 * Math.PI));
  // Bottom of the equivalent sphere sits 2r * (density ratio) below the surface
  const { body, impulse } = fakeBody(
    mass,
    SURFACE + r - 2 * r * (density / 1000),
  );
  waterBodies.set(body, density);
  applyWaterForces(DT);
  const weight = mass * water.g * DT;
  assert.ok(
    Math.abs(impulse.y - weight) < 1e-9 * weight,
    `buoyancy ${impulse.y} vs weight ${weight}`,
  );
});

test("in an accelerating tank, buoyancy pushes along the acceleration", () => {
  reset();
  tankState.acc.set(3, 0, 0);
  const mass = 0.05;
  const { body, impulse } = fakeBody(mass, 0.1); // Fully submerged, moving with the water
  waterBodies.set(body, 2600);
  applyWaterForces(DT);
  const expected = 1000 * (mass / 2600) * 3 * DT;
  assert.ok(
    Math.abs(impulse.x - expected) < 1e-9 * expected,
    `got ${impulse.x}, expected ${expected}`,
  );
});

test("volume follows mass changes (the wrapper applies density after creating the collider)", () => {
  reset();
  let mass = 1e-5; // First read: collider still at Rapier's default density
  const { body, impulse } = fakeBody(0, 0.1);
  (body as unknown as { mass: () => number }).mass = () => mass;
  waterBodies.set(body, 2600);
  applyWaterForces(DT);
  mass = 0.05;
  applyWaterForces(DT);
  const expected = 1000 * (mass / 2600) * water.g * DT;
  assert.ok(
    Math.abs(impulse.y - expected) < 1e-9 * expected,
    `got ${impulse.y}, expected ${expected}`,
  );
});

test("drag slows relative motion but never reverses it", () => {
  reset();
  const mass = 1e-4;
  const { body, impulse } = fakeBody(mass, 0.1, 50);
  waterBodies.set(body, 1000);
  applyWaterForces(DT);
  const dv = impulse.x / mass;
  assert.ok(dv < 0 && dv >= -50 - 1e-9, `velocity change ${dv}`);
});
