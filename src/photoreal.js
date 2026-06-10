/* Photoreal artist-model source — loads a textured brain GLB and paints our region
   map onto it so all overlays work, with the photo texture showing through.
   Regions: cerebellum/brainstem by 3D position; the cortex gets the FINE Desikan-
   Killiany atlas transferred from fsaverage by nearest-neighbour (spatial grid).
   A shader blends lobe colours over the texture (the "fade") and glows the
   selected / hovered region and disease-affected lobes. */

import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { LOBE_COLORS } from './cortex.js';
import { EXT_LOBE_COLORS, DK_LOBES } from './data.js';

const LOBES = ['frontal', 'parietal', 'temporal', 'occipital', 'cingulate', 'insula', 'cerebellum', 'brainstem', 'other'];
const LOBE_IDX = Object.fromEntries(LOBES.map((k, i) => [k, i]));
const LOBE_HEX = {
  frontal: EXT_LOBE_COLORS.frontal, parietal: EXT_LOBE_COLORS.parietal, temporal: EXT_LOBE_COLORS.temporal,
  occipital: EXT_LOBE_COLORS.occipital, cingulate: EXT_LOBE_COLORS.cingulate, insula: EXT_LOBE_COLORS.insula,
  cerebellum: LOBE_COLORS.cerebellum, brainstem: LOBE_COLORS.brainstem, other: EXT_LOBE_COLORS.other,
};

/* This GLB has +Z = posterior (cerebellum/brainstem at +nz); anterior = -Z. */
const ANT = -1;
function coarseLobe(nx, ny, nz) {
  const z = nz * ANT;
  if (ny < -0.58 && Math.abs(nx) < 0.20) return 'brainstem';
  if (ny < -0.05 && z < -0.15) return 'cerebellum';
  if (z < -0.56) return 'occipital';
  if (ny < 0.06 && Math.abs(nx) > 0.26 && z > -0.45) return 'temporal';
  const central = 0.10 - 0.05 * ny;
  return z < central ? 'parietal' : 'frontal';
}

/* build a uniform-grid nearest-neighbour lookup over fsaverage vertices (normalized) */
function buildFsLookup(buf, regions) {
  const dv = new DataView(buf);
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'NB01') return null;
  const vC = dv.getUint32(4, true), fC = dv.getUint32(8, true);
  const fsPos = new Float32Array(buf.slice(16, 16 + vC * 12));
  const fsReg = new Uint16Array(buf.slice(16 + vC * 12 + fC * 12));
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < vC; i++) for (let a = 0; a < 3; a++) { const v = fsPos[i*3+a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
  const fc = [(mn[0]+mx[0])/2, (mn[1]+mx[1])/2, (mn[2]+mx[2])/2];
  const fh = [(mx[0]-mn[0])/2 || 1, (mx[1]-mn[1])/2 || 1, (mx[2]-mn[2])/2 || 1];
  const norm = new Float32Array(vC * 3);
  for (let i = 0; i < vC; i++) { norm[i*3] = (fsPos[i*3]-fc[0])/fh[0]; norm[i*3+1] = (fsPos[i*3+1]-fc[1])/fh[1]; norm[i*3+2] = (fsPos[i*3+2]-fc[2])/fh[2]; }
  const G = 24, cell = 2 / G, grid = new Map();
  const key = (ix, iy, iz) => (ix * G + iy) * G + iz;
  const bi = v => Math.max(0, Math.min(G - 1, Math.floor((v + 1) / cell)));
  for (let i = 0; i < vC; i++) { const k = key(bi(norm[i*3]), bi(norm[i*3+1]), bi(norm[i*3+2])); let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(i); }
  return (x, y, z) => {   // query in fsaverage unit-cube frame → region id (or null)
    const cx = bi(x), cy = bi(y), cz = bi(z); let best = -1, bd = 1e9;
    for (let r = 1; r <= 3 && best < 0; r++) {   // expand the search ring if a bucket is empty
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r && r > 1) continue;
        const ix = cx+dx, iy = cy+dy, iz = cz+dz; if (ix<0||iy<0||iz<0||ix>=G||iy>=G||iz>=G) continue;
        const a = grid.get(key(ix, iy, iz)); if (!a) continue;
        for (const i of a) { const ddx = norm[i*3]-x, ddy = norm[i*3+1]-y, ddz = norm[i*3+2]-z; const d = ddx*ddx+ddy*ddy+ddz*ddz; if (d < bd) { bd = d; best = i; } }
      }
    }
    return best < 0 ? null : fsReg[best];
  };
}

export async function createPhotorealBrain(url) {
  const base = import.meta.url;
  const u = url || new URL('../assets/photoreal.glb', base).href;
  const [gltf, fsBuf, fsRegions] = await Promise.all([
    new GLTFLoader().loadAsync(u),
    fetch(new URL('../assets/fsaverage.bin', base)).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null),
    fetch(new URL('../assets/fsaverage-regions.json', base)).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  const model = gltf.scene;
  let mainMesh = null;
  model.traverse(o => { if (o.isMesh && o.geometry) { o.castShadow = true; if (!mainMesh || o.geometry.attributes.position.count > mainMesh.geometry.attributes.position.count) mainMesh = o; } });

  model.updateMatrixWorld(true);
  const wbox = new THREE.Box3().setFromObject(model);
  const size = wbox.getSize(new THREE.Vector3()), center = wbox.getCenter(new THREE.Vector3());
  const fitScale = 1.8 / (Math.max(size.x, size.y, size.z) || 1);
  model.position.set(-center.x, -center.y, -center.z);
  const fit = new THREE.Group(); fit.add(model); fit.scale.setScalar(fitScale);
  fit.rotation.y = Math.PI;   // GLB faces +Z=back; spin so anterior faces +Z like the others
  const group = new THREE.Group(); group.add(fit);

  // region transfer
  const nn = (fsBuf && fsRegions) ? buildFsLookup(fsBuf, fsRegions) : null;
  const idToName = fsRegions ? fsRegions.idToName : {};
  const nameToId = {}; for (const k in idToName) nameToId[idToName[k]] = +k;

  const geo = mainMesh.geometry; geo.computeBoundingBox();
  const bb = geo.boundingBox, c = bb.getCenter(new THREE.Vector3());
  const hx = (bb.max.x-bb.min.x)/2 || 1, hy = (bb.max.y-bb.min.y)/2 || 1, hz = (bb.max.z-bb.min.z)/2 || 1;
  const pos = geo.attributes.position, V = pos.count;
  const vertName = new Array(V), vertLobe = new Array(V);
  const aRegion = new Float32Array(V), aLobe = new Float32Array(V);
  for (let i = 0; i < V; i++) {
    const nx = (pos.getX(i)-c.x)/hx, ny = (pos.getY(i)-c.y)/hy, nz = (pos.getZ(i)-c.z)/hz;
    const cl = coarseLobe(nx, ny, nz);
    let name = cl, lobe = cl, rid = -1;
    if (cl !== 'cerebellum' && cl !== 'brainstem' && nn) {
      const r = nn(-nx, ny, -nz);   // photoreal raw → fsaverage frame (180° Y flip)
      if (r != null) { name = idToName[r] || 'unknown'; lobe = DK_LOBES[name] || 'other'; rid = r; }
    }
    vertName[i] = name; vertLobe[i] = lobe;
    aRegion[i] = rid; aLobe[i] = LOBE_IDX[lobe] ?? LOBE_IDX.other;
  }
  geo.setAttribute('aRegion', new THREE.BufferAttribute(aRegion, 1));
  geo.setAttribute('aLobe', new THREE.BufferAttribute(aLobe, 1));

  // shader: overlay fade + region/lobe highlight over the texture
  const uOverlay = { value: 0 }, uSelR = { value: -1 }, uSelL = { value: -1 }, uHovR = { value: -1 }, uHovL = { value: -1 };
  const uAff = { value: new Array(9).fill(0) };
  const cc = new THREE.Color();
  const uLobeCol = { value: LOBES.map(k => { cc.setHex(LOBE_HEX[k]); return new THREE.Vector3(cc.r, cc.g, cc.b); }) };
  const mats = Array.isArray(mainMesh.material) ? mainMesh.material : [mainMesh.material];
  mats.forEach(mat => {
    mat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, { uOverlay, uSelR, uSelL, uHovR, uHovL, uAff, uLobeCol });
      s.vertexShader = 'attribute float aRegion;\nattribute float aLobe;\nvarying float vR;\nvarying float vL;\n' +
        s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vR = aRegion; vL = aLobe;');
      s.fragmentShader =
        'varying float vR;\nvarying float vL;\nuniform float uOverlay;\nuniform vec3 uLobeCol[9];\nuniform float uSelR;\nuniform float uSelL;\nuniform float uHovR;\nuniform float uHovL;\nuniform float uAff[9];\n' +
        s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        int li = int(vL + 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, uLobeCol[li], uOverlay * 0.8);
        float sel = clamp(step(abs(vR - uSelR), 0.5) + step(abs(vL - uSelL), 0.5), 0.0, 1.0);
        float hov = clamp(step(abs(vR - uHovR), 0.5) + step(abs(vL - uHovL), 0.5), 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.92, 1.0), sel * 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.28, 0.28), uAff[li] * 0.5);
        diffuseColor.rgb += vec3(0.16) * hov;
      `);
    };
    mat.needsUpdate = true;
  });

  const isLobe = k => k in LOBE_IDX;
  return {
    group, cortex: mainMesh, cerebellum: null, brainstem: null,
    pickables: [mainMesh],
    isPhotoreal: true, hasRegions: true,
    regionFromIntersection: (hit) => (hit.object === mainMesh && hit.face) ? vertName[hit.face.a] : null,
    setSelected(k) { uSelL.value = isLobe(k) ? LOBE_IDX[k] : -1; uSelR.value = (!isLobe(k) && k in nameToId) ? nameToId[k] : -1; },
    setHover(k) { uHovL.value = isLobe(k) ? LOBE_IDX[k] : -1; uHovR.value = (!isLobe(k) && k in nameToId) ? nameToId[k] : -1; },
    setColorMode(mode) { uOverlay.value = (mode === 'lobes') ? 0.6 : 0; },
    setAffected(keys) { const a = new Array(9).fill(0); (keys || []).forEach(k => { if (k in LOBE_IDX) a[LOBE_IDX[k]] = 1; }); uAff.value = a; },
    setGhost(on) { mats.forEach(m => { m.transparent = on; m.opacity = on ? 0.5 : 1; m.depthWrite = !on; m.needsUpdate = true; }); },
    applyLifespan(age, sexFactor) {
      let vol;
      if (age <= 2) vol = 0.28 + 0.47 * (age / 2);
      else if (age <= 5) vol = 0.75 + 0.17 * ((age - 2) / 3);
      else if (age <= 22) vol = 0.92 + 0.08 * ((age - 5) / 17);
      else if (age <= 40) vol = 1.0;
      else vol = 1.0 - 0.10 * ((age - 40) / 50);
      group.scale.setScalar(Math.cbrt(vol) * (1 + 0.035 * sexFactor));
      return { volumeScale: vol };
    },
  };
}
