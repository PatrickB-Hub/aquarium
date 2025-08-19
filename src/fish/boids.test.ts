/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnFish, stepFish, type Env, type Fish } from "./boids.ts";
import { SPECIES } from "./species.ts";

const DT = 1 / 60;
const SURFACE = 0.356;
const seeded = (seed: number) => () =>
  (seed = (seed * 16807) % 2147483647) / 2147483647;
const makeEnv = (): Env => ({
  hx: 0.394,
  hz: 0.194,
  floorY: 0.036,
  surfaceY: () => SURFACE,
  flow: () => [0, 0],
  obstacles: [],
  acc: { x: 0, z: 0 },
});
const meanSpeed = (fish: Fish[]) =>
  fish.reduce((s, f) => s + Math.hypot(f.vx, f.vy, f.vz), 0) / fish.length;

test("fish stay in the water and out of obstacles, even when startled", () => {
  const rng = seeded(1);
  const env = makeEnv();
  env.obstacles.push({ x: 0, y: 0.1, z: 0, r: 0.06 });
  const fish = spawnFish(SPECIES, env, rng);
  for (let k = 0; k < 60 / DT; k++) {
    env.acc.x = k % 300 < 20 ? 5 : 0;
    stepFish(fish, SPECIES, env, DT, rng);
    for (const f of fish) {
      const { name, length } = SPECIES[f.species];
      assert.ok(
        Math.abs(f.x) <= env.hx - length / 2 + 1e-9 &&
          Math.abs(f.z) <= env.hz - length / 2 + 1e-9,
        `${name} left the tank`,
      );
      assert.ok(
        f.y >= env.floorY - 1e-9 && f.y <= SURFACE - length / 2 + 1e-9,
        `${name} left the water`,
      );
      // Spawn may land inside the obstacle; give them two seconds to get out
      if (k > 120)
        assert.ok(
          Math.hypot(f.x, f.y - 0.1, f.z) > 0.06,
          `${name} inside the obstacle at t=${(k * DT).toFixed(2)}`,
        );
    }
  }
});

test("neons school up, flee from a jolt, and calm down again", () => {
  const rng = seeded(2);
  const env = makeEnv();
  const neon = [SPECIES.find((s) => s.name === "neon")!];
  const fish = spawnFish(neon, env, rng);
  const run = (seconds: number) => {
    for (let k = 0; k < seconds / DT; k++) stepFish(fish, neon, env, DT, rng);
  };
  const nearest = () =>
    fish.reduce(
      (sum, f) =>
        sum +
        Math.min(
          ...fish
            .filter((o) => o !== f)
            .map((o) => Math.hypot(f.x - o.x, f.y - o.y, f.z - o.z)),
        ),
      0,
    ) / fish.length;

  // Speed averaged over a window: wander and separation keep a school ~25 % above nominal cruise and noisy
  const averageSpeed = (seconds: number) => {
    let sum = 0;
    const steps = Math.round(seconds / DT);
    for (let k = 0; k < steps; k++) {
      stepFish(fish, neon, env, DT, rng);
      sum += meanSpeed(fish);
    }
    return sum / steps;
  };

  run(30);
  assert.ok(nearest() < 0.05, `mean nearest neighbour ${nearest()} m`);
  const cruising = averageSpeed(5);
  assert.ok(cruising < 1.5 * neon[0].cruise, `cruising at ${cruising} m/s`);

  env.acc.x = 5;
  run(0.2);
  env.acc.x = 0;
  const startled = averageSpeed(1);
  // Measured ≈ 1.6x over the first second (peak ≈ 2.8x); bursts in random directions partly cancel through alignment
  assert.ok(
    startled > 1.4 * cruising,
    `startled at ${startled} m/s, cruising ${cruising} m/s`,
  );

  run(3);
  const calm = averageSpeed(5);
  assert.ok(
    calm < 1.25 * cruising,
    `calmed to ${calm} m/s, cruising ${cruising} m/s`,
  );
});
