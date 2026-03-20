const COUNTS = [500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000];
const SPREAD = 100_000;
const PAL_N = 16;

function gen(count) {
  const pos = new Float32Array(count * 2);
  const idx = new Uint16Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 2] = Math.random() * SPREAD;
    pos[i * 2 + 1] = Math.random() * SPREAD;
    idx[i] = (Math.random() * PAL_N) | 0;
  }
  const colors = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    colors[i * 4] = 128; colors[i * 4 + 1] = 128; colors[i * 4 + 2] = 128; colors[i * 4 + 3] = 220;
  }
  return { pos, idx, colors, count };
}

function measureOP(data) {
  return {
    gpuBytes: data.pos.byteLength + data.idx.byteLength + PAL_N * 4,
    drawCalls: 1,
    jsObjects: 0,
    buildMs: 0,
  };
}

function measureDeckBinary(data) {
  const t0 = performance.now();
  const pos3 = new Float32Array(data.count * 3);
  for (let i = 0; i < data.count; i++) {
    pos3[i * 3] = data.pos[i * 2];
    pos3[i * 3 + 1] = data.pos[i * 2 + 1];
    pos3[i * 3 + 2] = 0;
  }
  const buildMs = performance.now() - t0;
  return {
    gpuBytes: pos3.byteLength + data.colors.byteLength,
    drawCalls: "N",
    jsObjects: 0,
    buildMs,
    note: "pos3 expand",
  };
}

function measureOL(data) {
  const t0 = performance.now();
  const objs = new Array(data.count);
  for (let i = 0; i < data.count; i++) {
    objs[i] = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [data.pos[i * 2], data.pos[i * 2 + 1]] },
      properties: { color: [128, 128, 128, 220] },
    };
  }
  const buildMs = performance.now() - t0;
  return {
    gpuBytes: data.count * 320,
    drawCalls: "N",
    jsObjects: data.count,
    buildMs,
  };
}

const hdr = (s, w) => s.padEnd(w);
const num = (v, w) => String(v).padStart(w);
const mb = (b) => (b / 1048576).toFixed(1);

console.log("");
console.log("┌──────────┬──────────────────────────────┬──────────────────────────────┬──────────────────────────────┐");
console.log("│ Points   │ Open Plant                   │ deck.gl (binary accessor)    │ OpenLayers (Feature obj)     │");
console.log("├──────────┼──────────────────────────────┼──────────────────────────────┼──────────────────────────────┤");

for (const count of COUNTS) {
  const data = gen(count);
  const op = measureOP(data);
  const dk = measureDeckBinary(data);
  const ol = measureOL(data);

  const tag = count >= 1e6 ? `${(count / 1e6).toFixed(0)}M` : `${(count / 1e3).toFixed(0)}K`;

  const opCol = `GPU: ${mb(op.gpuBytes).padStart(5)} MB  obj: 0`;
  const dkCol = `GPU: ${mb(dk.gpuBytes).padStart(5)} MB  obj: 0`;
  const olCol = `build: ${String(ol.buildMs.toFixed(0)).padStart(4)}ms  obj: ${(count/1e6).toFixed(1)}M`;

  console.log(`│ ${tag.padEnd(8)} │ ${opCol.padEnd(28)} │ ${dkCol.padEnd(28)} │ ${olCol.padEnd(28)} │`);
}
console.log("└──────────┴──────────────────────────────┴──────────────────────────────┴──────────────────────────────┘");

console.log("\nMemory ratio (GPU buffer):");
for (const count of COUNTS) {
  const data = gen(count);
  const opB = data.pos.byteLength + data.idx.byteLength + PAL_N * 4;
  const dkB = data.count * 3 * 4 + data.colors.byteLength;
  const olB = data.count * 320;
  const tag = count >= 1e6 ? `${(count / 1e6).toFixed(0)}M` : `${(count / 1e3).toFixed(0)}K`;
  console.log(`  ${tag.padEnd(5)}  OP: ${mb(opB).padStart(6)} MB  |  deck.gl: ${mb(dkB).padStart(6)} MB (${(dkB/opB).toFixed(1)}x)  |  OL: ~${mb(olB).padStart(6)} MB (${(olB/opB).toFixed(0)}x)`);
}
