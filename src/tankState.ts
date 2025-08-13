import { Vector3 } from "three";
import { WaterSim } from "./water/sim.ts";

export const TANK = { w: 0.8, h: 0.45, d: 0.4, glass: 0.006, water: 0.35 };
export const TABLE = { w: 2.4, d: 1.2, thickness: 0.05 };

export const tankState = {
  pos: new Vector3(),
  vel: new Vector3(),
  acc: new Vector3(),
  target: new Vector3(),
};

const lx = TANK.w - 2 * TANK.glass;
const k = Math.PI / lx;
export const waveDepth = (level: number) => Math.tanh(k * level) / k;

export const water = new WaterSim({
  lx,
  lz: TANK.d - 2 * TANK.glass,
  nx: 48,
  nz: 24,
  depth: waveDepth(TANK.water),
  level: TANK.water,
  rim: TANK.h - TANK.glass,
});

export const surfaceY = (x: number, z: number) =>
  TANK.glass + water.level + water.heightAt(x, z);
