/* NeuroExplorer — orchestrator: scene, camera, picking, UI wiring, mode routing. */

import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { createBrain } from './cortex.js';
import { createRealisticBrain } from './realistic.js';
import { createPhotorealBrain } from './photoreal.js';
import { createProBrain } from './propack.js';
import { createSubcortical } from './subcortical.js';
import { createNeurons } from './neurons.js';
import { REGIONS, SUBCORTICAL, DISEASES, SENSES, LIFESPAN, DK_INFO, DK_LOBES, EXT_LOBE_NAMES } from './data.js';

/* ---------- renderer / scene ---------- */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;   // cross-section / slice plane (issue #18)
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// soft "studio" backdrop: a radial glow behind the brain, fading to the dark theme
scene.background = (() => {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(256, 232, 30, 256, 300, 380);
  g.addColorStop(0, '#1d2742'); g.addColorStop(0.55, '#0e1322'); g.addColorStop(1, '#070a12');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 100);

const DEFAULT_CAM = { pos: [3.0, 0.38, 0.72], tgt: [0, -0.02, 0] };   // lateral 3/4 (shows the classic profile)
const NEURON_CAM  = { pos: [0, 0, 2.35], tgt: [0, 0, 0] };

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.0;
controls.maxDistance = 7;
controls.autoRotateSpeed = 0.5;
function setCamera(pose) {
  camera.position.set(...pose.pos);
  controls.target.set(...pose.tgt);
  controls.update();
}
setCamera(DEFAULT_CAM);

/* ---------- smooth camera focus (issue #17: click-to-focus + search) ---------- */
let camAnim = null;
const _focusDir = new THREE.Vector3();
function focusOn(point, { dist } = {}) {
  if (!point || fly.on || state.mode === 'neurons') return;
  _focusDir.copy(camera.position).sub(controls.target);
  const cur = _focusDir.length() || 2.4;
  _focusDir.normalize();
  const d = dist != null ? dist : Math.min(2.2, Math.max(1.5, cur));   // recenter + gentle zoom, keep viewing angle
  camAnim = {
    p0: camera.position.clone(), t0: controls.target.clone(),
    p1: point.clone().addScaledVector(_focusDir, d), t1: point.clone(),
    t: 0, dur: 0.6,
  };
}
function stepCamAnim(dt) {
  const a = camAnim; a.t = Math.min(1, a.t + dt / a.dur);
  const k = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2;   // easeInOutQuad
  camera.position.lerpVectors(a.p0, a.p1, k);
  controls.target.lerpVectors(a.t0, a.t1, k);
  if (a.t >= 1) camAnim = null;
}
controls.addEventListener('start', () => { camAnim = null; });   // a manual grab cancels the fly-to

/* ---------- lighting ---------- */
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x20160f, 0.45));
const key = new THREE.DirectionalLight(0xffffff, 0.95); key.position.set(2.5, 3, 2.5); scene.add(key);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 0.5; key.shadow.camera.far = 14;
key.shadow.camera.left = -2.4; key.shadow.camera.right = 2.4;
key.shadow.camera.top = 2.4; key.shadow.camera.bottom = -2.4;
key.shadow.bias = -0.0009; key.shadow.radius = 7;   // soft edges
const fill = new THREE.DirectionalLight(0x88aaff, 0.25); fill.position.set(-3, 0.5, -1.5); scene.add(fill);
const rim = new THREE.DirectionalLight(0xff6db5, 0.45); rim.position.set(-1, -1.5, -3); scene.add(rim);
scene.add(new THREE.AmbientLight(0x2a3450, 0.25));

/* soft image-based environment → wet, realistic sheen on the brain surface */
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

/* ---------- brain + layers (swappable cortex source) ---------- */
const proceduralBrain = createBrain();
let realisticBrain = null;               // lazily loaded on first use
let photorealBrain = null;               // lazily loaded artist GLB (if assets/photoreal.glb present)
let proBrain = null;                      // lazily loaded CGTrader Pro pack (primary)
let maxRes = false;                       // 4K textures for the Pro model (power users)
let brain = proceduralBrain;             // the active source — all brain.* calls follow this
let source = 'procedural';
scene.add(proceduralBrain.group);
const sub = createSubcortical();
const overlays = new THREE.Group();      // markers, pathways, pulses (reparented to active brain)
brain.group.add(sub.group);
brain.group.add(overlays);
const neurons = createNeurons();
scene.add(neurons.group);

// soft contact shadow on an (otherwise invisible) ground plane below the brain
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 12),
  new THREE.ShadowMaterial({ opacity: 0.34 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.92;
ground.receiveShadow = true;
scene.add(ground);

function enableShadows(b) { [b.cortex, b.cerebellum, b.brainstem].forEach(m => { if (m) m.castShadow = true; }); }
enableShadows(proceduralBrain);

/* ---------- state ---------- */
const state = {
  mode: 'anatomy', age: 25, sex: 'female',
  colorMode: 'lobes', deep: false,
  selected: null, disease: null, sense: null,
  sensePath: null, diseasePulse: null,
};
function sexFactor(s) { return s === 'male' ? 1 : s === 'female' ? -1 : 0; }
function ventricleFactorForAge(age) { return 1 + Math.max(0, (age - 40) / 50) * 0.8; }

/* ---------- DOM refs ---------- */
const $ = s => document.querySelector(s);
const tooltip = $('#tooltip'), leftContent = $('#left-content');
const rightDock = $('#rightdock'), detailContent = $('#detail-content');

/* ---------- overlay helpers ---------- */
function clearOverlays() {
  for (const o of [...overlays.children]) { overlays.remove(o); o.geometry?.dispose?.(); o.material?.dispose?.(); }
}
function glowSphere(pos, size, color, opacity = 0.85, additive = false) {
  const g = new THREE.IcosahedronGeometry(size, 3);
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false });
  const mesh = new THREE.Mesh(g, m); mesh.position.set(...pos); return mesh;
}

/* ---------- picking ---------- */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoverKey = null;

function pickTargets() {
  const t = [...brain.pickables];
  if (sub.group.visible) t.push(...sub.pickables);
  return t;
}
function pickAt(cx, cy) {
  pointer.x = (cx / innerWidth) * 2 - 1;
  pointer.y = -(cy / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickTargets(), false);
  if (!hits.length) return null;
  return { key: brain.regionFromIntersection(hits[0]), point: hits[0].point };
}
const prettyDK = s => (s || '').charAt(0).toUpperCase() + (s || '').slice(1);
function infoFor(k) {
  if (!k) return null;
  if (REGIONS[k]) return { name: REGIONS[k].name };
  if (SUBCORTICAL[k]) return { name: SUBCORTICAL[k].name };
  if (DK_INFO[k]) return { name: DK_INFO[k].name };
  if (DK_LOBES[k] && DK_LOBES[k] !== 'other') return { name: prettyDK(k) };
  return null;
}

renderer.domElement.addEventListener('pointermove', (e) => {
  if (state.mode === 'neurons' || fly.on) { tooltip.hidden = true; return; }
  if (downXY) { tooltip.hidden = true; return; }   // skip both raycasts while dragging (orbit) — perf (#20)
  if (connGroup.visible && !quiz.on) {   // tracts/vessels hover (#20); suppressed mid-quiz
    const cc = pickConn(e.clientX, e.clientY);
    if (cc) { hoverKey = null; brain.setHover(null); renderer.domElement.style.cursor = 'pointer';
      tooltip.hidden = false; tooltip.innerHTML = `${cc.object.userData.name}<span class="tip-sub">click for details</span>`;
      tooltip.style.left = e.clientX + 'px'; tooltip.style.top = e.clientY + 'px'; return; }
  }
  const hit = pickAt(e.clientX, e.clientY);
  const k = hit && hit.key;
  if (k !== hoverKey) {
    hoverKey = k;
    brain.setHover(k || null);
    renderer.domElement.style.cursor = (k && infoFor(k)) ? 'pointer' : 'grab';
  }
  const info = infoFor(k);
  if (info) {
    tooltip.hidden = false;
    tooltip.innerHTML = `${info.name}<span class="tip-sub">click to explore</span>`;
    tooltip.style.left = e.clientX + 'px'; tooltip.style.top = e.clientY + 'px';
  } else tooltip.hidden = true;
});
renderer.domElement.addEventListener('pointerleave', () => { tooltip.hidden = true; });

let downXY = null;
renderer.domElement.addEventListener('pointerdown', e => { downXY = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downXY) return;
  const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]); downXY = null;
  if (moved > 6 || state.mode === 'neurons' || fly.on) return;
  if (quiz.on) { const hit = pickAt(e.clientX, e.clientY); if (hit && hit.key && !quiz.answered) answerQuiz(hit.key); return; }   // quiz answer takes priority over overlays (#19)
  const c = pickConn(e.clientX, e.clientY);
  if (c) { showConnInfo(c.object.userData); focusOn(c.point); return; }   // tracts/vessels click (#20)
  const hit = pickAt(e.clientX, e.clientY);
  if (hit && hit.key) { selectStructure(hit.key); if (state.mode === 'anatomy' || state.mode === 'lifespan') focusOn(hit.point); }   // click-to-focus (#17)
});

/* ---------- detail panel ---------- */
function selectStructure(k) {
  if (brain.isPhotoreal && !brain.hasRegions) {
    detailContent.innerHTML = `
      <div class="detail-eyebrow">Photoreal model</div>
      <div class="detail-title">${k || 'Brain'}</div>
      <div class="detail-sub">Artist-sculpted anatomy</div>
      <div class="detail-body"><p>This model is here for visual realism. Switch to the <b>Realistic</b> model to click individual functional regions (Desikan-Killiany).</p></div>
      <div class="cite">Photoreal GLB · see tools/PREP.md for source &amp; licence.</div>`;
    rightDock.hidden = false;
    return;
  }
  const r = REGIONS[k];
  if (r) {
    state.selected = k; brain.setSelected(k);
    detailContent.innerHTML = `
      <div class="detail-eyebrow">Brain region</div>
      <div class="detail-title">${r.name}</div>
      <div class="detail-sub">${r.sub}</div>
      <div class="detail-body"><p>${r.body}</p></div>
      <div class="detail-section"><h3>What it does</h3>
        <div class="chips">${r.functions.map(f => `<span class="chip">${f}</span>`).join('')}</div></div>
      <div class="detail-section">${r.facts.map(([a, b]) => `<div class="factline"><span>${a}</span><span>${b}</span></div>`).join('')}</div>
      <div class="cite">${r.cite}</div>`;
    rightDock.hidden = false;
    return;
  }
  const s = SUBCORTICAL[k];
  if (s) {
    detailContent.innerHTML = `
      <div class="detail-eyebrow">Deep structure</div>
      <div class="detail-title">${s.name}</div>
      <div class="detail-sub">${s.sub}</div>
      <div class="cite">Toggle <b>Deep structures</b> to keep these visible. Educational model.</div>`;
    rightDock.hidden = false;
    return;
  }
  // real cortex (Desikan-Killiany) region
  if (DK_LOBES[k]) {
    if (DK_LOBES[k] === 'other') return;       // medial wall — not informative
    state.selected = k; brain.setSelected(k);
    const info = DK_INFO[k], lobe = EXT_LOBE_NAMES[DK_LOBES[k]] || DK_LOBES[k];
    detailContent.innerHTML = `
      <div class="detail-eyebrow">Cortical region · Desikan-Killiany</div>
      <div class="detail-title">${info ? info.name : prettyDK(k)}</div>
      <div class="detail-sub">${info ? info.tag : lobe}</div>
      <div class="detail-body"><p>${info ? info.body : `Part of the ${lobe}.`}</p></div>
      <div class="detail-section"><div class="factline"><span>Lobe</span><span>${lobe}</span></div></div>
      <div class="cite">FreeSurfer Desikan-Killiany atlas on fsaverage (Desikan 2006; Fischl 1999).</div>`;
    rightDock.hidden = false;
  }
}
$('#detail-close').addEventListener('click', () => {
  rightDock.hidden = true; state.selected = null; brain.setSelected(null);
});

/* ---------- click-to-focus + region search (issue #17) ---------- */
function focusKey(key) {                                   // → world-space point to frame, or null
  if (brain.centroidOf) { const p = brain.centroidOf(key); if (p) return p; }
  if (sub.byKey && sub.byKey[key]) { sub.group.updateWorldMatrix(true, false); return sub.group.localToWorld(sub.getCenter(key)); }
  if (brain.regionCenters && brain.regionCenters[key] && brain.cortex) { brain.cortex.updateWorldMatrix(true, false); return brain.cortex.localToWorld(brain.regionCenters[key].clone()); }   // procedural-fallback lobes
  return null;
}
function selectAndFocus(key) {
  if (SUBCORTICAL[key]) {                                  // a deep structure → reveal it first
    if (!state.deep) { state.deep = true; const tb = $('#t-deep'); if (tb) tb.classList.add('is-on'); }
    if (state.mode === 'anatomy' || state.mode === 'lifespan') applyBaseView();
    sub.setVisible(true); sub.showAll(); sub.highlight(key, true);
  }
  selectStructure(key);
  focusOn(focusKey(key));
}
const SEARCH_INDEX = [
  ...Object.entries(REGIONS).map(([k, r]) => ({ key: k, name: r.name, sub: r.sub, color: r.color, group: 'Lobe' })),
  ...Object.entries(DK_INFO).filter(([k]) => DK_LOBES[k] && DK_LOBES[k] !== 'other')
      .map(([k, d]) => ({ key: k, name: d.name, sub: EXT_LOBE_NAMES[DK_LOBES[k]] || d.tag || 'Cortex', group: 'Cortical region' })),
  ...Object.entries(SUBCORTICAL).map(([k, s]) => ({ key: k, name: s.name, sub: s.sub, group: 'Deep structure' })),
];
const cssGroup = g => g === 'Deep structure' ? 'deep' : g === 'Cortical region' ? 'ctx' : 'lobe';
const escHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function renderSearchList(q) {
  const s = (q || '').trim().toLowerCase();
  const items = SEARCH_INDEX.filter(it => !s || it.name.toLowerCase().includes(s) || (it.sub || '').toLowerCase().includes(s) || it.group.toLowerCase().includes(s));
  if (!items.length) return `<p class="hint" style="opacity:.7">No match for “${escHtml(q)}”.</p>`;
  return items.map(it => `<button class="list-item" data-key="${it.key}">${it.color != null ? colorDot(it.color) : `<span class="dot dot-${cssGroup(it.group)}"></span>`}<span><span class="li-main">${it.name}</span><span class="li-sub">${it.sub} · ${it.group}</span></span></button>`).join('');
}
function wireAnatomyList() {
  leftContent.querySelectorAll('#anatomy-list [data-key]').forEach(b => b.addEventListener('click', () => selectAndFocus(b.dataset.key)));
}

/* ---------- base view (anatomy / lifespan) ---------- */
function applyBaseView() {
  brain.setAffected(null);
  brain.setSelected(state.selected);
  sub.setParkinsons(false);
  sub.setVentricleScale(ventricleFactorForAge(state.age));
  brain.setGhost(state.deep);
  sub.setVisible(state.deep);
  if (state.deep) sub.showAll();
  state.sensePath = null; state.diseasePulse = null;
  clearOverlays();
}

/* ---------- DISEASE ---------- */
function selectDisease(k) {
  state.disease = k; state.sense = null;
  leftContent.querySelectorAll('[data-disease]').forEach(b => b.classList.toggle('is-active', b.dataset.disease === k));
  clearOverlays();
  const d = DISEASES[k];
  brain.setSelected(null); state.selected = null;
  brain.setAffected(d.affectedLobes || []);

  const deepKeys = new Set(d.deep || []);
  if (d.ventricleScale) deepKeys.add('ventricles');
  const showDeep = deepKeys.size > 0;
  brain.setGhost(!!d.ghost || showDeep);
  if (showDeep) {
    sub.showOnly([...deepKeys]); sub.setVisible(true);
    (d.deep || []).forEach(key => sub.highlight(key, true));
  } else { sub.setVisible(false); }
  sub.setParkinsons(!!d.parkinsons);
  sub.setVentricleScale(d.ventricleScale || ventricleFactorForAge(state.age));

  (d.markers || []).forEach(m => overlays.add(glowSphere(m.pos, m.size, m.color, 0.8)));

  // epilepsy: pulsing seizure focus
  if (d.pulse) {
    const focus = glowSphere([0.42, -0.12, 0.0], 0.24, d.color, 0.35, true);
    overlays.add(focus);
    const pulseMeshes = [focus, ...((d.deep || []).flatMap(key => sub.byKey[key]?.objects || []))];
    state.diseasePulse = { meshes: pulseMeshes, focus };
  } else state.diseasePulse = null;

  detailContent.innerHTML = `
    <div class="detail-eyebrow" style="color:#${d.color.toString(16).padStart(6,'0')}">Disease / injury</div>
    <div class="detail-title">${d.name}</div>
    <div class="detail-sub">${d.sub}</div>
    <div class="detail-body"><p>${d.body}</p></div>
    <div class="detail-section"><h3>Common symptoms</h3>
      <div class="chips">${d.symptoms.map(s => `<span class="chip warn">${s}</span>`).join('')}</div></div>
    <div class="detail-section"><h3>Areas affected</h3>
      ${d.areas.map(a => `<div class="factline"><span>•</span><span style="text-align:left;flex:1">${a}</span></div>`).join('')}</div>
    <div class="cite">${d.cite}</div>`;
  rightDock.hidden = false;
}

/* ---------- SENSES ---------- */
function selectSense(k) {
  state.sense = k; state.disease = null;
  leftContent.querySelectorAll('[data-sense]').forEach(b => b.classList.toggle('is-active', b.dataset.sense === k));
  clearOverlays();
  brain.setAffected(null);
  const s = SENSES[k];
  brain.setGhost(true);
  sub.showOnly(['thalamus']); sub.setVisible(true);
  brain.setSelected(s.dest); state.selected = null;

  const curve = new THREE.CatmullRomCurve3(s.path.map(p => new THREE.Vector3(...p)));
  const tubeGeo = new THREE.TubeGeometry(curve, 90, 0.013, 8, false);
  const tube = new THREE.Mesh(tubeGeo, new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  overlays.add(tube);
  overlays.add(glowSphere(s.path[0], 0.045, s.color, 0.9, true));                       // sense organ
  overlays.add(glowSphere(s.path[s.path.length - 1], 0.05, s.color, 0.8, true));         // cortical target
  const sig = glowSphere([0, 0, 0], 0.035, 0xffffff, 1, true); overlays.add(sig);
  state.sensePath = { curve, sig, t: 0, speed: 0.22 };

  detailContent.innerHTML = `
    <div class="detail-eyebrow" style="color:#${s.color.toString(16).padStart(6,'0')}">Sensory pathway</div>
    <div class="detail-title">${s.name}</div>
    <div class="detail-sub">${s.sub}</div>
    <div class="detail-body"><p>${s.body}</p></div>
    <div class="detail-section">
      <div class="factline"><span>Thalamic relay</span><span>${s.relay}</span></div>
      <div class="factline"><span>Destination</span><span>${s.destArea}</span></div>
    </div>
    <div class="cite">${s.cite}</div>`;
  rightDock.hidden = false;
}

/* ---------- left dock per mode ---------- */
function colorDot(hex) { return `<span class="dot" style="color:#${hex.toString(16).padStart(6, '0')}"></span>`; }

function renderLeftDock() {
  const m = state.mode;
  if (m === 'anatomy') {
    leftContent.innerHTML = `<h2>Anatomy</h2>
      <div class="search-wrap"><span class="search-ico">🔍</span><input id="region-search" type="search" placeholder="Search regions…  ( press / )" autocomplete="off" spellcheck="false" /></div>
      <div class="tour-row"><button class="tour-btn" id="btn-tour">▶ Guided tour</button><button class="tour-btn" id="btn-quiz">❓ Quiz me</button></div>
      <p class="hint">Drag to rotate · scroll to zoom. <b>Click any region</b> — on the brain or in the list — to focus it &amp; learn what it does.</p>
      <div class="list" id="anatomy-list">${renderSearchList('')}</div>`;
    wireAnatomyList();
    leftContent.querySelector('#btn-tour').addEventListener('click', startTour);
    leftContent.querySelector('#btn-quiz').addEventListener('click', startQuiz);
    const si = leftContent.querySelector('#region-search');
    si.addEventListener('input', () => { leftContent.querySelector('#anatomy-list').innerHTML = renderSearchList(si.value); wireAnatomyList(); });
    si.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const f = leftContent.querySelector('#anatomy-list .list-item'); if (f) selectAndFocus(f.dataset.key); } });
  } else if (m === 'lifespan') {
    renderLifespanPanel();
  } else if (m === 'disease') {
    leftContent.innerHTML = `<h2>Disease & Injury</h2>
      <p class="hint">Select a condition to see the structures it affects and the functions it disrupts.</p>
      <div class="list">${Object.entries(DISEASES).map(([k, d]) =>
        `<button class="list-item" data-disease="${k}">${colorDot(d.color)}<span><span class="li-main">${d.name}</span><span class="li-sub">${d.sub}</span></span></button>`).join('')}</div>`;
    leftContent.querySelectorAll('[data-disease]').forEach(b => b.addEventListener('click', () => selectDisease(b.dataset.disease)));
  } else if (m === 'senses') {
    leftContent.innerHTML = `<h2>Senses</h2>
      <p class="hint">Watch a signal travel from the sense organ, through its relay, to where it lands in the cortex.</p>
      <div class="list">${Object.entries(SENSES).map(([k, s]) =>
        `<button class="list-item" data-sense="${k}">${colorDot(s.color)}<span><span class="li-main">${s.name}</span><span class="li-sub">${s.sub}</span></span></button>`).join('')}</div>`;
    leftContent.querySelectorAll('[data-sense]').forEach(b => b.addEventListener('click', () => selectSense(b.dataset.sense)));
  } else if (m === 'neurons') {
    leftContent.innerHTML = `<h2>Neurons</h2>
      <p class="hint">A zoom into the cortex showing <b>real reconstructed neurons</b>. Each fires an electrical <b>action potential</b> that sweeps from the cell body out along its branches. Billions firing together are your thoughts.</p>
      <div class="detail-section"><h3>Activity</h3>
        <div class="segmented" id="neuron-activity">
          <button data-act="idle">Resting</button>
          <button data-act="fire">Firing</button>
          <button data-act="thought" class="is-active">Thinking</button>
        </div></div>
      <div class="detail-section">
        <div class="factline"><span>Pale spheres</span><span>Cell bodies (somas)</span></div>
        <div class="factline"><span>Cyan branches</span><span>Dendrites — inputs</span></div>
        <div class="factline"><span>Gold strands</span><span>Axon — output</span></div>
        <div class="factline"><span>Bright wave</span><span>Action potential</span></div>
      </div>
      <div class="cite">Real morphologies from NeuroMorpho.Org — L3 prefrontal pyramidal (Wearne/Hof) ×2 and CA1 hippocampal pyramidal (Turner). Cells enlarged & not to scale.</div>`;
    leftContent.querySelectorAll('#neuron-activity button').forEach(b => b.addEventListener('click', () => {
      leftContent.querySelectorAll('#neuron-activity button').forEach(x => x.classList.toggle('is-active', x === b));
      neurons.setActivity(b.dataset.act);
    }));
  }
}

function lifespanStage(age) { return LIFESPAN.stages.find(s => age <= s.max) || LIFESPAN.stages.at(-1); }
function renderLifespanPanel() {
  const st = lifespanStage(state.age);
  leftContent.innerHTML = `<h2>Lifespan & Sex</h2>
    <p class="hint">Drag the <b>Age</b> slider and switch <b>Sex</b> below to morph the brain. Values are population averages.</p>
    <div class="detail-section"><h3>${st.label} · age ${state.age}</h3><div class="detail-body"><p>${st.note}</p></div></div>
    <div class="detail-section"><h3>Average sex difference</h3><div class="detail-body"><p style="font-size:12.5px">${LIFESPAN.sex}</p></div></div>
    <div class="cite">${LIFESPAN.cite}</div>`;
}

/* ---------- mode switching ---------- */
function setMode(mode) {
  if (fly.on) setFly(false);            // leave fly-inside when switching modes
  if (slice.on) setSlice(false);        // leave cross-section when switching modes
  if (tour.on) tourEnd(); if (quiz.on) quizEnd();   // leave tour/quiz when switching modes (#19)
  const prev = state.mode;
  state.mode = mode;
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('is-active', t.dataset.mode === mode));
  controls.autoRotate = false;
  tooltip.hidden = true;
  rightDock.hidden = true; state.selected = null; brain.setSelected(null);   // close detail panel on mode change
  // reset transient visuals
  state.disease = null; state.sense = null; state.sensePath = null; state.diseasePulse = null;
  clearOverlays();

  const neuronMode = mode === 'neurons';
  brain.group.visible = !neuronMode;
  neurons.group.visible = neuronMode;

  if (neuronMode) {
    setCamera(NEURON_CAM);
    controls.autoRotate = true;
    neurons.setActivity('thought');
    rightDock.hidden = true;
  } else {
    if (prev === 'neurons') setCamera(DEFAULT_CAM);
    if (mode === 'anatomy' || mode === 'lifespan') applyBaseView();
    else if (mode === 'disease') { brain.setGhost(false); sub.setVisible(false); brain.setAffected(null); }
    else if (mode === 'senses') { brain.setGhost(false); sub.setVisible(false); }
  }
  // tracts/vessels are anatomy/lifespan tools — turn them off when leaving, re-sync (+re-ghost) when staying (#20)
  if (mode !== 'anatomy' && mode !== 'lifespan') { if (conn.tracts) setTracts(false); if (conn.vessels) setVessels(false); }
  else if (connBuilt) _connSync();
  renderLeftDock();
}
document.querySelectorAll('.mode-tab').forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));

/* ---------- bottom dock ---------- */
const ageEl = $('#age'), ageOut = $('#age-readout');
function updateAgeFill() { ageEl.style.setProperty('--fill', (ageEl.value / ageEl.max * 100) + '%'); }
function applyAgeSex() {
  brain.applyLifespan(state.age, sexFactor(state.sex));
  if (!state.disease) sub.setVentricleScale(ventricleFactorForAge(state.age));
  if (state.mode === 'lifespan') renderLifespanPanel();
  if (slice.on) updateSlicePlane();   // the brain just re-scaled — keep the cut at the same anatomical depth (#18)
}
ageEl.addEventListener('input', () => {
  state.age = +ageEl.value; ageOut.textContent = state.age + ' yrs'; updateAgeFill(); applyAgeSex();
});
document.querySelectorAll('#sex button').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('#sex button').forEach(b => b.classList.toggle('is-active', b === btn));
  state.sex = btn.dataset.sex; applyAgeSex();
}));

$('#t-color').addEventListener('click', (e) => {
  state.colorMode = state.colorMode === 'lobes' ? 'realistic' : 'lobes';
  brain.setColorMode(state.colorMode);
  e.currentTarget.classList.toggle('is-on', state.colorMode === 'realistic');
  e.currentTarget.textContent = state.colorMode === 'realistic' ? 'Realistic' : 'Lobe colors';
});
$('#t-deep').addEventListener('click', (e) => {
  if (state.mode !== 'anatomy' && state.mode !== 'lifespan') return;   // deep structures are an anatomy/lifespan toggle (#19 review)
  state.deep = !state.deep;
  e.currentTarget.classList.toggle('is-on', state.deep);
  applyBaseView();
});
$('#t-maxres').addEventListener('click', (e) => {
  maxRes = !maxRes;
  e.currentTarget.classList.toggle('is-on', maxRes);
  if (brain.setTier) { busy(true, maxRes ? 'Loading 4K textures…' : 'Loading 2K textures…'); brain.setTier(maxRes ? '4k' : '2k'); setTimeout(() => busy(false), 1400); }
  else { busy(true, 'Max res applies to the Pro model.'); setTimeout(() => busy(false), 2000); }
});
$('#t-reset').addEventListener('click', () => { if (fly.on) setFly(false); setCamera(state.mode === 'neurons' ? NEURON_CAM : DEFAULT_CAM); });

/* ---------- fly-inside mode (issue #15): free-fly camera to move into the brain's depths ---------- */
const fly = { on: false, keys: new Set(), yaw: 0, pitch: 0, drag: false, px: 0, py: 0, speed: 0.7 };
const _flyFwd = new THREE.Vector3(), _flyRgt = new THREE.Vector3(), _flyUp = new THREE.Vector3(0, 1, 0), _flyMv = new THREE.Vector3();
function flyUpdate(dt) {
  camera.quaternion.setFromEuler(new THREE.Euler(fly.pitch, fly.yaw, 0, 'YXZ'));
  _flyFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  _flyRgt.set(1, 0, 0).applyQuaternion(camera.quaternion);
  _flyMv.set(0, 0, 0);
  const k = fly.keys;
  if (k.has('w') || k.has('arrowup'))    _flyMv.add(_flyFwd);
  if (k.has('s') || k.has('arrowdown'))  _flyMv.sub(_flyFwd);
  if (k.has('d') || k.has('arrowright')) _flyMv.add(_flyRgt);
  if (k.has('a') || k.has('arrowleft'))  _flyMv.sub(_flyRgt);
  if (k.has('e') || k.has(' '))          _flyMv.add(_flyUp);
  if (k.has('q'))                        _flyMv.sub(_flyUp);
  if (_flyMv.lengthSq() > 0) camera.position.addScaledVector(_flyMv.normalize(), fly.speed * (k.has('shift') ? 2.5 : 1) * dt);
}
function setFly(on) {
  if (fly.on === on) return;
  camAnim = null;                       // cancel any pending focus tween, else it snaps the camera on fly exit (#17/#15)
  fly.on = on;
  controls.enabled = !on;
  if (brain.setInterior) brain.setInterior(on);         // render inner walls while inside
  renderer.domElement.style.cursor = on ? 'move' : 'grab';
  const btn = $('#t-fly'); if (btn) btn.classList.toggle('is-on', on);
  if (on) {
    if (slice.on) setSlice(false);       // fly + section don't mix (both drive interior rendering)
    controls.autoRotate = false;
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    fly.yaw = e.y; fly.pitch = e.x; fly.keys.clear();
    busy(true, 'Fly: W A S D move · Q / E down·up · Shift = boost · drag to look · scroll = speed · Esc exits');
    setTimeout(() => busy(false), 5000);
  } else {
    fly.keys.clear(); fly.drag = false;
    _flyFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);   // hand back to orbit aiming just ahead
    controls.target.copy(camera.position).addScaledVector(_flyFwd, 1.2);
    controls.update();
  }
}
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && fly.on) { setFly(false); return; }
  if (!fly.on) return;
  const key = e.key.toLowerCase();
  fly.keys.add(key);
  if (key === ' ' || key.startsWith('arrow')) e.preventDefault();
});
addEventListener('keyup', (e) => fly.keys.delete(e.key.toLowerCase()));
addEventListener('keydown', (e) => {                       // "/" jumps to region search (issue #17)
  if (e.key !== '/' || fly.on) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  e.preventDefault();
  if (state.mode !== 'anatomy') setMode('anatomy');
  const si = document.getElementById('region-search'); if (si) { si.focus(); si.select(); }
});
addEventListener('pointermove', (e) => {
  if (fly.on && fly.drag) {
    fly.yaw   -= (e.clientX - fly.px) * 0.0026;
    fly.pitch  = Math.max(-1.5, Math.min(1.5, fly.pitch - (e.clientY - fly.py) * 0.0026));
    fly.px = e.clientX; fly.py = e.clientY;
  }
});
addEventListener('pointerup', () => { fly.drag = false; });
renderer.domElement.addEventListener('pointerdown', (e) => { if (fly.on) { fly.drag = true; fly.px = e.clientX; fly.py = e.clientY; } });
renderer.domElement.addEventListener('wheel', (e) => { if (fly.on) { e.preventDefault(); fly.speed = Math.max(0.1, Math.min(4, fly.speed * (e.deltaY < 0 ? 1.15 : 0.87))); } }, { passive: false });
$('#t-fly').addEventListener('click', () => setFly(!fly.on));

/* ---------- cross-section / slice plane (issue #18) ---------- */
const slice = { on: false, axis: 'x', pos: 0, flip: false, _deepWas: false, plane: new THREE.Plane(new THREE.Vector3(1, 0, 0), 0) };
const _slQ = new THREE.Quaternion(), _slC = new THREE.Vector3(), _slAx = new THREE.Vector3(), _slS = new THREE.Vector3();
const SLICE_HALF_EXTENT = 1.05;   // world half-span of the cortex at scale 1; maps the [-1,1] #slice-pos slider onto the model
function updateSlicePlane() {
  const ctx = brain.cortex || brain.group;
  ctx.updateWorldMatrix(true, false);
  ctx.getWorldQuaternion(_slQ);
  brain.group.getWorldPosition(_slC);
  const s = brain.group.getWorldScale(_slS).x;   // lifespan scaling — keep the cut tracking the (re-sized) brain
  // Pro cortex is authored Z-up: local X = left-right (sagittal), Y = anterior (coronal), Z = inferior (axial)
  _slAx.set(slice.axis === 'x' ? 1 : 0, slice.axis === 'y' ? 1 : 0, slice.axis === 'z' ? 1 : 0).applyQuaternion(_slQ).normalize();
  const pt = _slC.clone().addScaledVector(_slAx, slice.pos * SLICE_HALF_EXTENT * s);
  slice.plane.setFromNormalAndCoplanarPoint(slice.flip ? _slAx.clone().negate() : _slAx.clone(), pt);
}
function setSlice(on) {
  if (slice.on === on) return;
  slice.on = on;
  const btn = $('#t-slice'); if (btn) btn.classList.toggle('is-on', on);
  const bar = $('#slicebar'); if (bar) bar.hidden = !on;
  if (on) {
    if (fly.on) setFly(false);
    updateSlicePlane();
    brain.setClip && brain.setClip([slice.plane]);
    sub.setClip && sub.setClip([slice.plane]);
    brain.setInterior && brain.setInterior(true);     // show the cut shell's inner wall
    brain.setGhost && brain.setGhost(false);          // solid section, not translucent
    slice._deepWas = state.deep;                      // keep the Deep toggle in sync with the forced reveal (#18 review)
    if (!state.deep) { state.deep = true; const tb = $('#t-deep'); if (tb) tb.classList.add('is-on'); }
    sub.setVisible(true); sub.showAll();              // reveal the interior structures in the cut
  } else {
    brain.setClip && brain.setClip(null);
    sub.setClip && sub.setClip(null);
    brain.setInterior && brain.setInterior(fly.on);
    if (!slice._deepWas) { state.deep = false; const tb = $('#t-deep'); if (tb) tb.classList.remove('is-on'); }   // restore prior Deep state
    if (state.mode === 'anatomy' || state.mode === 'lifespan') applyBaseView();
    else sub.setVisible(state.deep);
  }
}
$('#t-slice').addEventListener('click', () => setSlice(!slice.on));
document.querySelectorAll('#slice-axis button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#slice-axis button').forEach(x => x.classList.toggle('is-active', x === b));
  slice.axis = b.dataset.axis; updateSlicePlane();
}));
$('#slice-pos').addEventListener('input', (e) => { slice.pos = +e.target.value; e.target.style.setProperty('--fill', ((slice.pos + 1) / 2 * 100) + '%'); updateSlicePlane(); });
$('#slice-flip').addEventListener('click', (e) => { slice.flip = !slice.flip; e.currentTarget.classList.toggle('is-on', slice.flip); updateSlicePlane(); });

/* ---------- guided tour + quiz (issue #19) ---------- */
const tourCard = $('#tourcard');
function tourBlurb(k) { return (REGIONS[k] && REGIONS[k].body) || (DK_INFO[k] && DK_INFO[k].body) || (SUBCORTICAL[k] && (SUBCORTICAL[k].body || SUBCORTICAL[k].sub)) || ''; }
function nameOf(k) { return (infoFor(k) || {}).name || prettyDK(k); }

// guided tour — a scripted walk through the major systems
const TOUR = ['frontal', 'parietal', 'temporal', 'occipital', 'cerebellum', 'brainstem', 'thalamus', 'hippocampus', 'amygdala'];
const tour = { on: false, i: 0 };
function startTour() { if (fly.on) setFly(false); if (slice.on) setSlice(false); if (quiz.on) quizEnd(true); tour.on = true; tour.i = 0; tourStop(); }
function tourStop() {
  const k = TOUR[tour.i]; selectAndFocus(k);
  tourCard.hidden = false;
  tourCard.innerHTML = `
    <div class="tc-eyebrow">Guided tour</div>
    <div class="tc-title">${nameOf(k)}</div>
    <div class="tc-body">${tourBlurb(k)}</div>
    <div class="tc-row">
      <span class="tc-progress">Stop ${tour.i + 1} of ${TOUR.length}</span>
      <div class="tc-actions">
        <button id="tc-prev" ${tour.i === 0 ? 'disabled' : ''}>← Back</button>
        <button id="tc-next" class="primary">${tour.i === TOUR.length - 1 ? 'Finish' : 'Next →'}</button>
        <button id="tc-exit">Exit</button>
      </div>
    </div>`;
  $('#tc-prev')?.addEventListener('click', () => { if (tour.i > 0) { tour.i--; tourStop(); } });
  $('#tc-next')?.addEventListener('click', () => { if (tour.i < TOUR.length - 1) { tour.i++; tourStop(); } else tourEnd(); });
  $('#tc-exit')?.addEventListener('click', () => tourEnd());
}
function tourEnd() { tour.on = false; tourCard.hidden = true; }

// quiz — "click the part that does X"; clickable lobes + cerebellum/brainstem
const QUIZ = [
  { key: 'frontal',    ask: 'planning, decisions and voluntary movement' },
  { key: 'occipital',  ask: 'vision' },
  { key: 'temporal',   ask: 'hearing and forming memories' },
  { key: 'parietal',   ask: 'touch and spatial awareness' },
  { key: 'cerebellum', ask: 'balance, coordination and timing' },
  { key: 'brainstem',  ask: 'breathing and heart rate' },
];
const quiz = { on: false, order: [], i: 0, score: 0, answered: false };
function shuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }
function startQuiz() { if (fly.on) setFly(false); if (slice.on) setSlice(false); tourEnd(); quiz.on = true; quiz.order = shuffle(QUIZ); quiz.i = 0; quiz.score = 0; rightDock.hidden = true; brain.setSelected(null); quizShow(); }
function quizShow() {
  quiz.answered = false;
  const q = quiz.order[quiz.i];
  tourCard.hidden = false;
  tourCard.innerHTML = `
    <div class="tc-eyebrow">Quiz · ${quiz.i + 1} / ${quiz.order.length}</div>
    <div class="tc-title">Which part handles ${q.ask}?</div>
    <div class="tc-body">Click the matching region on the brain.</div>
    <div class="tc-row"><span class="tc-progress">Score ${quiz.score} / ${quiz.order.length}</span>
      <div class="tc-actions"><button id="tc-exit">Exit quiz</button></div></div>`;
  $('#tc-exit')?.addEventListener('click', () => quizEnd());
}
function answerQuiz(hitKey) {
  if (quiz.answered) return;
  const q = quiz.order[quiz.i];
  const clickedLobe = REGIONS[hitKey] ? hitKey : (DK_LOBES[hitKey] || hitKey);
  const correct = clickedLobe === q.key;
  if (correct) quiz.score++;
  quiz.answered = true;
  selectStructure(q.key); brain.setSelected(q.key); focusOn(focusKey(q.key));   // reveal + fly to the right answer
  const last = quiz.i === quiz.order.length - 1;
  tourCard.innerHTML = `
    <div class="tc-eyebrow">Quiz · ${quiz.i + 1} / ${quiz.order.length}</div>
    <div class="tc-title">${correct ? '<span class="tc-correct">✓ Correct!</span>' : '<span class="tc-wrong">✗ Not quite.</span>'} It’s the ${nameOf(q.key)}.</div>
    <div class="tc-body">${tourBlurb(q.key)}</div>
    <div class="tc-row"><span class="tc-progress">Score ${quiz.score} / ${quiz.order.length}</span>
      <div class="tc-actions"><button id="tc-next" class="primary">${last ? 'See result' : 'Next →'}</button><button id="tc-exit">Exit</button></div></div>`;
  $('#tc-next')?.addEventListener('click', () => { if (last) quizResult(); else { quiz.i++; quizShow(); } });
  $('#tc-exit')?.addEventListener('click', () => quizEnd());
}
function quizResult() {
  const pct = Math.round(quiz.score / quiz.order.length * 100);
  const msg = pct === 100 ? 'Perfect — you know your neuroanatomy!' : pct >= 60 ? 'Nice work!' : 'Keep exploring — try the guided tour.';
  tourCard.innerHTML = `
    <div class="tc-eyebrow">Quiz complete</div>
    <div class="tc-title">${quiz.score} / ${quiz.order.length} · ${pct}%</div>
    <div class="tc-body">${msg}</div>
    <div class="tc-row"><span></span><div class="tc-actions"><button id="tc-again" class="primary">Try again</button><button id="tc-exit">Done</button></div></div>`;
  $('#tc-again')?.addEventListener('click', () => startQuiz());
  $('#tc-exit')?.addEventListener('click', () => quizEnd());
}
function quizEnd(silent) { quiz.on = false; if (!silent) tourCard.hidden = true; }

/* ---------- white-matter tracts + vasculature (issue #20) ---------- */
const connGroup = new THREE.Group(), tractsGroup = new THREE.Group(), vesselsGroup = new THREE.Group();
connGroup.add(tractsGroup, vesselsGroup);
const conn = { tracts: false, vessels: false };
const connPick = [];
let connBuilt = false;
function _connTube(parent, pts, r, color, name, desc) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => Array.isArray(p) ? new THREE.Vector3(...p) : p));
  const m = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 64, r, 12, false),
    new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.0, emissive: color, emissiveIntensity: 0.18 })
  );
  m.userData = { conn: true, name, desc, kind: parent === tractsGroup ? 'White-matter tract' : 'Blood vessel' };
  parent.add(m); connPick.push(m); return m;
}
function buildConnectivity() {
  if (connBuilt) return;
  // anatomical world axes from the cortex world quaternion (same basis the slice tool verified):
  // cortex-local X = left-right, Y = anterior, Z = inferior → up = -Z.
  const q = new THREE.Quaternion(); (brain.cortex || brain.group).getWorldQuaternion(q);
  const C = new THREE.Vector3(); brain.group.getWorldPosition(C);
  const eLR = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const eAnt = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const eSup = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  const P = (lr, sup, ant) => C.clone().addScaledVector(eLR, lr).addScaledVector(eSup, sup).addScaledVector(eAnt, ant);

  // white-matter tracts
  _connTube(tractsGroup, [P(0, 0.10, 0.34), P(0, 0.32, 0.20), P(0, 0.42, 0), P(0, 0.30, -0.22), P(0, 0.10, -0.36)],
    0.05, 0xf1e7cf, 'Corpus callosum', 'The brain’s largest white-matter tract — ~200 million axons connecting the left and right hemispheres so they act as one.');
  [1, -1].forEach(s => _connTube(tractsGroup, [P(0.18 * s, 0.55, 0.06), P(0.12 * s, 0.12, 0.02), P(0.05 * s, -0.25, -0.02), P(0.03 * s, -0.62, -0.05)],
    0.026, 0xffb057, 'Corticospinal tract', 'The main motor pathway: axons from the motor cortex descend through the internal capsule and brainstem to the spinal cord, driving voluntary movement (crossing sides in the medulla).'));
  _connTube(tractsGroup, [P(-0.42, 0.10, 0.42), P(-0.52, 0.34, 0.02), P(-0.50, -0.06, -0.18)],
    0.024, 0x4fd6c0, 'Arcuate fasciculus', 'A language tract arching around the Sylvian fissure, linking Broca’s area (speech) with Wernicke’s area (comprehension).');

  // vasculature: Circle of Willis + main cerebral arteries
  const VES = 0xff4d57;
  const ringPts = []; for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI * 2; ringPts.push(P(Math.cos(a) * 0.16, -0.30 + Math.sin(a) * 0.02, 0.06 + Math.sin(a) * 0.12)); }
  _connTube(vesselsGroup, ringPts, 0.02, VES, 'Circle of Willis', 'A ring of arteries at the base of the brain linking the carotid and vertebrobasilar supplies — a built-in backup if one vessel is blocked.');
  _connTube(vesselsGroup, [P(0, -0.30, 0.20), P(0, 0.05, 0.50), P(0, 0.30, 0.42)], 0.017, VES, 'Anterior cerebral artery', 'Supplies the medial frontal and parietal cortex — including the leg area of the motor and sensory strips.');
  [1, -1].forEach(s => _connTube(vesselsGroup, [P(0.13 * s, -0.30, 0.04), P(0.42 * s, 0.02, 0.06), P(0.58 * s, 0.10, -0.02)], 0.017, VES, 'Middle cerebral artery', 'The largest cerebral artery — supplies the lateral cortex (language, face/hand motor & sensory). The most common stroke territory.'));
  [1, -1].forEach(s => _connTube(vesselsGroup, [P(0.10 * s, -0.30, -0.04), P(0.30 * s, 0.06, -0.40), P(0.16 * s, 0.12, -0.55)], 0.015, VES, 'Posterior cerebral artery', 'Supplies the occipital lobe (vision) and the underside of the temporal lobe.'));
  _connTube(vesselsGroup, [P(0, -0.30, -0.02), P(0, -0.45, -0.05), P(0, -0.66, -0.06)], 0.017, VES, 'Basilar artery', 'Formed by the two vertebral arteries; feeds the brainstem and cerebellum and joins the Circle of Willis.');

  tractsGroup.visible = conn.tracts; vesselsGroup.visible = conn.vessels;
  scene.add(connGroup);
  connBuilt = true;
}
function _connSync() {
  const allowed = (state.mode === 'anatomy' || state.mode === 'lifespan');   // overlays are anatomy/lifespan tools
  connGroup.visible = (conn.tracts || conn.vessels) && allowed;
  if (allowed) {   // ghost the cortex so the inner tubes show through
    if (conn.tracts || conn.vessels) brain.setGhost(true);
    else applyBaseView();
  }
}
function setTracts(on) { conn.tracts = on; buildConnectivity(); tractsGroup.visible = on; _connSync(); const b = $('#t-tracts'); if (b) b.classList.toggle('is-on', on); }
function setVessels(on) { conn.vessels = on; buildConnectivity(); vesselsGroup.visible = on; _connSync(); const b = $('#t-vessels'); if (b) b.classList.toggle('is-on', on); }
function pickConn(cx, cy) {
  if (!connGroup.visible) return null;
  pointer.x = (cx / innerWidth) * 2 - 1; pointer.y = -(cy / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(connPick.filter(m => m.parent && m.parent.visible), false);
  return hits.length ? hits[0] : null;
}
function showConnInfo(u) {
  detailContent.innerHTML = `
    <div class="detail-eyebrow">${u.kind}</div>
    <div class="detail-title">${u.name}</div>
    <div class="detail-body"><p>${u.desc}</p></div>
    <div class="cite">Illustrative approximate path · educational model.</div>`;
  rightDock.hidden = false;
}
$('#t-tracts')?.addEventListener('click', () => setTracts(!conn.tracts));
$('#t-vessels')?.addEventListener('click', () => setVessels(!conn.vessels));

$('#btn-help').addEventListener('click', showHelp);

function showHelp() {
  detailContent.innerHTML = `
    <div class="detail-eyebrow">Guide</div>
    <div class="detail-title">How to explore</div>
    <div class="detail-body">
      <p><b>Drag</b> rotate · <b>scroll</b> zoom · <b>right-drag</b> pan.</p>
      <p><b>Anatomy</b> — search (press <b>/</b>) or click any region; the camera flies in to focus it. Try the <b>Guided tour</b> or <b>Quiz me</b>.</p>
      <p><b>Lifespan</b> — slide age & switch sex to morph the brain; turn on <b>Deep structures</b> to see ventricles grow.</p>
      <p><b>Disease</b> — pick a condition to highlight what it damages.</p>
      <p><b>Senses</b> — watch a signal travel to its cortical destination.</p>
      <p><b>Neurons</b> — zoom in and watch action potentials fire.</p>
      <p><b>Tools</b> (bottom bar): <b>Cross-section</b> slices the brain; <b>Tracts</b> & <b>Vessels</b> overlay white-matter pathways and the cerebral arteries; <b>Fly inside</b> explores from within.</p>
    </div>
    <div class="detail-section"><h3>Data sources & credits</h3>
      <div class="factline"><span>Realistic surface</span><span>FreeSurfer fsaverage (Fischl 1999)</span></div>
      <div class="factline"><span>Region atlas</span><span>Desikan-Killiany (Desikan 2006)</span></div>
      <div class="factline"><span>Lifespan / sex</span><span>Bethlehem et al., Nature 2022</span></div>
      <div class="factline"><span>Neuroscience</span><span>Kandel, Principles of Neural Science 6e</span></div>
      <div class="factline"><span>Rendering</span><span>three.js (MIT)</span></div>
      <div class="factline"><span>Pro model</span><span>CGTrader Complete Brain Pack (royalty-free)</span></div>
      <div class="factline"><span>Real neurons</span><span>NeuroMorpho.Org</span></div>
    </div>
    <div class="cite">Educational model — not for diagnosis. Geometry is illustrative (procedural / statistical-average / artist), not a patient scan. Full citations appear per panel.</div>`;
  rightDock.hidden = false;
}

/* ---------- model source picker ---------- */
function busy(on, text) {
  let el = document.getElementById('busy');
  if (on) {
    if (!el) { el = document.createElement('div'); el.id = 'busy'; el.className = 'busy'; document.getElementById('app').appendChild(el); }
    el.textContent = text || 'Loading…'; el.style.display = 'flex';
  } else if (el) el.style.display = 'none';
}
async function switchSource(key, { silent } = {}) {
  if (key === source) return true;
  const btns = document.querySelectorAll('#model button');
  if (key === 'micro') {
    busy(true, 'Micro model (BigBrain cortical layers + real neurons) needs offline prep — see tools/PREP.md');
    setTimeout(() => busy(false), 2800);
    return;
  }
  if (key === 'realistic' && !realisticBrain) {
    busy(true, 'Loading real brain — fsaverage surface + Desikan-Killiany…');
    try { realisticBrain = await createRealisticBrain(); scene.add(realisticBrain.group); enableShadows(realisticBrain); }
    catch (e) { console.warn(e); if (!silent) { busy(true, 'Could not load fsaverage.bin — run: node tools/convert-fsaverage.mjs'); setTimeout(() => busy(false), 3500); } else busy(false); return false; }
    busy(false);
  }
  if (key === 'photoreal' && !photorealBrain) {
    busy(true, 'Loading photoreal model — assets/photoreal.glb…');
    try { photorealBrain = await createPhotorealBrain(); scene.add(photorealBrain.group); }
    catch (e) { console.warn('photoreal model not found', e); if (!silent) { busy(true, 'No photoreal model yet. Drop a CC-licensed brain GLB at assets/photoreal.glb (see tools/PREP.md).'); setTimeout(() => busy(false), 4800); } else busy(false); return false; }
    busy(false);
  }
  if (key === 'pro' && !proBrain) {
    busy(true, 'Loading Pro model — anatomical brain pack…');
    try { proBrain = await createProBrain(undefined, maxRes ? '4k' : '2k'); scene.add(proBrain.group); }
    catch (e) { console.warn('pro model not found', e); if (!silent) { busy(true, 'Pro model not installed — see assets/propack/.'); setTimeout(() => busy(false), 4000); } else busy(false); return false; }
    busy(false);
  }
  brain.group.visible = false;
  brain = key === 'realistic' ? realisticBrain : key === 'photoreal' ? photorealBrain : key === 'pro' ? proBrain : proceduralBrain;
  source = key;
  brain.group.visible = true;
  brain.group.add(sub.group); brain.group.add(overlays);
  // photoreal/pro lead with their own texture (pure photo); the lobe overlay fades in via the toggle
  if (key === 'photoreal' || key === 'pro') {
    state.colorMode = 'realistic';
    const cb = document.getElementById('t-color');
    if (cb) { cb.classList.add('is-on'); cb.textContent = 'Realistic'; }
  }
  brain.setColorMode(state.colorMode);
  btns.forEach(b => b.classList.toggle('is-active', b.dataset.model === key));
  setMode(state.mode);
  applyAgeSex();
  return true;
}
document.querySelectorAll('#model button').forEach(b => b.addEventListener('click', () => switchSource(b.dataset.model)));

/* ---------- resize ---------- */
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------- floating structure labels (#2) ---------- */
const LABEL_ANCHORS = [
  { text: 'Frontal lobe',  p: [0.16, 0.30, 0.55] },
  { text: 'Parietal lobe', p: [0.12, 0.62, -0.12] },
  { text: 'Temporal lobe', p: [0.52, -0.18, 0.10] },
  { text: 'Occipital lobe', p: [0.10, 0.20, -0.72] },
  { text: 'Cerebellum',    p: [0.0, -0.42, -0.50] },
  { text: 'Brainstem',     p: [0.0, -0.62, 0.02] },
];
let labelsOn = false;
const SVGNS = 'http://www.w3.org/2000/svg';
const labelLayer = document.createElement('div'); labelLayer.id = 'labelLayer'; labelLayer.hidden = true;
const leaderSvg = document.createElementNS(SVGNS, 'svg'); labelLayer.appendChild(leaderSvg);
const labelEls = LABEL_ANCHORS.map(a => {
  const line = document.createElementNS(SVGNS, 'line');
  line.setAttribute('stroke', 'rgba(54,212,255,0.55)'); line.setAttribute('stroke-width', '1.4');
  leaderSvg.appendChild(line);
  const el = document.createElement('div'); el.className = 'neuro-label'; el.textContent = a.text;
  labelLayer.appendChild(el);
  return { line, el, p: a.p, v: new THREE.Vector3() };
});
document.getElementById('app').appendChild(labelLayer);
$('#t-labels').addEventListener('click', (e) => {
  labelsOn = !labelsOn;
  e.currentTarget.classList.toggle('is-on', labelsOn);
  labelLayer.hidden = !labelsOn;
});
function updateLabels() {
  if (!labelsOn || state.mode === 'neurons') return;
  const cx = innerWidth / 2, cy = innerHeight / 2;
  for (const L of labelEls) {
    L.v.set(L.p[0], L.p[1], L.p[2]);
    brain.group.localToWorld(L.v);
    const ndc = L.v.project(camera);
    const show = ndc.z < 1;
    L.el.style.display = show ? 'block' : 'none';
    L.line.style.display = show ? 'block' : 'none';
    if (!show) continue;
    const sx = (ndc.x * 0.5 + 0.5) * innerWidth, sy = (-ndc.y * 0.5 + 0.5) * innerHeight;
    const ang = Math.atan2(sy - cy, sx - cx);
    const lx = sx + Math.cos(ang) * 95, ly = sy + Math.sin(ang) * 72;
    L.el.style.left = lx + 'px'; L.el.style.top = ly + 'px';
    L.line.setAttribute('x1', sx); L.line.setAttribute('y1', sy);
    L.line.setAttribute('x2', lx); L.line.setAttribute('y2', ly);
  }
}

/* ---------- render loop ---------- */
const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;
  if (fly.on) flyUpdate(dt);
  else { if (camAnim) stepCamAnim(dt); controls.update(); }

  if (state.mode === 'neurons') neurons.update(dt);

  if (state.sensePath) {
    const sp = state.sensePath;
    sp.t = (sp.t + dt * sp.speed) % 1;
    sp.sig.position.copy(sp.curve.getPointAt(sp.t));
    const pulse = 0.8 + 0.4 * Math.sin(t * 8);
    sp.sig.scale.setScalar(pulse);
  }
  if (state.diseasePulse) {
    const k = 0.5 + 0.5 * Math.sin(t * 4.5);
    state.diseasePulse.meshes.forEach(mu => {
      if (mu.material && 'emissiveIntensity' in mu.material) mu.material.emissiveIntensity = 0.3 + k * 1.2;
    });
    if (state.diseasePulse.focus) { state.diseasePulse.focus.material.opacity = 0.18 + k * 0.3; state.diseasePulse.focus.scale.setScalar(0.85 + k * 0.3); }
  }
  renderer.render(scene, camera);
  updateLabels();
}

/* ---------- boot ---------- */
async function boot() {
  updateAgeFill(); ageOut.textContent = state.age + ' yrs';
  brain.applyLifespan(state.age, sexFactor(state.sex));
  sub.setVentricleScale(ventricleFactorForAge(state.age));
  renderLeftDock();
  tick();
  // single model = the CGTrader Pro pack. If its GLB is ever missing, the always-available
  // procedural brain (created at startup and already on screen) stays as a silent safety net.
  const ok = await switchSource('pro', { silent: true });          // primary + only model
  if (!ok) { busy(true, 'Showing the basic brain (Pro assets not found).'); setTimeout(() => busy(false), 4000); }
  // hide "Max res" when the 4K set isn't shipped (e.g. the slimmed public beta build → 2K only)
  try {
    const has4k = await fetch(new URL('../assets/propack/4k/Brain_Base_Color.png', import.meta.url).href, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
    if (!has4k) { const mr = document.getElementById('t-maxres'); if (mr) mr.style.display = 'none'; }
  } catch (e) {}
  const l = document.getElementById('loading');
  if (l) { l.classList.add('is-hidden'); setTimeout(() => l.remove(), 700); }
}
boot();

window.__neuro = { scene, camera, controls, renderer, get brain() { return brain; }, sub, neurons, state, setMode, selectDisease, selectSense, switchSource, fly, setFly, flyUpdate, focusOn, focusKey, selectAndFocus, slice, setSlice, updateSlicePlane, startTour, startQuiz, tour, quiz, setTracts, setVessels, conn };
