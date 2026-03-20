const COUNTS = [500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000];
const SPREAD = 100_000;
const PALETTE_SIZE = 16;

for (const count of COUNTS) {
  const positions = new Float32Array(count * 2);
  const paletteIndices = new Uint16Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 2] = Math.random() * SPREAD;
    positions[i * 2 + 1] = Math.random() * SPREAD;
    paletteIndices[i] = (Math.random() * PALETTE_SIZE) | 0;
  }
  const tag = (count / 1_000_000).toFixed(1).replace(".0", "") + "M";
  Bun.write(`benchmark/data/points-${tag}.positions.bin`, positions.buffer);
  Bun.write(`benchmark/data/points-${tag}.palette.bin`, paletteIndices.buffer);
  console.log(`${tag}: ${count} points written`);
}
