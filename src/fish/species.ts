import type { Species } from "./boids.ts";

// Sizes and speeds roughly match the real fish. Heights are above the tank floor a d the surface rests at ≈ 0.36 m.
export const SPECIES: Species[] = [
  // Tight, fast school in mid water
  {
    name: "neon",
    count: 20,
    length: 0.03,
    cruise: 0.08,
    maxSpeed: 0.3,
    maxForce: 0.6,
    view: 0.12,
    spacing: 0.03,
    separation: 1.2,
    alignment: 0.6,
    cohesion: 0.5,
    minY: 0.12,
    maxY: 0.26,
  },
  // Loose group near the top
  {
    name: "guppy",
    count: 8,
    length: 0.035,
    cruise: 0.06,
    maxSpeed: 0.25,
    maxForce: 0.5,
    view: 0.12,
    spacing: 0.045,
    separation: 0.8,
    alignment: 0.2,
    cohesion: 0.15,
    minY: 0.22,
    maxY: 0.32,
  },
  // A single slow loner, keeps the small fish at a respectful distance
  {
    name: "tang",
    count: 1,
    length: 0.09,
    cruise: 0.035,
    maxSpeed: 0.18,
    maxForce: 0.25,
    view: 0.2,
    spacing: 0.14,
    separation: 0.5,
    alignment: 0.05,
    cohesion: 0.02,
    minY: 0.14,
    maxY: 0.28,
  },
  // Bottom dwellers
  {
    name: "corydoras",
    count: 4,
    length: 0.05,
    cruise: 0.03,
    maxSpeed: 0.15,
    maxForce: 0.3,
    view: 0.12,
    spacing: 0.06,
    separation: 0.5,
    alignment: 0.1,
    cohesion: 0.1,
    minY: 0.04,
    maxY: 0.07,
  },
];
