/* Deep (subcortical) structures: thalamus, hippocampus, amygdala, basal ganglia,
   substantia nigra, and the lateral ventricles. Approximate parametric shapes,
   anatomically positioned, each tagged for picking. Shown inside a "ghost" cortex.
   Axes: x = left(-)/right(+), y = inferior(-)/superior(+), z = posterior(-)/anterior(+). */

import * as THREE from '../vendor/three.module.js';

const COLORS = {
  thalamus: 0xff7a8a,
  hippocampus: 0xffd24a,
  amygdala: 0xff5d5d,
  basalGanglia: 0x7ad3ff,
  substantiaNigra: 0x6b5640,   // healthy: pigmented/dark
  ventricles: 0x39c6ff,
};
const SN_HEALTHY = 0x5a4630, SN_DEPLETED = 0xc9b89a;  // Parkinson's: loss of dark pigment

function ellipsoid(rx, ry, rz, color, opts = {}) {
  const g = new THREE.IcosahedronGeometry(1, 3);
  g.deleteAttribute('uv');
  g.scale(rx, ry, rz);
  const m = new THREE.MeshStandardMaterial({
    color, roughness: 0.5, metalness: 0.0,
    emissive: color, emissiveIntensity: 0.18,
    transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
  });
  return new THREE.Mesh(g, m);
}

function tube(points, radius, color, opts = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, 40, radius, 12, false);
  g.deleteAttribute('uv');
  const m = new THREE.MeshStandardMaterial({
    color, roughness: 0.5, metalness: 0.0,
    emissive: color, emissiveIntensity: 0.18,
    transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
  });
  return new THREE.Mesh(g, m);
}

export function createSubcortical() {
  const group = new THREE.Group();
  group.visible = false;
  const byKey = {};

  function register(key, name, objects, baseColor) {
    objects.forEach(o => {
      o.userData = { kind: 'deep', region: key, name };
      group.add(o);
    });
    if (byKey[key]) byKey[key].objects.push(...objects);   // merge bilateral halves instead of overwriting (#17/#19 review)
    else byKey[key] = { name, objects, baseColor };
  }

  // --- Thalamus (paired ovoids at the center) ---
  const thL = ellipsoid(0.07, 0.06, 0.11, COLORS.thalamus); thL.position.set(-0.09, 0.0, -0.04);
  const thR = ellipsoid(0.07, 0.06, 0.11, COLORS.thalamus); thR.position.set( 0.09, 0.0, -0.04);
  register('thalamus', 'Thalamus', [thL, thR], COLORS.thalamus);

  // --- Hippocampus (C-shaped, medial temporal, L & R) ---
  for (const side of [-1, 1]) {
    const hip = tube([
      [side*0.30, -0.10,  0.18], [side*0.31, -0.15,  0.08],
      [side*0.30, -0.18, -0.04], [side*0.26, -0.16, -0.18], [side*0.20, -0.12, -0.26],
    ], 0.035, COLORS.hippocampus);
    register('hippocampus', 'Hippocampus', [hip], COLORS.hippocampus);
  }

  // --- Amygdala (almond, anterior to hippocampal head) ---
  const amL = ellipsoid(0.055, 0.05, 0.06, COLORS.amygdala); amL.position.set(-0.31, -0.10, 0.24);
  const amR = ellipsoid(0.055, 0.05, 0.06, COLORS.amygdala); amR.position.set( 0.31, -0.10, 0.24);
  register('amygdala', 'Amygdala', [amL, amR], COLORS.amygdala);

  // --- Basal ganglia (caudate tail tube + putamen blob, L & R) ---
  for (const side of [-1, 1]) {
    const caudate = tube([
      [side*0.14, 0.14, 0.22], [side*0.17, 0.10, 0.10],
      [side*0.18, 0.04, -0.04], [side*0.16, -0.02, -0.18],
    ], 0.03, COLORS.basalGanglia);
    const putamen = ellipsoid(0.05, 0.10, 0.13, COLORS.basalGanglia);
    putamen.position.set(side*0.26, 0.02, 0.04);
    register('basalGanglia', 'Basal ganglia', [caudate, putamen], COLORS.basalGanglia);
  }

  // --- Substantia nigra (midbrain, paired slabs) ---
  const snL = ellipsoid(0.05, 0.022, 0.05, SN_HEALTHY); snL.position.set(-0.06, -0.17, -0.06);
  const snR = ellipsoid(0.05, 0.022, 0.05, SN_HEALTHY); snR.position.set( 0.06, -0.17, -0.06);
  register('substantiaNigra', 'Substantia nigra', [snL, snR], SN_HEALTHY);

  // --- Lateral ventricles (CSF spaces; enlarge with age/atrophy) ---
  const ventGroup = [];
  for (const side of [-1, 1]) {
    const v = tube([
      [side*0.10, 0.18,  0.26], [side*0.13, 0.20,  0.10],
      [side*0.14, 0.18, -0.06], [side*0.12, 0.10, -0.22], [side*0.16, 0.02, -0.20],
    ], 0.04, COLORS.ventricles, { transparent: true, opacity: 0.45 });
    ventGroup.push(v);
  }
  register('ventricles', 'Lateral ventricles', ventGroup, COLORS.ventricles);
  const ventricleBase = ventGroup.map(v => v.scale.clone());

  /* ---------- API ---------- */
  function setVisible(on) { group.visible = on; }

  function showOnly(keys) {
    // keys: array of keys to show, or null = show all
    for (const [k, rec] of Object.entries(byKey)) {
      const on = !keys || keys.includes(k);
      rec.objects.forEach(o => { o.visible = on; });
    }
    group.visible = true;
  }
  function showAll() { for (const rec of Object.values(byKey)) rec.objects.forEach(o => o.visible = true); }

  function highlight(key, on) {
    const rec = byKey[key]; if (!rec) return;
    rec.objects.forEach(o => {
      o.material.emissiveIntensity = on ? 0.85 : 0.18;
      o.scale.multiplyScalar(on ? 1.0 : 1.0); // (kept for symmetry)
    });
  }

  function setParkinsons(on) {
    const rec = byKey.substantiaNigra;
    rec.objects.forEach(o => {
      o.material.color.setHex(on ? SN_DEPLETED : SN_HEALTHY);
      o.material.emissive.setHex(on ? SN_DEPLETED : SN_HEALTHY);
      o.material.emissiveIntensity = on ? 0.1 : 0.18;
    });
  }

  // ventricle enlargement: factor 1 (young) → ~2.0 (very old / hydrocephalus)
  function setVentricleScale(factor) {
    byKey.ventricles.objects.forEach((v, i) => {
      v.scale.copy(ventricleBase[i]).multiplyScalar(factor);
    });
  }

  function getCenter(key) {
    const rec = byKey[key]; if (!rec || !rec.objects.length) return new THREE.Vector3();
    // geometry-bbox centres (transformed by each object's matrix) so tube meshes whose .position is (0,0,0)
    // with coords baked into vertices still locate correctly — e.g. hippocampus, caudate (#17 review)
    const c = new THREE.Vector3(), tmp = new THREE.Vector3();
    rec.objects.forEach(o => {
      o.updateMatrix();
      if (o.geometry) { o.geometry.computeBoundingBox(); o.geometry.boundingBox.getCenter(tmp).applyMatrix4(o.matrix); }
      else tmp.setFromMatrixPosition(o.matrix);
      c.add(tmp);
    });
    return c.multiplyScalar(1 / rec.objects.length);
  }

  function setClip(planes) {   // cross-section clipping for deep structures (issue #18)
    group.traverse(o => { if (o.material) { const mts = Array.isArray(o.material) ? o.material : [o.material]; mts.forEach(m => { m.clippingPlanes = planes || null; m.needsUpdate = true; }); } });
  }

  return {
    group, byKey, pickables: group.children,
    setVisible, showOnly, showAll, highlight, setParkinsons, setVentricleScale, getCenter, setClip,
    COLORS,
  };
}
