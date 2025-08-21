import assert from "node:assert/strict";
import test from "node:test";
import { RepeatWrapping } from "three";
import { glassRoughness, waterNormals } from "./surfaceTextures.ts";

test("detail textures tile, stay subtle, and encode normalized upward-facing water normals", () => {
  const normal = waterNormals();
  const roughness = glassRoughness();
  for (const t of [normal, roughness]) {
    assert.equal(t.wrapS, RepeatWrapping);
    assert.equal(t.wrapT, RepeatWrapping);
  }
  const data = normal.image.data as Uint8Array;
  assert.ok(data);
  assert.ok(roughness.image.data);
  for (let i = 0; i < data.length; i += 4) {
    const n: number[] = [data[i], data[i + 1], data[i + 2]].map(
      (v) => Number(v) / 127.5 - 1,
    );
    assert.ok(Math.abs(Math.hypot(...n) - 1) < 0.015);
    assert.ok(n[2] > 0.85);
    assert.equal(data[i + 3], 255);
  }
  // Wrapping borders must be no sharper than the small periodic ripples inside the tile.
  const size = normal.image.width;
  for (let i = 0; i < size; i++)
    for (let c = 0; c < 3; c++) {
      assert.ok(
        Math.abs(
          Number(data[i * size * 4 + c]) -
            Number(data[(i * size + size - 1) * 4 + c]),
        ) < 12,
      );
      assert.ok(
        Math.abs(
          Number(data[i * 4 + c]) -
            Number(data[((size - 1) * size + i) * 4 + c]),
        ) < 12,
      );
    }
  const values = Array.from(roughness.image.data as Uint8Array)
    .filter((_, i) => i % 4 === 1)
    .map(Number);
  assert.ok(Math.min(...values) >= 171 && Math.max(...values) <= 239);
  assert.ok(Math.max(...values) - Math.min(...values) > 40);
  normal.dispose();
  roughness.dispose();
});
