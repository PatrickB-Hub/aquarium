export type WaterOptions = {
  lx: number;
  lz: number;
  nx: number;
  nz: number;
  depth: number;
  level: number;
  rim: number;
};

/** Tank-local point on the inner wall face, outward wall normal, head over the rim (m) and spilled volume (m³) */
export type SpillHandler = (
  x: number,
  z: number,
  nx: number,
  nz: number,
  head: number,
  volume: number,
) => void;

export class WaterSim {
  readonly lx: number;
  readonly lz: number;
  readonly nx: number;
  readonly nz: number;
  readonly dx: number;
  readonly dz: number;
  /** Surface displacement from the rest level at cell centers, index i + j*nx */
  readonly h: Float64Array;
  /** x-velocity on x-faces, index i + j*(nx+1) */
  readonly u: Float64Array;
  /** z-velocity on z-faces, index i + j*nx */
  readonly v: Float64Array;
  /** Depth that sets the wave speed sqrt(g*depth). Linear SWE has no dispersion, so this is a calibration knob, not the real depth. */
  depth: number;
  /** Rest depth of the water above the floor */
  level: number;
  /** Height of the wall tops above the floor */
  readonly rim: number;
  private readonly startLevel: number;
  /** Total volume spilled over the rim, m³ */
  spilled = 0;
  onSpill?: SpillHandler;
  /** Velocity damping in 1/s */
  damping = 1;
  g = 9.81;

  constructor(o: WaterOptions) {
    this.lx = o.lx;
    this.lz = o.lz;
    this.nx = o.nx;
    this.nz = o.nz;
    this.dx = o.lx / o.nx;
    this.dz = o.lz / o.nz;
    this.depth = o.depth;
    this.level = o.level;
    this.startLevel = o.level;
    this.rim = o.rim;
    this.h = new Float64Array(o.nx * o.nz);
    this.u = new Float64Array((o.nx + 1) * o.nz);
    this.v = new Float64Array(o.nx * (o.nz + 1));
  }

  /** Displacement limits */
  get minH() {
    return 0.01 - this.level;
  }
  get maxH() {
    return this.rim - this.level + 0.02;
  }

  /** Refill to the starting level and calm the surface */
  reset() {
    this.level = this.startLevel;
    this.spilled = 0;
    this.h.fill(0);
    this.u.fill(0);
    this.v.fill(0);
  }

  step(dt: number, ax: number, az: number) {
    const { nx, nz, dx, dz, h, u, v, g, depth } = this;
    const substeps = Math.ceil(
      (Math.sqrt(g * depth) * dt * Math.sqrt(1 / dx ** 2 + 1 / dz ** 2)) / 0.5,
    );
    const s = dt / substeps;
    const keep = 1 - this.damping * s;

    for (let k = 0; k < substeps; k++) {
      for (let j = 0; j < nz; j++)
        for (let i = 1; i < nx; i++) {
          const f = i + j * (nx + 1);
          u[f] =
            (u[f] +
              s * ((-g * (h[i + j * nx] - h[i - 1 + j * nx])) / dx - ax)) *
            keep;
        }
      for (let j = 1; j < nz; j++)
        for (let i = 0; i < nx; i++) {
          const f = i + j * nx;
          v[f] = (v[f] + s * ((-g * (h[f] - h[f - nx])) / dz - az)) * keep;
        }
      for (let j = 0; j < nz; j++)
        for (let i = 0; i < nx; i++) {
          const cell = i + j * nx;
          const uf = i + j * (nx + 1);
          h[cell] -=
            s *
            depth *
            ((u[uf + 1] - u[uf]) / dx + (v[cell + nx] - v[cell]) / dz);
        }
      this.spill(s);
      this.clamp();
    }
  }

  heightAt(x: number, z: number) {
    return this.sample(this.h, this.nx, this.nz, 0.5, 0.5, x, z);
  }

  /** Depth-averaged water velocity relative to the tank */
  velocityAt(x: number, z: number): [number, number] {
    return [
      this.sample(this.u, this.nx + 1, this.nz, 0, 0.5, x, z),
      this.sample(this.v, this.nx, this.nz + 1, 0.5, 0, x, z),
    ];
  }

  // Wall cells above the rim drain over it
  private spill(s: number) {
    const { nx, nz, dx, dz, lx, lz, h } = this;
    if (this.level < 0.02) return;
    let lost = 0;
    for (let j = 0; j < nz; j++) {
      const z = -lz / 2 + (j + 0.5) * dz;
      lost += this.drain(j * nx, dz, s, -lx / 2, z, -1, 0);
      lost += this.drain(nx - 1 + j * nx, dz, s, lx / 2, z, 1, 0);
    }
    for (let i = 0; i < nx; i++) {
      const x = -lx / 2 + (i + 0.5) * dx;
      lost += this.drain(i, dx, s, x, -lz / 2, 0, -1);
      lost += this.drain(i + (nz - 1) * nx, dx, s, x, lz / 2, 0, 1);
    }
    if (lost === 0) return;
    const dh = lost / (lx * lz);
    this.level -= dh;
    for (let c = 0; c < h.length; c++) h[c] += dh;
    this.spilled += lost;
  }

  private drain(
    cell: number,
    edge: number,
    s: number,
    x: number,
    z: number,
    nx: number,
    nz: number,
  ) {
    const head = this.h[cell] - (this.rim - this.level);
    if (head <= 0) return 0;
    const area = this.dx * this.dz;
    const volume = Math.min(1.7 * head ** 1.5 * edge * s, head * area);
    this.h[cell] -= volume / area;
    this.onSpill?.(x, z, nx, nz, head, volume);
    return volume;
  }

  // Clamping keeps the linear model in range
  private clamp() {
    const { h, minH, maxH } = this;
    let excess = 0;
    for (let c = 0; c < h.length; c++) {
      const clamped = Math.min(maxH, Math.max(minH, h[c]));
      excess += h[c] - clamped;
      h[c] = clamped;
    }
    if (excess !== 0)
      for (let c = 0; c < h.length; c++) h[c] += excess / h.length;
  }

  /** Bilinear sample of a grid whose sample (i, j) sits at ((i + ox) * dx, (j + oz) * dz) from the -x/-z corner */
  private sample(
    a: Float64Array,
    cols: number,
    rows: number,
    ox: number,
    oz: number,
    x: number,
    z: number,
  ) {
    const fx = Math.min(
      cols - 1,
      Math.max(0, (x + this.lx / 2) / this.dx - ox),
    );
    const fz = Math.min(
      rows - 1,
      Math.max(0, (z + this.lz / 2) / this.dz - oz),
    );
    const i = Math.min(Math.floor(fx), cols - 2);
    const j = Math.min(Math.floor(fz), rows - 2);
    const tx = fx - i;
    const tz = fz - j;
    const r0 = i + j * cols;
    const r1 = r0 + cols;
    return (
      (a[r0] * (1 - tx) + a[r0 + 1] * tx) * (1 - tz) +
      (a[r1] * (1 - tx) + a[r1 + 1] * tx) * tz
    );
  }
}
