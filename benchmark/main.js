import { Deck, OrthographicView } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import RenderFeature from "ol/render/Feature.js";
import WebGLVectorLayer from "ol/layer/WebGLVector.js";
import OLMap from "ol/Map.js";
import VectorSource from "ol/source/Vector.js";
import View from "ol/View.js";

const COUNTS = [500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000];
const SPREAD = 100_000;
const PAL_N = 16;
const PAL = Array.from({ length: PAL_N }, (_, i) => {
  const h = (i / PAL_N) * 360,
    s = 75,
    l = 55;
  const f = n => {
    const k = (n + h / 30) % 12;
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
    return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255), 220];
});

const $log = document.getElementById("log");
const print = msg => {
  $log.textContent += msg + "\n";
  $log.scrollTop = $log.scrollHeight;
};

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
    const c = PAL[idx[i]];
    colors.set(c, i * 4);
  }
  return { pos, idx, colors, count };
}

function fmtMs(v) {
  return v.toFixed(2);
}
function fmtMB(b) {
  return (b / 1048576).toFixed(1);
}

// ═══════════════════════ Open Plant (WebGL2 gl.POINTS) ═══════════════════════

function initOP(canvas, data) {
  const gl = canvas.getContext("webgl2", { antialias: false, depth: false, stencil: false, powerPreference: "high-performance" });
  const W = (canvas.width = canvas.clientWidth * devicePixelRatio);
  const H = (canvas.height = canvas.clientHeight * devicePixelRatio);
  gl.viewport(0, 0, W, H);

  const vs = `#version 300 es
precision highp float;
in vec2 aPos; in uint aTerm;
uniform mat3 uCam; uniform float uSz;
flat out uint vT;
void main(){ vec3 c=uCam*vec3(aPos,1.); gl_Position=vec4(c.xy,0.,1.); gl_PointSize=uSz; vT=aTerm; }`;
  const fs = `#version 300 es
precision highp float;
flat in uint vT;
uniform sampler2D uPal; uniform float uPN, uSz, uSS;
out vec4 o;
void main(){
  vec2 p=gl_PointCoord*2.-1.; float r=length(p); if(r>1.) discard;
  vec4 c=texture(uPal,vec2((float(vT)+.5)/uPN,.5)); if(c.a<=0.) discard;
  float aa=1.5/max(1.,uSz), om=1.-smoothstep(1.-aa,1.+aa,r);
  float rw=uSS*mix(.18,.35,smoothstep(3.,16.,uSz));
  float im=smoothstep(1.-rw-aa,1.-rw+aa,r);
  float a=om*im*c.a; if(a<=.001) discard;
  o=vec4(c.rgb*a,a);
}`;
  const mk = (t, s) => {
    const sh = gl.createShader(t);
    gl.shaderSource(sh, s);
    gl.compileShader(sh);
    return sh;
  };
  const pg = gl.createProgram();
  gl.attachShader(pg, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(pg, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(pg);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const pb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pb);
  gl.bufferData(gl.ARRAY_BUFFER, data.pos, gl.STATIC_DRAW);
  const pl = gl.getAttribLocation(pg, "aPos");
  gl.enableVertexAttribArray(pl);
  gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
  const tb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tb);
  gl.bufferData(gl.ARRAY_BUFFER, data.idx, gl.STATIC_DRAW);
  const tl = gl.getAttribLocation(pg, "aTerm");
  gl.enableVertexAttribArray(tl);
  gl.vertexAttribIPointer(tl, 1, gl.UNSIGNED_SHORT, 0, 0);
  const pt = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, pt);
  const pd = new Uint8Array(PAL_N * 4);
  PAL.forEach((c, i) => pd.set(c, i * 4));
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, PAL_N, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pd);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindVertexArray(null);
  const uC = gl.getUniformLocation(pg, "uCam"),
    uS = gl.getUniformLocation(pg, "uSz"),
    uSS = gl.getUniformLocation(pg, "uSS"),
    uP = gl.getUniformLocation(pg, "uPal"),
    uPN = gl.getUniformLocation(pg, "uPN");
  const asp = W / H,
    sc = 2 / SPREAD;
  const cam = new Float32Array([sc / asp, 0, 0, 0, -sc, 0, -1 / asp, 1, 1]);

  const gpuMem = data.pos.byteLength + data.idx.byteLength + PAL_N * 4;

  const timerExt = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const useGpuTimer = !!timerExt;
  const pxBuf = new Uint8Array(4);

  return {
    draw() {
      gl.clearColor(0.03, 0.06, 0.1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(pg);
      gl.bindVertexArray(vao);
      gl.uniformMatrix3fv(uC, false, cam);
      gl.uniform1f(uS, 6 * devicePixelRatio);
      gl.uniform1f(uSS, 1);
      gl.uniform1i(uP, 0);
      gl.uniform1f(uPN, PAL_N);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, pt);
      gl.drawArrays(gl.POINTS, 0, data.count);
      gl.bindVertexArray(null);
    },
    fence() {
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pxBuf);
    },
    beginQuery() {
      if (!useGpuTimer) return null;
      const q = gl.createQuery();
      gl.beginQuery(timerExt.TIME_ELAPSED_EXT, q);
      return q;
    },
    endQuery(q) {
      if (!q) return;
      gl.endQuery(timerExt.TIME_ELAPSED_EXT);
    },
    readQuery(q) {
      if (!q) return -1;
      return new Promise(resolve => {
        const poll = () => {
          if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
            const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
            const disjoint = gl.getParameter(timerExt.GPU_DISJOINT_EXT);
            gl.deleteQuery(q);
            resolve(disjoint ? -1 : ns / 1e6);
          } else {
            requestAnimationFrame(poll);
          }
        };
        poll();
      });
    },
    useGpuTimer,
    gl,
    gpuMem,
  };
}

// ═══════════════════════ deck.gl (binary accessor) ═══════════════════════

function initDeck(canvas, data) {
  const positions3 = new Float32Array(data.count * 3);
  for (let i = 0; i < data.count; i++) {
    positions3[i * 3] = data.pos[i * 2];
    positions3[i * 3 + 1] = data.pos[i * 2 + 1];
    positions3[i * 3 + 2] = 0;
  }

  const deck = new Deck({
    canvas,
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    views: new OrthographicView({ id: "ortho" }),
    initialViewState: {
      target: [SPREAD / 2, SPREAD / 2, 0],
      zoom: -Math.log2(SPREAD / Math.min(canvas.clientWidth, canvas.clientHeight)),
    },
    controller: false,
    layers: [],
    useDevicePixels: true,
  });

  const layer = new ScatterplotLayer({
    id: "scatter",
    data: {
      length: data.count,
      attributes: {
        getPosition: { value: positions3, size: 3 },
        getFillColor: { value: data.colors, size: 4 },
      },
    },
    _normalize: false,
    getRadius: 4,
    radiusUnits: "pixels",
    filled: true,
    stroked: true,
    getLineColor: { value: data.colors, size: 4 },
    getLineWidth: 1,
    lineWidthUnits: "pixels",
  });

  const gpuMem = positions3.byteLength + data.colors.byteLength;

  return {
    draw() {
      deck.setProps({ layers: [layer] });
      deck.redraw(true);
    },
    async awaitFrame() {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    },
    destroy() {
      deck.finalize();
    },
    gpuMem,
  };
}

// ═══════════════════════ OpenLayers WebGLVectorLayer ═══════════════════════

function initOL(targetDiv, data) {
  const buildStart = performance.now();
  const features = new Array(data.count);
  for (let i = 0; i < data.count; i++) {
    const c = PAL[data.idx[i]];
    features[i] = new RenderFeature(
      "Point",
      [data.pos[i * 2], data.pos[i * 2 + 1]],
      [2],
      2,
      { r: c[0], g: c[1], b: c[2] },
      i,
    );
  }
  const buildMs = performance.now() - buildStart;

  const source = new VectorSource({ features, wrapX: false });
  const layer = new WebGLVectorLayer({
    source,
    style: {
      "circle-radius": 4,
      "circle-fill-color": ["color", ["get", "r"], ["get", "g"], ["get", "b"], 0.86],
      "circle-stroke-color": ["color", ["get", "r"], ["get", "g"], ["get", "b"], 1],
      "circle-stroke-width": 1,
    },
  });

  const map = new OLMap({
    target: targetDiv,
    layers: [layer],
    view: new View({
      projection: "EPSG:3857",
      center: [SPREAD / 2, SPREAD / 2],
      resolution: SPREAD / targetDiv.clientWidth,
    }),
    controls: [],
    interactions: [],
  });

  const featureMem = data.count * 320;

  return {
    draw() {
      map.renderSync();
    },
    async awaitFrame() {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    },
    destroy() {
      map.setTarget(null);
    },
    buildMs,
    gpuMem: featureMem,
  };
}

// ═══════════════════════ Benchmark harness ═══════════════════════

async function measureOP(renderer, n) {
  if (renderer.useGpuTimer) {
    const results = [];
    for (let i = 0; i < n; i++) {
      const q = renderer.beginQuery();
      renderer.draw();
      renderer.endQuery(q);
      const ms = await renderer.readQuery(q);
      if (ms >= 0) results.push(ms);
    }
    return results;
  }
  const times = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    renderer.draw();
    renderer.fence();
    times.push(performance.now() - t);
  }
  return times;
}

async function measureAsync(renderer, n) {
  const times = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    renderer.draw();
    await renderer.awaitFrame();
    times.push(performance.now() - t);
  }
  return times;
}

function stats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  return { avg, p50, p99 };
}

let running = false;

async function runBench(count) {
  if (running) return;
  running = true;
  document.querySelectorAll("#count-buttons button").forEach(b => (b.disabled = true));

  print(`\n${"━".repeat(60)}`);
  print(`  ${(count / 1e6).toFixed(1)}M points — 3-way benchmark`);
  print(`${"━".repeat(60)}`);

  print("\nGenerating shared synthetic data...");
  const t0 = performance.now();
  const data = gen(count);
  print(`  Done in ${(performance.now() - t0).toFixed(0)} ms  (pos: ${fmtMB(data.pos.byteLength)} MB, colors: ${fmtMB(data.colors.byteLength)} MB)`);

  // ── Open Plant ──
  print("\n▸ Open Plant");
  const cvOP = document.getElementById("cv-op");
  const op = initOP(cvOP, data);
  print(`  GPU timer query: ${op.useGpuTimer ? "available ✓" : "unavailable — using readPixels fence"}`);
  const opUp = performance.now();
  op.draw();
  op.fence();
  const opFirst = performance.now() - opUp;
  print(`  Upload + first draw:  ${fmtMs(opFirst)} ms (CPU wall)`);
  print(`  GPU buffer:           ${fmtMB(op.gpuMem)} MB`);
  print(`  Draw calls:           1`);
  const opTimes = await measureOP(op, 120);
  const opS = stats(opTimes);
  const gpuLabel = op.useGpuTimer ? "GPU time" : "CPU+fence";
  print(`  120 frames (${gpuLabel}) — avg: ${fmtMs(opS.avg)} ms  p50: ${fmtMs(opS.p50)} ms  p99: ${fmtMs(opS.p99)} ms`);

  // ── deck.gl ──
  print("\n▸ deck.gl (binary accessor — no JS objects)");
  const cvDeck = document.getElementById("cv-deck");
  const dkUp = performance.now();
  const dk = initDeck(cvDeck, data);
  const dkInitMs = performance.now() - dkUp;
  print(`  Init + layer build:   ${fmtMs(dkInitMs)} ms`);
  print(`  GPU buffer (est):     ${fmtMB(dk.gpuMem)} MB`);

  const dkFirst0 = performance.now();
  dk.draw();
  await dk.awaitFrame();
  const dkFirst = performance.now() - dkFirst0;
  print(`  First draw:           ${fmtMs(dkFirst)} ms`);

  const dkTimes = await measureAsync(dk, 60);
  const dkS = stats(dkTimes);
  print(`  60 frames — avg: ${fmtMs(dkS.avg)} ms  p50: ${fmtMs(dkS.p50)} ms  p99: ${fmtMs(dkS.p99)} ms`);
  dk.destroy();

  // ── OpenLayers ──
  const includeOL = document.getElementById("cb-ol").checked;
  let olFirst = -1,
    olS = { avg: -1, p50: -1, p99: -1 },
    olBuildMs = -1,
    olGpuMem = 0;
  const olOk = includeOL && await (async () => {
    print("\n▸ OpenLayers WebGLVectorLayer (RenderFeature)");
    const olDiv = document.getElementById("cv-ol");
    olDiv.style.width = olDiv.clientWidth + "px";
    olDiv.style.height = olDiv.clientHeight + "px";

    const olUp = performance.now();
    const ol = initOL(olDiv, data);
    const olInitMs = performance.now() - olUp;
    olBuildMs = ol.buildMs;
    olGpuMem = ol.gpuMem;
    print(`  RenderFeature build:  ${fmtMs(ol.buildMs)} ms  (${count.toLocaleString()} RenderFeatures)`);
    print(`  Map init:             ${fmtMs(olInitMs)} ms`);
    print(`  Feature mem (est):    ~${fmtMB(ol.gpuMem)} MB`);

    const olFirst0 = performance.now();
    ol.draw();
    await ol.awaitFrame();
    olFirst = performance.now() - olFirst0;
    print(`  First render:         ${fmtMs(olFirst)} ms`);

    const olTimes = await measureAsync(ol, 60);
    olS = stats(olTimes);
    print(`  60 frames — avg: ${fmtMs(olS.avg)} ms  p50: ${fmtMs(olS.p50)} ms  p99: ${fmtMs(olS.p99)} ms`);
    ol.destroy();
    return true;
  })().catch(e => {
    print(`  ⚠ OpenLayers failed: ${e.message}`);
    return false;
  });
  if (!includeOL) print("\n▸ OpenLayers — skipped");

  // ── Summary ──
  const olTag = olOk ? "OpenLayers" : "OL (fail)";
  const fmtOl = v => (olOk ? fmtMs(v) : "N/A");

  const W = 62;
  print(`\n┌${"─".repeat(W)}┐`);
  print(`│  ${(count / 1e6).toFixed(1)}M points — Summary${" ".repeat(W - 24 - String((count / 1e6).toFixed(1)).length)}│`);
  print(`├${"─".repeat(W)}┤`);
  print(`│  ${"Metric".padEnd(22)} ${"Open Plant".padEnd(12)} ${"deck.gl".padEnd(12)} ${olTag.padEnd(12)} │`);
  print(`│  ${"─".repeat(22)} ${"─".repeat(12)} ${"─".repeat(12)} ${"─".repeat(12)} │`);
  print(`│  ${"First draw (ms)".padEnd(22)} ${fmtMs(opFirst).padStart(10) + "  "} ${fmtMs(dkFirst).padStart(10) + "  "} ${fmtOl(olFirst).padStart(10) + "  "} │`);
  print(`│  ${"Avg frame (ms)".padEnd(22)} ${fmtMs(opS.avg).padStart(10) + "  "} ${fmtMs(dkS.avg).padStart(10) + "  "} ${fmtOl(olS.avg).padStart(10) + "  "} │`);
  print(`│  ${"p99 frame (ms)".padEnd(22)} ${fmtMs(opS.p99).padStart(10) + "  "} ${fmtMs(dkS.p99).padStart(10) + "  "} ${fmtOl(olS.p99).padStart(10) + "  "} │`);
  print(`│  ${"GPU/obj mem (MB)".padEnd(22)} ${fmtMB(op.gpuMem).padStart(10) + "  "} ${fmtMB(dk.gpuMem).padStart(10) + "  "} ${(olOk ? "~" + fmtMB(olGpuMem) : "N/A").padStart(10) + "  "} │`);
  print(`│  ${"Draw calls".padEnd(22)} ${"1".padStart(10) + "  "} ${"N".padStart(10) + "  "} ${"N".padStart(10) + "  "} │`);
  print(`│  ${"JS objects".padEnd(22)} ${"0".padStart(10) + "  "} ${"0".padStart(10) + "  "} ${(olOk ? count.toLocaleString() : "N/A").padStart(10) + "  "} │`);
  print(`└${"─".repeat(W)}┘`);

  window.__benchResult = {
    count,
    opFirst,
    opAvg: opS.avg,
    opP50: opS.p50,
    opP99: opS.p99,
    dkFirst,
    dkAvg: dkS.avg,
    dkP50: dkS.p50,
    dkP99: dkS.p99,
    olFirst,
    olAvg: olS.avg,
    olP50: olS.p50,
    olP99: olS.p99,
    olBuildMs,
  };
  console.log("__BENCH_DONE__", JSON.stringify(window.__benchResult));

  running = false;
  document.querySelectorAll("#count-buttons button").forEach(b => (b.disabled = false));
}

// ── UI ──
const bc = document.getElementById("count-buttons");
COUNTS.forEach(c => {
  const b = document.createElement("button");
  b.textContent = c >= 1e6 ? `${(c / 1e6).toFixed(0)}M` : `${(c / 1e3).toFixed(0)}K`;
  b.onclick = () => {
    bc.querySelectorAll("button").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    runBench(c);
  };
  bc.appendChild(b);
});

print("3-way point render benchmark: Open Plant vs deck.gl vs OpenLayers");
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
print("• Open Plant:   gl.POINTS single draw + 1D palette texture (same shader as src/wsi)");
print("• deck.gl:      ScatterplotLayer v9 binary accessor (TypedArray, no JS objects)");
print("• OpenLayers:   WebGLVectorLayer v10 with RenderFeature (lightweight, no geom objects)");
print("");
print("OP uses EXT_disjoint_timer_query (GPU time) or readPixels fence. deck.gl / OL use rAF-to-rAF.");
print("Select a point count above to start.\n");

const olCell = document.getElementById("cv-ol").closest(".bench-cell");
document.getElementById("cb-ol").addEventListener("change", e => {
  olCell.style.display = e.target.checked ? "" : "none";
});

const params = new URLSearchParams(location.search);
if (params.has("auto")) {
  const autoCount = parseInt(params.get("auto"), 10) || 1_000_000;
  setTimeout(() => runBench(autoCount), 300);
}
