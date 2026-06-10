/* Neuron-scale view (issue #5): renders REAL reconstructed neurons from NeuroMorpho.org
   (assets/neurons.json, prepped by tools/convert-neurons.mjs) instead of a procedural network.
   Each cell is drawn from its true dendritic/axonal morphology (line segments coloured by SWC
   type), and an action potential is animated as a glow wavefront that propagates outward from the
   soma along the real tree — the distance of every segment from the soma is precomputed (BFS over
   the reconstructed graph) and fed to a small line shader. Faithful to mechanism + to real anatomy.
   Cells: L3 prefrontal pyramidal ×2 (Wearne/Hof) + CA1 hippocampal pyramidal (Turner). */

import * as THREE from '../vendor/three.module.js';

// SWC segment type → base colour (1=soma, 2=axon, 3=basal dendrite, 4=apical dendrite)
const TYPE_COLOR = {
  1: [1.00, 0.90, 0.62],   // soma
  2: [0.96, 0.80, 0.48],   // axon — warm gold (distinct from dendrites)
  3: [0.36, 0.82, 1.00],   // basal dendrite — cyan
  4: [0.60, 0.86, 1.00],   // apical dendrite — lighter blue-cyan
};
const typeColor = (t) => TYPE_COLOR[t] || [0.45, 0.80, 1.00];

function makeLineMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uWave:   { value: -1 },                       // wavefront position (0=soma … 1=tips), <0 = no spike
      uWidth:  { value: 0.13 },                      // wavefront half-width
      uActive: { value: 1 },                         // 1 = firing, lower = resting (dimmer, no glow)
      uGlow:   { value: new THREE.Color(0x9ff2ff) }, // electric action-potential colour
    },
    vertexShader: `
      attribute vec3 baseColor;
      attribute float aDist;
      varying vec3 vCol;
      varying float vDist;
      void main() {
        vCol = baseColor; vDist = aDist;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uWave; uniform float uWidth; uniform float uActive; uniform vec3 uGlow;
      varying vec3 vCol; varying float vDist;
      void main() {
        float d = abs(vDist - uWave);
        float g = uActive * smoothstep(uWidth, 0.0, d);
        float trail = uActive * 0.35 * smoothstep(uWidth * 3.0, 0.0, max(uWave - vDist, 0.0));  // soft afterglow behind the front
        vec3 col = vCol * (0.45 + 0.30 * uActive) + uGlow * (g * 2.4 + trail);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// Build one neuron: line geometry + per-vertex base colour + distance-from-soma, plus a soma marker.
function buildNeuron(nd) {
  const pos = nd.pos, types = nd.type, N = nd.segs;

  // reconstruct the graph: unique points → nodes, segments → edges (coords are already toFixed(3))
  const key = (x, y, z) => x + '_' + y + '_' + z;
  const idOf = new Map(); const nodePos = [];
  const node = (x, y, z) => { const k = key(x, y, z); let id = idOf.get(k); if (id === undefined) { id = nodePos.length / 3; idOf.set(k, id); nodePos.push(x, y, z); } return id; };
  const adj = []; const segNode = new Array(N);
  for (let i = 0; i < N; i++) {
    const cx = pos[6*i], cy = pos[6*i+1], cz = pos[6*i+2], px = pos[6*i+3], py = pos[6*i+4], pz = pos[6*i+5];
    const a = node(cx, cy, cz), b = node(px, py, pz);
    const len = Math.hypot(cx-px, cy-py, cz-pz);
    segNode[i] = [a, b];
    (adj[a] || (adj[a] = [])).push([b, len]);
    (adj[b] || (adj[b] = [])).push([a, len]);
  }
  const NC = nodePos.length / 3;

  // soma = highest-degree node (the hub where primary dendrites + axon meet)
  let soma = 0, deg = -1;
  for (let n = 0; n < NC; n++) { const d = adj[n] ? adj[n].length : 0; if (d > deg) { deg = d; soma = n; } }

  // BFS path-distance from soma along the tree (edge weight = segment length)
  const dist = new Float32Array(NC).fill(-1); dist[soma] = 0;
  const q = [soma]; let qh = 0;
  while (qh < q.length) { const u = q[qh++]; for (const [v, len] of (adj[u] || [])) if (dist[v] < 0) { dist[v] = dist[u] + len; q.push(v); } }
  let maxD = 0; for (let n = 0; n < NC; n++) if (dist[n] > maxD) maxD = dist[n]; if (maxD <= 0) maxD = 1;

  // geometry: 2 verts/segment with position, base colour (by type) and normalized soma-distance
  const P = new Float32Array(N*6), C = new Float32Array(N*6), D = new Float32Array(N*2);
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 6; k++) P[6*i+k] = pos[6*i+k];
    const col = typeColor(types[i]);
    for (let v = 0; v < 2; v++) { C[6*i+v*3] = col[0]; C[6*i+v*3+1] = col[1]; C[6*i+v*3+2] = col[2]; }
    const [a, b] = segNode[i];
    D[2*i]   = dist[a] >= 0 ? dist[a] / maxD : 1;
    D[2*i+1] = dist[b] >= 0 ? dist[b] / maxD : 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('baseColor', new THREE.BufferAttribute(C, 3));
  geo.setAttribute('aDist', new THREE.BufferAttribute(D, 1));

  const mat = makeLineMaterial();
  const g = new THREE.Group();
  g.add(new THREE.LineSegments(geo, mat));
  const somaMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff0c0 })
  );
  somaMesh.position.set(nodePos[soma*3], nodePos[soma*3+1], nodePos[soma*3+2]);
  g.add(somaMesh);
  return { g, mat, somaMesh };
}

export function createNeurons() {
  const group = new THREE.Group();
  group.visible = false;

  let activity = 'thought';            // 'idle' | 'fire' | 'thought'
  const cells = [];                    // { mat, somaMesh, clock }

  // layout: spread the cells across the neuron-cam view (camera at z≈2.35 looking down -Z)
  const LAYOUT = [
    { x: -1.45, y: 0.05, z: 0.0,  rotY:  0.5, scale: 0.82 },
    { x:  0.05, y: -0.02, z: 0.25, rotY: -0.4, scale: 0.92 },
    { x:  1.5,  y: 0.02, z: -0.1, rotY:  0.3, scale: 0.82 },
  ];

  fetch(new URL('../assets/neurons.json', import.meta.url)).then(r => r.json()).then(data => {
    (data.neurons || []).forEach((nd, idx) => {
      const { g, mat, somaMesh } = buildNeuron(nd);
      const L = LAYOUT[idx] || { x: (idx-1)*1.5, y: 0, z: 0, rotY: 0, scale: 0.85 };
      g.position.set(L.x, L.y, L.z);
      g.rotation.y = L.rotY;
      g.scale.setScalar(L.scale);
      group.add(g);
      cells.push({ mat, somaMesh, clock: idx * 0.37 });   // phase-offset so cells don't fire in lock-step
    });
  }).catch(e => console.warn('neurons.json failed to load', e));

  function setActivity(mode) { activity = mode; }

  function update(dt) {
    if (!cells.length) return;
    dt = Math.min(dt, 0.05);
    const active = activity !== 'idle';
    const rate = activity === 'thought' ? 0.85 : activity === 'fire' ? 0.42 : 0;   // APs/sec-ish
    for (const c of cells) {
      c.clock = (c.clock + dt * rate) % 1;
      const w = active ? c.clock * 1.15 : -1;       // wavefront sweeps soma→tips then resets
      c.mat.uniforms.uWave.value = w;
      c.mat.uniforms.uActive.value = active ? 1 : 0.42;
      const pulse = active ? Math.max(0, 1 - Math.abs(c.clock - 0.02) * 9) : 0;   // soma flashes as the AP initiates
      c.somaMesh.scale.setScalar(1 + pulse * 0.8);
    }
  }

  return { group, update, setActivity };
}
