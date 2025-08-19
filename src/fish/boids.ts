// Boids in tank-local coordinates. Fish steer, get carried by the
// water flow, and are hard-clamped into the water volume as a last resort.

export type Species = {
  name: string;
  count: number;
  /** Body length, m */
  length: number;
  /** m/s */
  cruise: number;
  /** m/s, swum when startled */
  maxSpeed: number;
  /** Steering limit, m/s² */
  maxForce: number;
  /** Neighbor radius for alignment and cohesion, m */
  view: number;
  /** Preferred minimum distance to any fish, m */
  spacing: number;
  /** Steering weights, m/s² */
  separation: number;
  alignment: number;
  cohesion: number;
  /** Preferred depth band as height above the tank floor, m */
  minY: number;
  maxY: number;
};

export type Fish = {
  species: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  startled: number;
};

export type Env = {
  hx: number;
  hz: number;
  floorY: number;
  surfaceY: (x: number, z: number) => number;
  flow: (x: number, z: number) => [number, number];
  obstacles: { x: number; y: number; z: number; r: number }[];
  acc: { x: number; z: number };
};

/** Calibration knobs */
export const fishParams = {
  startleAcc: 2.5,
  startleTime: 1.5,
  flowCarry: 0.6,
  wander: 0.4,
};

const MARGIN = 0.04;
const push = (dist: number, margin: number) =>
  dist < margin ? 1 - dist / margin : 0;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export function spawnFish(
  species: Species[],
  env: Env,
  rng = Math.random,
): Fish[] {
  const school: Fish[] = [];
  species.forEach((kind, speciesIndex) => {
    for (let i = 0; i < kind.count; i++) {
      const heading = rng() * Math.PI * 2;
      school.push({
        species: speciesIndex,
        x: (rng() * 2 - 1) * (env.hx - MARGIN),
        y: kind.minY + rng() * (kind.maxY - kind.minY),
        z: (rng() * 2 - 1) * (env.hz - MARGIN),
        vx: Math.cos(heading) * kind.cruise,
        vy: 0,
        vz: Math.sin(heading) * kind.cruise,
        startled: 0,
      });
    }
  });
  return school;
}

export function stepFish(
  school: Fish[],
  species: Species[],
  env: Env,
  dt: number,
  rng = Math.random,
) {
  const jolted = Math.hypot(env.acc.x, env.acc.z) > fishParams.startleAcc;

  for (const fish of school) {
    const kind = species[fish.species];
    if (jolted) {
      if (fish.startled <= 0) {
        const heading = rng() * Math.PI * 2;
        fish.vx += Math.cos(heading) * kind.maxSpeed;
        fish.vz += Math.sin(heading) * kind.maxSpeed;
      }
      fish.startled = fishParams.startleTime;
    } else {
      fish.startled = Math.max(0, fish.startled - dt);
    }
    const scared = fish.startled > 0;

    // Steering: flocking, wander, cruising speed — limited to maxForce
    let ax = 0;
    let ay = 0;
    let az = 0;
    let neighbors = 0;
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    let sumVx = 0;
    let sumVy = 0;
    let sumVz = 0;
    for (const other of school) {
      if (other === fish) continue;
      const dx = fish.x - other.x;
      const dy = fish.y - other.y;
      const dz = fish.z - other.z;
      const dist = Math.hypot(dx, dy, dz);
      const spacing = Math.max(kind.spacing, species[other.species].spacing);
      if (dist < spacing && dist > 1e-9) {
        const strength = (kind.separation * (1 - dist / spacing)) / dist;
        ax += dx * strength;
        ay += dy * strength;
        az += dz * strength;
      }
      if (other.species === fish.species && dist < kind.view) {
        neighbors++;
        sumX += other.x;
        sumY += other.y;
        sumZ += other.z;
        sumVx += other.vx;
        sumVy += other.vy;
        sumVz += other.vz;
      }
    }
    if (neighbors > 0) {
      // A startled school pulls together
      const cohesionGain = ((scared ? 3 : 1) * kind.cohesion) / kind.view;
      ax += (sumX / neighbors - fish.x) * cohesionGain;
      ay += (sumY / neighbors - fish.y) * cohesionGain;
      az += (sumZ / neighbors - fish.z) * cohesionGain;
      const alignmentGain = kind.alignment / kind.maxSpeed;
      ax += (sumVx / neighbors - fish.vx) * alignmentGain;
      ay += (sumVy / neighbors - fish.vy) * alignmentGain;
      az += (sumVz / neighbors - fish.vz) * alignmentGain;
    }
    if (fish.y < kind.minY) {
      ay += 0.5 * kind.maxForce * Math.min(1, (kind.minY - fish.y) / MARGIN);
    } else if (fish.y > kind.maxY) {
      ay -= 0.5 * kind.maxForce * Math.min(1, (fish.y - kind.maxY) / MARGIN);
    }
    const wander = fishParams.wander * kind.maxForce;
    ax += (rng() - 0.5) * wander;
    ay += (rng() - 0.5) * wander * 0.3;
    az += (rng() - 0.5) * wander;
    const currentSpeed = Math.hypot(fish.vx, fish.vy, fish.vz) || 1e-9;
    const targetSpeed = scared ? kind.maxSpeed : kind.cruise;
    const speedCorrection = (2 * (targetSpeed - currentSpeed)) / currentSpeed;
    ax += fish.vx * speedCorrection;
    ay += fish.vy * speedCorrection;
    az += fish.vz * speedCorrection;

    const steeringLimit = kind.maxForce * (scared ? 2 : 1);
    const steering = Math.hypot(ax, ay, az);
    if (steering > steeringLimit) {
      ax *= steeringLimit / steering;
      ay *= steeringLimit / steering;
      az *= steeringLimit / steering;
    }

    // Avoidance of glass, floor, surface and decor
    const avoidStrength = 3 * kind.maxForce;
    const halfLength = kind.length / 2;
    const margin = MARGIN + halfLength;
    const surface = env.surfaceY(fish.x, fish.z);
    ax +=
      avoidStrength *
      (push(fish.x + env.hx, margin) - push(env.hx - fish.x, margin));
    az +=
      avoidStrength *
      (push(fish.z + env.hz, margin) - push(env.hz - fish.z, margin));
    ay +=
      avoidStrength *
      (push(fish.y - env.floorY, halfLength + 0.01) -
        push(surface - fish.y, margin));
    for (const obstacle of env.obstacles) {
      const dx = fish.x - obstacle.x;
      const dy = fish.y - obstacle.y;
      const dz = fish.z - obstacle.z;
      const dist = Math.hypot(dx, dy, dz) || 1e-9;
      const strength = (avoidStrength * push(dist - obstacle.r, margin)) / dist;
      ax += dx * strength;
      ay += dy * strength;
      az += dz * strength;
    }

    fish.vx += ax * dt;
    fish.vy += ay * dt;
    fish.vz += az * dt;
    // Fish swim mostly level
    const horizontalSpeed = Math.hypot(fish.vx, fish.vz);
    const maxClimb = 0.5 * horizontalSpeed + 0.02;
    fish.vy = clamp(fish.vy, -maxClimb, maxClimb);
    const speed = Math.hypot(fish.vx, fish.vy, fish.vz);
    if (speed > kind.maxSpeed) {
      fish.vx *= kind.maxSpeed / speed;
      fish.vy *= kind.maxSpeed / speed;
      fish.vz *= kind.maxSpeed / speed;
    }

    const [flowX, flowZ] = env.flow(fish.x, fish.z);
    fish.x += (fish.vx + fishParams.flowCarry * flowX) * dt;
    fish.y += fish.vy * dt;
    fish.z += (fish.vz + fishParams.flowCarry * flowZ) * dt;

    // A startled burst can outrun the avoidance force, so push fish back out of decor,
    // then keep the whole body inside the water (the water volume wins if both disagree).
    for (const obstacle of env.obstacles) {
      const dx = fish.x - obstacle.x;
      const dy = fish.y - obstacle.y;
      const dz = fish.z - obstacle.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < obstacle.r && dist > 1e-9) {
        const scale = (obstacle.r * 1.001) / dist;
        fish.x = obstacle.x + dx * scale;
        fish.y = obstacle.y + dy * scale;
        fish.z = obstacle.z + dz * scale;
      }
    }
    fish.x = clamp(fish.x, -env.hx + halfLength, env.hx - halfLength);
    fish.z = clamp(fish.z, -env.hz + halfLength, env.hz - halfLength);
    fish.y = Math.min(
      env.surfaceY(fish.x, fish.z) - halfLength,
      Math.max(env.floorY, fish.y),
    );
  }
}
