/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { WaterSim } from "./sim.ts";

const DT = 1 / 120;
// Rim 0.444 m over 0.35 m of water, as in the app; the calmer tests raise the rim so nothing spills
const make = (damping = 0.3, rim = 0.444) => {
  const w = new WaterSim({
    lx: 0.788,
    lz: 0.388,
    nx: 48,
    nz: 24,
    depth: 0.22,
    level: 0.35,
    rim,
  });
  w.damping = damping;
  return w;
};
const sum = (a: Float64Array) => a.reduce((s, x) => s + x, 0);
const maxAbs = (a: Float64Array) =>
  a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

function bump(w: WaterSim, amp: number) {
  for (let j = 0; j < w.nz; j++)
    for (let i = 0; i < w.nx; i++) {
      const x = -w.lx / 2 + (i + 0.5) * w.dx - 0.1;
      const z = -w.lz / 2 + (j + 0.5) * w.dz;
      w.h[i + j * w.nx] = amp * Math.exp(-(x * x + z * z) / 0.005);
    }
}

test("water in the tank plus spilled water is conserved while shaking hard enough to spill and clamp", () => {
  const w = make();
  bump(w, 0.02);
  const volume = () => w.level * w.lx * w.lz + sum(w.h) * w.dx * w.dz;
  const v0 = volume();
  let clamped = false;
  let reported = 0;
  w.onSpill = (_x, _z, _nx, _nz, _head, v) => {
    reported += v;
  };
  for (let k = 0; k < 1000; k++) {
    w.step(DT, 8 * Math.sign(Math.sin(k * 0.05)), 3 * Math.cos(k * 0.03));
    clamped ||= w.h.some((x) => x <= w.minH + 1e-9 || x >= w.maxH - 1e-9);
  }
  assert.ok(clamped, "test should exercise the clamp path");
  assert.ok(w.spilled > 1e-4, `test should spill, spilled ${w.spilled} m³`);
  assert.ok(
    Math.abs(reported - w.spilled) < 1e-12,
    "every spilled m³ is reported",
  );
  assert.ok(
    Math.abs(volume() + w.spilled - v0) < 1e-9,
    `volume drifted: ${volume() + w.spilled - v0}`,
  );
});

// The next two use damping 1/s (amplitude e-folds in 2 s) so the transient is gone and only the physics is checked.
test("a disturbance settles back to flat", () => {
  const w = make(1, 1);
  bump(w, 0.02);
  for (let k = 0; k < 20 * 120; k++) w.step(DT, 0, 0);
  // The bump's volume stays in the tank, so "flat" means flat at the raised mean level
  const mean = sum(w.h) / w.h.length;
  const ripple = maxAbs(w.h.map((x) => x - mean));
  assert.ok(ripple < 0.02 * 0.01, `still ${ripple} m`);
});

test("constant acceleration tilts the surface to slope -a/g", () => {
  const w = make(1, 1);
  const ax = 2;
  for (let k = 0; k < 30 * 120; k++) w.step(DT, ax, 0);
  const expected = -ax / w.g;
  for (let j = 0; j < w.nz; j++)
    for (let i = 1; i < w.nx; i++) {
      const slope = (w.h[i + j * w.nx] - w.h[i - 1 + j * w.nx]) / w.dx;
      assert.ok(
        Math.abs(slope - expected) < 0.01 * Math.abs(expected),
        `slope ${slope} at (${i},${j}), expected ${expected}`,
      );
    }
  assert.ok(
    Math.abs(w.heightAt(0, -0.1) - w.heightAt(0, 0.1)) < 1e-6,
    "no tilt along z",
  );
});
