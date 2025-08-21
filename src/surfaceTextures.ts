import { DataTexture, LinearFilter, RepeatWrapping } from "three";

function repeatingTexture(data: Uint8Array, size: number) {
  const texture = new DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function waterNormals() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const dx =
        0.22 * Math.cos(2 * u + v) +
        0.09 * Math.cos(u - 3 * v) +
        0.06 * Math.cos(5 * u + 4 * v);
      const dy =
        0.11 * Math.cos(2 * u + v) -
        0.27 * Math.cos(u - 3 * v) +
        0.048 * Math.cos(5 * u + 4 * v);
      const length = Math.hypot(dx, dy, 1);
      const k = (x + y * size) * 4;
      data[k] = Math.round((1 - dx / length) * 127.5);
      data[k + 1] = Math.round((1 - dy / length) * 127.5);
      data[k + 2] = Math.round((1 + 1 / length) * 127.5);
      data[k + 3] = 255;
    }
  }
  return repeatingTexture(data, size);
}

export function glassRoughness() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const value = Math.round(
        205 + 22 * Math.sin(u + 2 * v) + 12 * Math.cos(3 * u - v),
      );
      const k = (x + y * size) * 4;
      data[k] = data[k + 1] = data[k + 2] = value;
      data[k + 3] = 255;
    }
  }
  return repeatingTexture(data, size);
}
