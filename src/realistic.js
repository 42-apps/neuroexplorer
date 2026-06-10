/* Realistic cortex source — loads the real FreeSurfer fsaverage surface +
   Desikan-Killiany parcellation (prepped offline into assets/fsaverage.bin) and
   exposes the same API as the procedural brain so it drops into main.js.
   Reuses the procedural cerebellum & brainstem so it's a complete brain. */

import * as THREE from '../vendor/three.module.js';
import { buildCerebellum, buildBrainstem } from './cortex.js';
import { DK_LOBES, EXT_LOBE_COLORS } from './data.js';

const REALISTIC = 0xd49aa0;
const LOBE_KEYS = new Set(['frontal', 'parietal', 'temporal', 'occipital', 'cingulate', 'insula', 'other']);

export async function createRealisticBrain() {
  const base = import.meta.url;
  const [buf, regions] = await Promise.all([
    fetch(new URL('../assets/fsaverage.bin', base)).then(r => r.arrayBuffer()),
    fetch(new URL('../assets/fsaverage-regions.json', base)).then(r => r.json()),
  ]);
  const idToName = regions.idToName;

  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'NB01') throw new Error('bad fsaverage.bin magic: ' + magic);
  const vCount = dv.getUint32(4, true), fCount = dv.getUint32(8, true);
  const positions = new Float32Array(buf.slice(16, 16 + vCount * 12));
  const indices = new Uint32Array(buf.slice(16 + vCount * 12, 16 + vCount * 12 + fCount * 12));
  const regionIds = new Uint16Array(buf.slice(16 + vCount * 12 + fCount * 12));

  // per-vertex region name + lobe
  const vertName = new Array(vCount);
  const vertLobe = new Array(vCount);
  for (let i = 0; i < vCount; i++) {
    const nm = idToName[regionIds[i]] || 'unknown';
    vertName[i] = nm; vertLobe[i] = DK_LOBES[nm] || 'other';
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  let normals = geo.attributes.normal.array;
  // plump the surface slightly so gyri read as fuller (fills shallow sulci a touch)
  const INFLATE = 0.012;
  for (let i = 0; i < vCount; i++) {
    positions[i*3]   += normals[i*3]   * INFLATE;
    positions[i*3+1] += normals[i*3+1] * INFLATE;
    positions[i*3+2] += normals[i*3+2] * INFLATE;
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
  normals = geo.attributes.normal.array;

  // curvature → ambient occlusion + vascularity. concavity = dot(normal, neighbourCentroid - vertex), z-scored.
  const { ao, tArr } = (() => {
    const nbSum = new Float32Array(vCount * 3), nbCnt = new Float32Array(vCount);
    for (let f = 0; f < indices.length; f += 3) {
      const a = indices[f], b = indices[f+1], c2 = indices[f+2];
      const add = (i, j) => { nbSum[i*3]+=positions[j*3]; nbSum[i*3+1]+=positions[j*3+1]; nbSum[i*3+2]+=positions[j*3+2]; nbCnt[i]++; };
      add(a,b); add(a,c2); add(b,a); add(b,c2); add(c2,a); add(c2,b);
    }
    const conc = new Float32Array(vCount); let mean = 0;
    for (let i = 0; i < vCount; i++) {
      const k = Math.max(1, nbCnt[i]);
      const lx = nbSum[i*3]/k - positions[i*3], ly = nbSum[i*3+1]/k - positions[i*3+1], lz = nbSum[i*3+2]/k - positions[i*3+2];
      conc[i] = normals[i*3]*lx + normals[i*3+1]*ly + normals[i*3+2]*lz; mean += conc[i];
    }
    mean /= vCount;
    let varr = 0; for (let i = 0; i < vCount; i++) varr += (conc[i]-mean)**2; const std = Math.sqrt(varr/vCount) || 1e-6;
    const ao = new Float32Array(vCount), tArr = new Float32Array(vCount);
    for (let i = 0; i < vCount; i++) {
      const t = Math.max(-1, Math.min(1, (conc[i]-mean) / (2.2*std)));   // +1 = deep sulcus
      tArr[i] = t; ao[i] = 0.86 - t*0.24;                          // softer AO → fuller, less "thin"
    }
    return { ao, tArr };
  })();

  // richer specimen tissue palette: warm cream crowns, fuller pink base, softer red vessels
  const T_BASE = new THREE.Color(0xd6968c), T_CROWN = new THREE.Color(0xeecdb6), T_VESSEL = new THREE.Color(0x9c474c);
  const colLobes = new Float32Array(vCount * 3);
  const colReal = new Float32Array(vCount * 3);
  const c = new THREE.Color(), tc = new THREE.Color();
  for (let i = 0; i < vCount; i++) {
    const a = ao[i], t = tArr[i];
    c.setHex(EXT_LOBE_COLORS[vertLobe[i]] ?? EXT_LOBE_COLORS.other);
    colLobes[i*3] = c.r*a; colLobes[i*3+1] = c.g*a; colLobes[i*3+2] = c.b*a;
    tc.copy(T_BASE).lerp(T_CROWN, Math.max(0, -t) * 0.7).lerp(T_VESSEL, Math.max(0, t) * 0.5);
    const al = 0.9 + Math.max(0, -t) * 0.1;
    colReal[i*3] = tc.r*al; colReal[i*3+1] = tc.g*al; colReal[i*3+2] = tc.b*al;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colLobes.slice(), 3));

  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.58, metalness: 0.0,
    clearcoat: 0.5, clearcoatRoughness: 0.45,
    sheen: 0.6, sheenColor: new THREE.Color(0xffb3aa), sheenRoughness: 0.55,
    emissive: new THREE.Color(0x301010), emissiveIntensity: 0.62,    // waxy subsurface lift
    envMapIntensity: 0.7,
  });
  // fake subsurface scattering: warm fresnel rim where light grazes through the tissue
  mat.onBeforeCompile = (shader) => {
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

  let colorMode = 'lobes', hovered = null, selected = null, affected = new Set();
  const colorAttr = geo.attributes.color;
  const meshMeshes = { cerebellum, brainstem };
  const WARN = new THREE.Color(0xff3b3b), WHITE = new THREE.Color(0xffffff);

  // does highlight key (a DK region name OR a lobe key) match this vertex?
  function matches(key, i) {
    if (!key) return false;
    return LOBE_KEYS.has(key) ? vertLobe[i] === key : vertName[i] === key;
  }

  function repaint() {
    const base = colorMode === 'lobes' ? colLobes : colReal;
    const arr = colorAttr.array; arr.set(base);
    const tmp = new THREE.Color();
    for (let i = 0; i < vCount; i++) {
      if (affected.size && affected.has(vertLobe[i])) {
        tmp.setRGB(arr[i*3], arr[i*3+1], arr[i*3+2]).lerp(WARN, 0.55);
        arr[i*3]=tmp.r; arr[i*3+1]=tmp.g; arr[i*3+2]=tmp.b;
      }
      let boost = matches(selected, i) ? 0.55 : matches(hovered, i) ? 0.25 : 0;
      if (boost > 0) {
        tmp.setRGB(arr[i*3], arr[i*3+1], arr[i*3+2]).lerp(WHITE, boost * 0.5).offsetHSL(0, 0.05, boost * 0.18);
        arr[i*3]=tmp.r; arr[i*3+1]=tmp.g; arr[i*3+2]=tmp.b;
      }
    }
    colorAttr.needsUpdate = true;
    const tissue = { cerebellum: 0xc99a9a, brainstem: 0xcbb49a };
    for (const [k, m] of Object.entries(meshMeshes)) {
      const e = k === selected ? 0.5 : k === hovered ? 0.22 : 0.0;
      m.material.color.setHex(colorMode === 'realistic' ? tissue[k] : m.userData.baseColor);
      m.material.emissive.setHex(m.userData.baseColor); m.material.emissiveIntensity = e;
    }
    cortex.material.emissiveIntensity = colorMode === 'realistic' ? 0.5 : 0.0;
  }
  repaint();

  function regionFromIntersection(hit) {
    const ud = hit.object.userData;
    if (ud.kind === 'cortex' && hit.face) return vertName[hit.face.a];
    if (ud.region) return ud.region;
    return null;
  }
  function setHover(k) { if (k !== hovered) { hovered = k; repaint(); } }
  function setSelected(k) { if (k !== selected) { selected = k; repaint(); } }
  function setColorMode(m) { if (m !== colorMode) { colorMode = m; repaint(); } }
  function setAffected(keys) { affected = new Set(keys || []); repaint(); }
  function setGhost(on) {
    for (const m of [cortex, cerebellum, brainstem]) {
      m.material.transparent = on; m.material.opacity = on ? 0.14 : 1.0;
      m.material.depthWrite = !on; m.material.needsUpdate = true;
    }
  }
  function applyLifespan(age, sexFactor) {
    let vol;
    if (age <= 2) vol = 0.28 + 0.47 * (age / 2);
    else if (age <= 5) vol = 0.75 + 0.17 * ((age - 2) / 3);
    else if (age <= 22) vol = 0.92 + 0.08 * ((age - 5) / 17);
    else if (age <= 40) vol = 1.0;
    else vol = 1.0 - 0.10 * ((age - 40) / 50);
    const s = Math.cbrt(vol) * (1 + 0.035 * sexFactor);
    group.scale.setScalar(s);
    return { volumeScale: vol };
  }

  // region name → friendly check uses DK_INFO in main; expose helpers
  return {
    group, cortex, cerebellum, brainstem,
    pickables: [cortex, cerebellum, brainstem],
    isRealistic: true, vertName, vertLobe,
    regionFromIntersection, setHover, setSelected, setColorMode, setAffected, setGhost, applyLifespan,
  };
}
