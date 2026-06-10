/* Cortex + cerebellum + brainstem geometry.
   The cortex is a high-res icosphere sculpted into a brain: ellipsoid base,
   a carved interhemispheric (longitudinal) fissure, and ridged fractal noise
   for the gyri/sulci. Each vertex is tagged with a lobe so we can colour and
   pick regions. Everything lives in normalized "brain units" (~1 unit ≈ 9 cm). */

import * as THREE from '../vendor/three.module.js';
import { SimplexNoise } from './noise.js';

/* Lobe colours — kept in sync with the CSS lobe palette. */
export const LOBE_COLORS = {
  frontal:    0x4f8cff,
  parietal:   0x46d39a,
  temporal:   0xffa14a,
  occipital:  0xb36bff,
  cerebellum: 0x2fd6c6,
  brainstem:  0xc8b08a,
};
const REALISTIC = 0xd49aa0;  // uniform pinkish cortex

/* ellipsoid half-extents: x = half-width (L-R), y = half-height (I-S), z = half-length (A-P) */
const R = { x: 0.62, y: 0.52, z: 0.78 };

/* Which lobe owns a point, given its *normalized* ellipsoid coords (each ~ -1..1).
   nz>0 anterior (front), nz<0 posterior (back), ny up, nx left(-)/right(+). */
function regionOf(nx, ny, nz) {
  if (nz < -0.72) return 'occipital';                                  // small posterior pole
  if (ny < -0.02 && Math.abs(nx) > 0.26 && nz > -0.70) return 'temporal'; // long inferolateral lobe, below Sylvian fissure
  const central = 0.08 - 0.05 * ny;                                    // central sulcus (slightly oblique)
  if (nz < central) return 'parietal';
  return 'frontal';
}

function ridged(simplex, x, y, z, octaves, freq) {
  // ridged multifractal: sharp sulci, rounded gyri
  let sum = 0, amp = 0.5, f = freq, norm = 0;
  for (let o = 0; o < octaves; o++) {
    let n = simplex.noise3D(x * f, y * f, z * f);
    n = 1 - Math.abs(n);          // ridge
    n *= n;                       // sharpen
    sum += n * amp; norm += amp;
    amp *= 0.5; f *= 2.0;
  }
  return sum / norm;              // 0..1
}

/* IcosahedronGeometry subdivides LINEARLY: verts = 60*(detail+1)^2.
   detail 32 → ~65k verts (~21k triangles) — enough to resolve fine gyri. */
const CORTEX_DETAIL = 32;

function buildCortexGeometry() {
  const simplex = new SimplexNoise(20240601);
  const geo = new THREE.IcosahedronGeometry(1, CORTEX_DETAIL);
  geo.deleteAttribute('uv');
  const pos = geo.attributes.position;
  const N = pos.count;

  const vertexRegion = new Int8Array(N);   // index into REGION_KEYS
  const REGION_KEYS = ['frontal', 'parietal', 'temporal', 'occipital'];
  const centers = {}; const counts = {};
  REGION_KEYS.forEach(k => { centers[k] = new THREE.Vector3(); counts[k] = 0; });

  const d = new THREE.Vector3();
  const baseRadius = new Float32Array(N);  // smooth ellipsoid radius along d (for morphing)
  const foldDepth = new Float32Array(N);   // gyri displacement per vertex (drives aging effect)

  for (let i = 0; i < N; i++) {
    d.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();

    // ellipsoid base
    let bx = d.x * R.x, by = d.y * R.y, bz = d.z * R.z;
    // flatten the inferior surface a touch (brain sits flatter on its base)
    if (by < 0) by *= 0.84;

    const nx = bx / R.x, ny = by / R.y, nz = bz / R.z;
    const region = regionOf(nx, ny, nz);
    vertexRegion[i] = REGION_KEYS.indexOf(region);
    centers[region].add(d); counts[region]++;

    // gyri: ridged noise displacement along the radial direction
    const gyri = (ridged(simplex, d.x, d.y, d.z, 5, 4.6) - 0.5) * 0.072
               + (simplex.noise3D(d.x * 11, d.y * 11, d.z * 11)) * 0.011;

    // carve the longitudinal fissure near the midline on the superior aspect
    const midline = Math.exp(-Math.pow(bx / 0.05, 2));            // 1 at x≈0
    const topMask = Math.max(0, (d.y + 0.15));                     // only carve upper half
    const carve = -0.11 * midline * topMask;

    const disp = gyri + carve;
    const rlen = Math.sqrt(bx*bx + by*by + bz*bz);
    baseRadius[i] = rlen;
    foldDepth[i] = gyri;

    pos.setXYZ(i, bx + d.x * disp, by + d.y * disp, bz + d.z * disp);
  }

  geo.computeVertexNormals();
  geo.setAttribute('aFold', new THREE.BufferAttribute(foldDepth, 1));

  // vertex colours: lobe palette with AO, plus a specimen tissue palette
  // (cream gyral crowns, pink base, dark-red vessels in sulci) from fold depth.
  const T_BASE = new THREE.Color(0xd9a6a0), T_CROWN = new THREE.Color(0xf0d9c6), T_VESSEL = new THREE.Color(0x8f3140);
  const colLobes = new Float32Array(N * 3);
  const colReal  = new Float32Array(N * 3);
  const c = new THREE.Color(), tc = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const ao = Math.min(1.18, Math.max(0.45, 0.7 + foldDepth[i] * 9));
    c.setHex(LOBE_COLORS[REGION_KEYS[vertexRegion[i]]]);
    colLobes[i*3] = c.r*ao; colLobes[i*3+1] = c.g*ao; colLobes[i*3+2] = c.b*ao;
    const s = Math.max(-1, Math.min(1, foldDepth[i] * 16));   // +1 gyral crown, -1 sulcus
    tc.copy(T_BASE).lerp(T_CROWN, Math.max(0, s) * 0.75).lerp(T_VESSEL, Math.max(0, -s) * 0.6);
    const al = 0.86 + Math.max(0, s) * 0.14;
    colReal[i*3] = tc.r*al; colReal[i*3+1] = tc.g*al; colReal[i*3+2] = tc.b*al;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colLobes.slice(), 3));

  // store direction unit vectors for morphing
  const dirs = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    d.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    dirs[i*3] = d.x; dirs[i*3+1] = d.y; dirs[i*3+2] = d.z;
  }

  const regionCenters = {};
  REGION_KEYS.forEach(k => {
    regionCenters[k] = centers[k].multiplyScalar(1 / Math.max(1, counts[k]));
  });

  return { geo, vertexRegion, REGION_KEYS, colLobes, colReal, baseRadius, dirs, regionCenters };
}

export function buildCerebellum() {
  const geo = new THREE.IcosahedronGeometry(1, 11);
  geo.deleteAttribute('uv');
  const simplex = new SimplexNoise(7);
  const pos = geo.attributes.position;
  const d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    d.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    // flattened ellipsoid
    let x = d.x * 0.44, y = d.y * 0.27, z = d.z * 0.34;
    // foliation: fine horizontal ridges (parallel folia)
    const lat = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    const folia = Math.sin(lat * 46) * 0.010;
    const bump = simplex.noise3D(d.x*6, d.y*6, d.z*6) * 0.006;
    const r = 1 + (folia + bump);
    pos.setXYZ(i, x*r, y*r, z*r);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: LOBE_COLORS.cerebellum, roughness: 0.9, metalness: 0.0, flatShading: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, -0.30, -0.56);
  mesh.userData = { kind: 'mesh', region: 'cerebellum', baseColor: LOBE_COLORS.cerebellum };
  return mesh;
}

export function buildBrainstem() {
  // gentle S-curve from the thalamic region down & slightly forward to the cord
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.10, -0.05),
    new THREE.Vector3(0, -0.30, 0.02),
    new THREE.Vector3(0, -0.52, 0.06),
    new THREE.Vector3(0, -0.74, 0.04),
  ]);
  // radius varies: midbrain/pons bulge, medulla taper
  const geo = new THREE.TubeGeometry(curve, 40, 0.085, 16, false);
  // squash radius along length by scaling the tube via a second pass is overkill; keep uniform-ish
  geo.deleteAttribute('uv');
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: LOBE_COLORS.brainstem, roughness: 0.85, metalness: 0.0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { kind: 'mesh', region: 'brainstem', baseColor: LOBE_COLORS.brainstem };
  return mesh;
}

/* Public factory: returns the assembled brain group plus an interaction API. */
export function createBrain() {
  const built = buildCortexGeometry();
  const { geo, vertexRegion, REGION_KEYS, colLobes, colReal, baseRadius, dirs, regionCenters } = built;

  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.58, metalness: 0.0,
    clearcoat: 0.5, clearcoatRoughness: 0.45,   // wet sheen
    sheen: 0.6, sheenColor: new THREE.Color(0xffb3aa), sheenRoughness: 0.55,
    emissive: new THREE.Color(0x2a0c0c), emissiveIntensity: 0.0,   // warm subsurface lift (on in realistic mode)
    envMapIntensity: 0.7,
  });
  // GPU aging (uAtrophy) + fake subsurface scattering (warm fresnel rim).
  const atrophyUniform = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uAtrophy = atrophyUniform;
    shader.vertexShader = 'attribute float aFold;\nuniform float uAtrophy;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  transformed += normalize(position) * (uAtrophy * aFold * 0.7);'
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       float _rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.5);
       gl_FragColor.rgb += vec3(0.85, 0.42, 0.40) * _rim * 0.25;`
    );
  };
  const cortex = new THREE.Mesh(geo, mat);
  cortex.userData = { kind: 'cortex' };

  const cerebellum = buildCerebellum();
  const brainstem = buildBrainstem();

  const group = new THREE.Group();
  group.add(cortex, cerebellum, brainstem);

  let colorMode = 'lobes';            // 'lobes' | 'realistic'
  let hovered = null, selected = null;
  let affected = new Set();           // disease-affected lobes (warning tint)
  const colorAttr = geo.attributes.color;
  const meshMeshes = { cerebellum, brainstem };
  const WARN = new THREE.Color(0xff3b3b), WHITE = new THREE.Color(0xffffff);

  function baseColorArray() { return colorMode === 'lobes' ? colLobes : colReal; }

  function repaint() {
    const base = baseColorArray();
    const arr = colorAttr.array;
    arr.set(base);
    const tmp = new THREE.Color();
    for (let i = 0; i < vertexRegion.length; i++) {
      const key = REGION_KEYS[vertexRegion[i]];
      // disease tint first (so highlight brightens on top of it)
      if (affected.has(key)) {
        tmp.setRGB(arr[i*3], arr[i*3+1], arr[i*3+2]).lerp(WARN, 0.55);
        arr[i*3] = tmp.r; arr[i*3+1] = tmp.g; arr[i*3+2] = tmp.b;
      }
      let boost = 0;
      if (key === selected) boost = 0.55;
      else if (key === hovered) boost = 0.25;
      if (boost > 0) {
        tmp.setRGB(arr[i*3], arr[i*3+1], arr[i*3+2]).lerp(WHITE, boost * 0.5);
        tmp.offsetHSL(0, 0.05, boost * 0.18);
        arr[i*3] = tmp.r; arr[i*3+1] = tmp.g; arr[i*3+2] = tmp.b;
      }
    }
    colorAttr.needsUpdate = true;

    // cerebellum / brainstem: lobe colour, or matching tissue tone in realistic mode
    const tissue = { cerebellum: 0xc99a9a, brainstem: 0xcbb49a };
    for (const [key, m] of Object.entries(meshMeshes)) {
      const e = key === selected ? 0.5 : key === hovered ? 0.22 : 0.0;
      m.material.color.setHex(colorMode === 'realistic' ? tissue[key] : m.userData.baseColor);
      m.material.emissive.setHex(m.userData.baseColor);
      m.material.emissiveIntensity = e;
    }
    cortex.material.emissiveIntensity = colorMode === 'realistic' ? 0.5 : 0.0;
  }
  repaint();

  /* ghost (glass-brain) mode so deep structures show through the cortex */
  function setGhost(on) {
    for (const m of [cortex, cerebellum, brainstem]) {
      m.material.transparent = on;
      m.material.opacity = on ? 0.14 : 1.0;
      m.material.depthWrite = !on;
      m.material.needsUpdate = true;
    }
  }
  function setAffected(keys) { affected = new Set(keys || []); repaint(); }

  /* region under a raycast hit (cortex → per-vertex; meshes → userData) */
  function regionFromIntersection(hit) {
    const ud = hit.object.userData;
    if (ud.kind === 'cortex' && hit.face) return REGION_KEYS[vertexRegion[hit.face.a]];
    if (ud.region) return ud.region;
    return null;
  }

  function setHover(region) { if (region !== hovered) { hovered = region; repaint(); } }
  function setSelected(region) { if (region !== selected) { selected = region; repaint(); } }
  function setColorMode(mode) { if (mode !== colorMode) { colorMode = mode; repaint(); } }

  /* Lifespan morph: scale, cortical fold depth, and overall volume by age & sex.
     Evidence-based trends (population averages, see data.js citations):
       • brain volume peaks ~age 20-25, ~80% of adult size already at age 2-3;
       • gradual atrophy after ~40, sulci widen, gyri shrink;
       • average male brain volume ~10% larger than female (body-size linked). */
  /* Lifespan morph — cheap & smooth: scale the whole group for volume & sex,
     drive cortical relief with the GPU atrophy uniform. No per-vertex JS loop,
     so it stays fluid while dragging the age slider.
     Evidence-based trends (population averages, see data.js citations):
       • ~25% of adult volume at birth, ~90% by age 5, peak in early 20s;
       • gradual atrophy after ~40 — sulci widen, gyri thin, ventricles enlarge;
       • average male brain volume ~10% larger than female (body-size linked). */
  function applyLifespan(age, sexFactor) {
    let vol;
    if (age <= 2)       vol = 0.28 + 0.47 * (age / 2);            // 0.28 → 0.75
    else if (age <= 5)  vol = 0.75 + 0.17 * ((age - 2) / 3);      // → 0.92
    else if (age <= 22) vol = 0.92 + 0.08 * ((age - 5) / 17);     // → 1.00
    else if (age <= 40) vol = 1.0;
    else                vol = 1.0 - 0.10 * ((age - 40) / 50);     // ~ -10% by 90
    const sexScale = 1 + 0.035 * sexFactor;                       // ±3.5% radius ≈ ±10% volume
    const s = Math.cbrt(vol) * sexScale;
    group.scale.setScalar(s);

    atrophyUniform.value = age > 45 ? Math.min(1, (age - 45) / 45) : 0;  // 0..1 across 45→90
    return { volumeScale: vol, sexScale, atrophy: atrophyUniform.value };
  }

  return {
    group, cortex, cerebellum, brainstem,
    pickables: [cortex, cerebellum, brainstem],
    REGION_KEYS, regionCenters,
    regionFromIntersection, setHover, setSelected, setColorMode, applyLifespan,
    setGhost, setAffected,
  };
}
