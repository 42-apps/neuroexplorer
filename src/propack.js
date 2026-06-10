/* "Pro" model — CGTrader Complete Brain Pack (royalty-free, neurologist-approved).
   One glTF scene, four named parts (Brain / Cerebellum / BasalGanglia / FourthVentricle)
   with 8K PBR textures (shipped at 2K default + 4K "max res"). The cerebrum receives the
   Desikan-Killiany atlas transferred from fsaverage (nearest-neighbour) for fine clickable
   regions; the deep parts are clickable directly. A shader blends lobe colours over the
   cortex texture (the "fade") and glows the selected / hovered region + disease lobes. */

import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { EXT_LOBE_COLORS, DK_LOBES } from './data.js';

const TEX = {
  Brain:           { base: 'Brain_Base_Color.png', normal: 'Brain_Normal.png', rough: 'Brain_Roughness.png', sss: 'Brain_SSS.png' },
  Cerebellum:      { base: 'Cerebellum_BaseColor.png', normal: 'Cerebellum_Normal.png', rough: 'Cerebellum_Roughness.png', sss: 'Cerebellum_SSS.png' },
  BasalGanglia:    { base: 'Basal_Ganglia_BaseColor.png', normal: 'Basal_Ganglia_Normal.png', rough: 'Basal_Ganglia_Roughness.png', sss: 'Basal_Ganglia_SSS.png' },
  FourthVentricle: { base: 'FourthVentricle_Color.png', normal: 'FourthVentricle_Normal.png', rough: 'FourthVentricle_Roughness.png', sss: 'FourthVentricle_SSS.png' },
};
// NB: the pack's mesh named "FourthVentricle" is geometrically the BRAINSTEM column (central, tall,
// descending) — the real ventricles are the separate subcortical (sub) meshes. So map it to 'brainstem'
// (fixes #16: Brainstem now highlights/clicks; also stops it glowing red for ventricle diseases).
const PART_REGION = { Cerebellum: 'cerebellum', BasalGanglia: 'basalGanglia', FourthVentricle: 'brainstem' };
const PART_KEYS = Object.keys(TEX);
const LOBES = ['frontal', 'parietal', 'temporal', 'occipital', 'cingulate', 'insula', 'other'];
const LOBE_IDX = Object.fromEntries(LOBES.map((k, i) => [k, i]));

function coarseLobe(nx, ny, nz, ant) {   // cerebrum only (cerebellum/brainstem are separate parts)
  const z = nz * ant;
  if (z < -0.55) return 'occipital';
  if (ny < 0.05 && Math.abs(nx) > 0.26 && z > -0.45) return 'temporal';
  const central = 0.10 - 0.05 * ny;
  return z < central ? 'parietal' : 'frontal';
}

/* Bake a per-texel region map by rasterising the mesh's triangles in UV space and resolving the
   region from each texel's interpolated 3D position (localToRegion). Returns RGBA Uint8: R=region id
   (255 = none), G=lobe index, A=coverage. Sampled per-fragment in the shader so highlight/overlay
   boundaries sit at texture resolution instead of following the mesh triangles (issue #11). */
function bakeRegionUV(geom, size, localToRegion) {
  const pos = geom.attributes.position, uv = geom.attributes.uv, index = geom.index;
  const W = size, H = size, data = new Uint8Array(W * H * 4);
  const triCount = index ? index.count / 3 : pos.count / 3;
  const vi = index ? (k => index.getX(k)) : (k => k);
  for (let t = 0; t < triCount; t++) {
    const i0 = vi(t*3), i1 = vi(t*3+1), i2 = vi(t*3+2);
    const u0 = uv.getX(i0)*W, v0 = uv.getY(i0)*H, u1 = uv.getX(i1)*W, v1 = uv.getY(i1)*H, u2 = uv.getX(i2)*W, v2 = uv.getY(i2)*H;
    const den = (v1-v2)*(u0-u2) + (u2-u1)*(v0-v2);
    if (Math.abs(den) < 1e-9) continue;                 // degenerate UV triangle
    const minX = Math.max(0, Math.floor(Math.min(u0,u1,u2))), maxX = Math.min(W-1, Math.ceil(Math.max(u0,u1,u2)));
    const minY = Math.max(0, Math.floor(Math.min(v0,v1,v2))), maxY = Math.min(H-1, Math.ceil(Math.max(v0,v1,v2)));
    const x0=pos.getX(i0),y0=pos.getY(i0),z0=pos.getZ(i0), x1=pos.getX(i1),y1=pos.getY(i1),z1=pos.getZ(i1), x2=pos.getX(i2),y2=pos.getY(i2),z2=pos.getZ(i2);
    for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
      const o = (py*W + px) * 4; if (data[o+3]) continue;   // first writer wins (UV islands don't overlap)
      const fx = px+0.5, fy = py+0.5;
      const a = ((v1-v2)*(fx-u2) + (u2-u1)*(fy-v2)) / den;
      const b = ((v2-v0)*(fx-u2) + (u0-u2)*(fy-v2)) / den;
      const c = 1 - a - b;
      if (a < -0.002 || b < -0.002 || c < -0.002) continue;
      const r = localToRegion(a*x0+b*x1+c*x2, a*y0+b*y1+c*y2, a*z0+b*z1+c*z2);
      data[o] = r.id; data[o+1] = r.lobeIdx; data[o+3] = 255;
    }
  }
  dilateRGBA(data, W, H, 3);                              // grow coverage past UV-island seams so NEAREST sampling never bleeds background
  return data;
}
function dilateRGBA(data, W, H, iters) {
  for (let it = 0; it < iters; it++) {
    const src = data.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y*W + x) * 4; if (src[o+3]) continue;
      for (let dy = -1; dy <= 1; dy++) { let done = false;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x+dx, ny = y+dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const no = (ny*W + nx) * 4; if (src[no+3]) { data[o] = src[no]; data[o+1] = src[no+1]; data[o+3] = 255; done = true; break; }
        }
        if (done) break;
      }
    }
  }
}

function buildFsLookup(buf) {
  const dv = new DataView(buf);
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'NB01') return null;
  const vC = dv.getUint32(4, true), fC = dv.getUint32(8, true);
  const p = new Float32Array(buf.slice(16, 16 + vC * 12));
  const reg = new Uint16Array(buf.slice(16 + vC * 12 + fC * 12));
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < vC; i++) for (let a = 0; a < 3; a++) { const v = p[i*3+a]; if (v<mn[a])mn[a]=v; if (v>mx[a])mx[a]=v; }
  const c = [(mn[0]+mx[0])/2,(mn[1]+mx[1])/2,(mn[2]+mx[2])/2], h = [(mx[0]-mn[0])/2||1,(mx[1]-mn[1])/2||1,(mx[2]-mn[2])/2||1];
  const nrm = new Float32Array(vC*3);
  for (let i=0;i<vC;i++){ nrm[i*3]=(p[i*3]-c[0])/h[0]; nrm[i*3+1]=(p[i*3+1]-c[1])/h[1]; nrm[i*3+2]=(p[i*3+2]-c[2])/h[2]; }
  const G=24, cell=2/G, grid=new Map(), key=(a,b,d)=>(a*G+b)*G+d, bi=v=>Math.max(0,Math.min(G-1,Math.floor((v+1)/cell)));
  for (let i=0;i<vC;i++){ const k=key(bi(nrm[i*3]),bi(nrm[i*3+1]),bi(nrm[i*3+2])); let a=grid.get(k); if(!a){a=[];grid.set(k,a);} a.push(i); }
  return (x,y,z)=>{ const cx=bi(x),cy=bi(y),cz=bi(z); let best=-1,bd=1e9;
    for(let r=1;r<=3&&best<0;r++) for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++)for(let dz=-r;dz<=r;dz++){
      if(r>1&&Math.max(Math.abs(dx),Math.abs(dy),Math.abs(dz))!==r)continue;
      const ix=cx+dx,iy=cy+dy,iz=cz+dz; if(ix<0||iy<0||iz<0||ix>=G||iy>=G||iz>=G)continue;
      const a=grid.get(key(ix,iy,iz)); if(!a)continue;
      for(const i of a){ const ex=nrm[i*3]-x,ey=nrm[i*3+1]-y,ez=nrm[i*3+2]-z,d=ex*ex+ey*ey+ez*ez; if(d<bd){bd=d;best=i;} } }
    return best<0?null:reg[best]; };
}

/* Cheap subsurface scattering (issue #12). The pack's *_SSS maps are grayscale thickness masks
   (bright = thin/translucent tissue, dark = deep sulci). We supply the fleshy scatter colour and,
   per directional light, add a back-translucency lobe (light wrapping through thin tissue toward the
   viewer) plus a soft terminator wrap — injected after the standard lighting so it composes with the
   PBR base + IBL. Applied to every part; for the cortex it's folded into the region-overlay shader. */
const SSS_BODY = `
  #if ( NUM_DIR_LIGHTS > 0 )
  {
    float sssThick = texture2D( uSSSMap, vMapUv ).r;
    vec3 sssV = normalize( vViewPosition );
    vec3 sssAccum = vec3( 0.0 );
    for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
      vec3 sssL = directionalLights[ i ].direction;
      vec3 sssH = normalize( sssL + normal * 0.4 );
      float sssBack = pow( clamp( dot( sssV, -sssH ), 0.0, 1.0 ), 3.0 );
      float sssWrap = clamp( dot( normal, sssL ) * 0.5 + 0.5, 0.0, 1.0 );
      sssAccum += directionalLights[ i ].color * ( sssBack * 1.5 + sssWrap * 0.2 );
    }
    reflectedLight.directDiffuse += uSSSColor * uSSSStrength * sssThick * sssAccum;
  }
  #endif`;
function applySSS(shader, mapU, colorU, strengthU) {
  shader.uniforms.uSSSMap = mapU; shader.uniforms.uSSSColor = colorU; shader.uniforms.uSSSStrength = strengthU;
  shader.fragmentShader = 'uniform sampler2D uSSSMap;\nuniform vec3 uSSSColor;\nuniform float uSSSStrength;\n' +
    shader.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>' + SSS_BODY);
}

/* The CGTrader pack is Royalty-Free "No AI": it may ship in a public web app only as an "Incorporated
   Product" — not extractable in the form downloaded from CGTrader. §21A.3 names "encrypting the Product
   data" as an approved safeguard, so the geometry is AES-GCM encrypted (assets/propack/brainpack.bin,
   built by tools/protect-assets.cjs) and decrypted in memory here — no plain .glb sits at a public URL. */
const _AK = '5d8f1a3c7e0b9426d1f4a8c2e5b709836af2d4c1e8b305f7a9c2e4d6b801f3a5';
async function loadProtectedGLB(url) {
  const ab = await fetch(url).then(r => { if (!r.ok) throw new Error('asset ' + r.status); return r.arrayBuffer(); });
  const b = new Uint8Array(ab);
  const iv = b.subarray(0, 12), body = b.subarray(12);             // file = iv(12) | ciphertext | tag(16)
  const keyBytes = Uint8Array.from(_AK.match(/../g).map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, body);
  return new GLTFLoader().parseAsync(plain, '');
}

export async function createProBrain(url, tier = '2k') {
  const baseUrl = import.meta.url;
  const u = url || new URL('../assets/propack/brainpack.bin', baseUrl).href;   // AES-GCM encrypted (license safeguard)
  const [gltf, fsBuf, fsReg] = await Promise.all([
    loadProtectedGLB(u),
    fetch(new URL('../assets/fsaverage.bin', baseUrl)).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null),
    fetch(new URL('../assets/fsaverage-regions.json', baseUrl)).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  const scene = gltf.scene;

  // collect part meshes by name
  const parts = {};
  scene.traverse(o => { if (o.isMesh && o.geometry) { const k = PART_KEYS.find(p => o.name.replace(/[\s_]/g,'').toLowerCase().includes(p.toLowerCase())); if (k) parts[k] = o; } });
  const brainMesh = parts.Brain;

  // wrapper groups: group(lifespan scale) > orient(centre+rotate) > scene
  const orient = new THREE.Group(); orient.add(scene);
  const group = new THREE.Group(); group.add(orient);

  // centre on the overall bounds, auto-orient (posterior = toward the cerebellum), scale to ~1.8
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  scene.position.sub(ctr);
  const brainC = brainMesh ? new THREE.Box3().setFromObject(brainMesh).getCenter(new THREE.Vector3()).sub(ctr) : new THREE.Vector3();
  const cbC = parts.Cerebellum ? new THREE.Box3().setFromObject(parts.Cerebellum).getCenter(new THREE.Vector3()).sub(ctr) : new THREE.Vector3(0,0,-1);
  const post = cbC.clone().sub(brainC);                 // brain → cerebellum ≈ posterior(-inferior)
  orient.rotation.y = Math.PI - Math.atan2(post.x, post.z);   // rotate so posterior faces -Z (anterior +Z)
  orient.scale.setScalar(1.8 / (Math.max(size.x, size.y, size.z) || 1));

  // ---- subsurface scattering uniforms (issue #12): scatter colour + strength shared, thickness map per part ----
  const SSS_TINT = { value: new THREE.Vector3(0.62, 0.17, 0.13) };   // fleshy tissue scatter colour
  const SSS_STRENGTH = { value: 1.6 };   // tuned in-browser: warm/translucent but not garish, lobe overlay stays readable
  const sssMapU = {}; for (const k of PART_KEYS) sssMapU[k] = { value: null };

  // ---- textures (reloadable per tier) ----
  const loader = new THREE.TextureLoader();
  const texCache = {};
  function loadPartTex(t) {
    for (const k of PART_KEYS) {
      const m = parts[k]; if (!m) continue;
      const set = TEX[k];
      const path = n => new URL(`../assets/propack/${t}/${n}`, baseUrl).href;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      const base = loader.load(path(set.base)); base.colorSpace = THREE.SRGBColorSpace; base.flipY = false;
      const nrm = loader.load(path(set.normal)); nrm.flipY = false;
      const rgh = loader.load(path(set.rough)); rgh.flipY = false;
      mat.map = base; mat.normalMap = nrm; mat.roughnessMap = rgh; mat.roughness = 1; mat.metalness = 0;
      if (set.sss) { const sss = loader.load(path(set.sss)); sss.flipY = false; sssMapU[k].value = sss; }   // grayscale thickness (linear)
      mat.needsUpdate = true;
      texCache[k] = mat;
    }
  }
  loadPartTex(tier);

  // ---- region transfer onto the cerebrum + overlay/highlight shader ----
  const nn = (fsBuf && fsReg) ? buildFsLookup(fsBuf) : null;
  const idToName = fsReg ? fsReg.idToName : {}; const nameToId = {}; for (const k in idToName) nameToId[idToName[k]] = +k;
  const cc = new THREE.Color();
  const uLobeCol = { value: LOBES.map(k => { cc.setHex(EXT_LOBE_COLORS[k] ?? EXT_LOBE_COLORS.other); return new THREE.Vector3(cc.r, cc.g, cc.b); }) };
  const uOverlay = { value: 0 }, uSelR = { value: -1 }, uSelL = { value: -1 }, uHovR = { value: -1 }, uHovL = { value: -1 }, uAff = { value: new Array(7).fill(0) };
  let brainVertName = [], brainVertLobe = [], regionAtUV = null, regionLocalC = {}, lobeLocalC = {};

  if (brainMesh) {
    const g = brainMesh.geometry; g.computeBoundingBox();
    const bb = g.boundingBox, c2 = bb.getCenter(new THREE.Vector3());
    const hx=(bb.max.x-bb.min.x)/2||1, hy=(bb.max.y-bb.min.y)/2||1, hz=(bb.max.z-bb.min.z)/2||1;
    const pos = g.attributes.position, V = pos.count;
    brainVertName = new Array(V); brainVertLobe = new Array(V);
    // The pack is authored Z-up (Blender); the Brain node carries a baked +90° X rotation so it
    // DISPLAYS Y-up, but this raw geometry is still in the authored frame. There the cortex axes are
    //   local X = left-right,  local Y = anterior(+)/posterior(-),  local Z = inferior(+)/superior(-)
    // (verified live: cerebellum sits at local +Z/-Y, world-up = local -Z). Map straight into
    // fsaverage's normalized RAS (x=L-R right+, y=superior+, z=anterior+). No yaw: the half-cerebrum
    // is axis-aligned (verts at local x≈0..-1.4), so orient.rotation.y is a display-only 3/4 view.
    const localToRegion = (px, py, pz) => {
      const nx=(px-c2.x)/hx, ny=(py-c2.y)/hy, nz=(pz-c2.z)/hz;
      const lr = (nx - 1) / 2;   // single hemisphere: midline(nx=+1)→0, lateral(nx=-1)→-1 (fs left)
      const si = -nz;            // local +Z is inferior → superior = -nz
      const ap =  ny;            // local +Y is anterior
      let name, lobe, rid = 255;
      if (nn) { const r = nn(lr, si, ap); if (r != null) { name = idToName[r] || 'unknown'; lobe = DK_LOBES[name] || 'other'; rid = r; } }
      if (rid === 255) { lobe = coarseLobe(lr, si, ap, 1); name = lobe; }
      return { id: rid, lobeIdx: LOBE_IDX[lobe] ?? LOBE_IDX.other, name };
    };
    const _ra = {}, _la = {};                           // accumulate local-space centroids per region / lobe (issue #17 focus)
    for (let i = 0; i < V; i++) {                       // per-vertex names: fallback for picking
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const r = localToRegion(px, py, pz);
      brainVertName[i] = r.name; brainVertLobe[i] = LOBES[r.lobeIdx];
      if (r.id !== 255) { const a = _ra[r.name] || (_ra[r.name] = [0, 0, 0, 0]); a[0] += px; a[1] += py; a[2] += pz; a[3]++; }   // skip coarse-lobe fallback keys — keep regionLocalC DK-only (#17 review)
      const lk = LOBES[r.lobeIdx], b = _la[lk] || (_la[lk] = [0, 0, 0, 0]); b[0] += px; b[1] += py; b[2] += pz; b[3]++;
    }
    for (const k in _ra) { const a = _ra[k]; regionLocalC[k] = new THREE.Vector3(a[0]/a[3], a[1]/a[3], a[2]/a[3]); }
    for (const k in _la) { const a = _la[k]; lobeLocalC[k] = new THREE.Vector3(a[0]/a[3], a[1]/a[3], a[2]/a[3]); }

    // ---- bake region id + lobe into a UV-space texture, sampled PER-FRAGMENT (issue #11) ----
    // Per-vertex region painting follows the mesh triangles (blocky), and interpolating integer ids
    // across a triangle then thresholding misplaces the boundary. Rasterise each triangle in UV space,
    // resolve the region from each texel's interpolated 3D position, and sample it per-fragment →
    // smooth boundaries at texture resolution. The mirror shares these UVs and DK regions are
    // bilaterally symmetric, so one texture correctly drives both hemispheres.
    const RT = 2048;
    const regionData = bakeRegionUV(g, RT, localToRegion);
    const regionTex = new THREE.DataTexture(regionData, RT, RT, THREE.RGBAFormat, THREE.UnsignedByteType);
    regionTex.flipY = false; regionTex.minFilter = THREE.NearestFilter; regionTex.magFilter = THREE.NearestFilter; regionTex.needsUpdate = true;
    const uRegionTex = { value: regionTex };
    const uRegionTexel = { value: new THREE.Vector2(1 / RT, 1 / RT) };
    regionAtUV = (u, v) => {                             // click → the exact region the shader paints
      const x = Math.min(RT-1, Math.max(0, Math.floor(u*RT))), y = Math.min(RT-1, Math.max(0, Math.floor(v*RT)));
      const o = (y*RT + x) * 4; if (!regionData[o+3]) return null;
      return regionData[o] < 255 ? (idToName[regionData[o]] || 'unknown') : LOBES[regionData[o+1]];
    };

    const bmat = Array.isArray(brainMesh.material) ? brainMesh.material[0] : brainMesh.material;
    bmat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, { uOverlay, uSelR, uSelL, uHovR, uHovL, uAff, uLobeCol, uRegionTex, uRegionTexel });
      s.vertexShader = 'varying vec2 vRegionUv;\n' +
        s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRegionUv = uv;');
      s.fragmentShader = 'varying vec2 vRegionUv;\nuniform sampler2D uRegionTex;\nuniform vec2 uRegionTexel;\nuniform float uOverlay;\nuniform vec3 uLobeCol[7];\nuniform float uSelR;\nuniform float uSelL;\nuniform float uHovR;\nuniform float uHovL;\nuniform float uAff[7];\n' +
        s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        // 9-tap feather over ~1.3 texels: anti-aliases the (texel-quantised) region/lobe boundaries so
        // selection + overlay edges read as smooth ramps instead of stair-steps, even zoomed in (issue #11).
        vec2 rOff[9];
        rOff[0]=vec2(0.0); rOff[1]=vec2(1.0,0.0); rOff[2]=vec2(-1.0,0.0); rOff[3]=vec2(0.0,1.0); rOff[4]=vec2(0.0,-1.0);
        rOff[5]=vec2(0.7,0.7); rOff[6]=vec2(0.7,-0.7); rOff[7]=vec2(-0.7,0.7); rOff[8]=vec2(-0.7,-0.7);
        vec3 lobeCol = vec3(0.0); float selA = 0.0, hovA = 0.0, affA = 0.0;
        for (int t = 0; t < 9; t++) {
          vec4 rg = texture2D(uRegionTex, vRegionUv + rOff[t] * uRegionTexel * 1.3);
          float rid = floor(rg.r * 255.0 + 0.5);
          int li = clamp(int(floor(rg.g * 255.0 + 0.5)), 0, 6);
          lobeCol += uLobeCol[li];
          affA += uAff[li];
          selA += (abs(rid-uSelR) < 0.5 || abs(float(li)-uSelL) < 0.5) ? 1.0 : 0.0;
          hovA += (abs(rid-uHovR) < 0.5 || abs(float(li)-uHovL) < 0.5) ? 1.0 : 0.0;
        }
        lobeCol /= 9.0; selA /= 9.0; hovA /= 9.0; affA /= 9.0;
        diffuseColor.rgb = mix(diffuseColor.rgb, lobeCol, uOverlay*0.8);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5,0.92,1.0), selA*0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0,0.28,0.28), affA*0.5);
        diffuseColor.rgb += vec3(0.16)*hovA;`);
      applySSS(s, sssMapU.Brain, SSS_TINT, SSS_STRENGTH);   // subsurface translucency on the cortex (issue #12)
    };
    bmat.needsUpdate = true;
  }

  // subsurface translucency on the deep parts too (cortex got it folded into its overlay shader above)
  for (const k of PART_KEYS) {
    if (k === 'Brain') continue;
    const m = parts[k]; if (!m) continue;
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    mat.onBeforeCompile = (s) => applySSS(s, sssMapU[k], SSS_TINT, SSS_STRENGTH);
    mat.needsUpdate = true;
  }

  // ---- mirror the (half) cerebrum across the midline → a complete cerebrum ----
  // The pack ships ONE cerebral hemisphere (verts all on local -x, flat cut face at x≈0)
  // while the deep parts are full/bilateral. Reflect the hemisphere across x=0 and SHARE
  // its material so the overlay/highlight/ghost/tier shader drives both halves at once.
  let brainMirror = null;
  if (brainMesh) {
    const mg = brainMesh.geometry.clone();
    const mp = mg.attributes.position;
    for (let i = 0; i < mp.count; i++) mp.setX(i, -mp.getX(i));
    mp.needsUpdate = true;
    const mnr = mg.attributes.normal;
    if (mnr) { for (let i = 0; i < mnr.count; i++) mnr.setX(i, -mnr.getX(i)); mnr.needsUpdate = true; }
    if (mg.index) {                                   // reverse winding so faces stay outward after the reflection
      const idx = mg.index.array;
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      mg.index.needsUpdate = true;
    }
    if (mg.attributes.tangent) mg.deleteAttribute('tangent');   // fall back to derivative normal-mapping (correct under mirror)
    mg.computeBoundingBox(); mg.computeBoundingSphere();
    brainMirror = new THREE.Mesh(mg, brainMesh.material);        // SHARE material → one shader, both halves react together
    brainMirror.name = 'BrainMirror';
    brainMirror.castShadow = true; brainMirror.receiveShadow = brainMesh.receiveShadow;
    brainMirror.position.copy(brainMesh.position);
    brainMirror.quaternion.copy(brainMesh.quaternion);
    brainMirror.scale.copy(brainMesh.scale);
    brainMesh.parent.add(brainMirror);
  }

  // shadows + part region tags
  const partMeshes = {};
  for (const k of PART_KEYS) { const m = parts[k]; if (!m) continue; m.castShadow = true;
    if (k !== 'Brain') { m.userData = { kind: 'part', region: PART_REGION[k] }; partMeshes[k] = m; } }

  const pickables = Object.values(parts); if (brainMirror) pickables.push(brainMirror);
  const isLobe = k => k in LOBE_IDX;
  function setPartEmissive(regionKey, kind) {
    for (const k in partMeshes) { const m = partMeshes[k], on = PART_REGION[k] === regionKey;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      mat.emissive = mat.emissive || new THREE.Color();
      mat.emissive.setHex(kind === 'sel' ? 0x2b6f8a : kind === 'aff' ? 0x6b1414 : 0x000000);
      mat.emissiveIntensity = on ? (kind === 'sel' ? 0.8 : 0.6) : 0.0;
    }
  }
  // re-centre on the FULL assembled brain (the initial centring used the lopsided half-cerebrum's
  // centroid, leaving the now-mirrored whole brain offset). Done at orient level so group.scale
  // (lifespan) still scales about the true centre.
  group.updateWorldMatrix(true, true);
  const fc = new THREE.Box3().setFromObject(orient).getCenter(new THREE.Vector3());
  orient.position.sub(fc);

  return {
    group, cortex: brainMesh, cerebellum: parts.Cerebellum || null, brainstem: parts.FourthVentricle || null,
    pickables, isPro: true, isPhotoreal: true, hasRegions: true, tier,
    regionFromIntersection: (hit) => {
      if (hit.object === brainMesh || hit.object === brainMirror) {
        if (hit.uv && regionAtUV) { const n = regionAtUV(hit.uv.x, hit.uv.y); if (n) return n; }
        return hit.face ? brainVertName[hit.face.a] : null;   // fallback if the hit carries no uv
      }
      return hit.object?.userData?.region || null;
    },
    setSelected(k) { uSelL.value = isLobe(k) ? LOBE_IDX[k] : -1; uSelR.value = (!isLobe(k) && k in nameToId) ? nameToId[k] : -1; setPartEmissive(k, 'sel'); },
    setHover(k) { uHovL.value = isLobe(k) ? LOBE_IDX[k] : -1; uHovR.value = (!isLobe(k) && k in nameToId) ? nameToId[k] : -1; },
    // world-space centroid for a region / lobe / deep part — used to fly the camera to focus (issue #17)
    centroidOf(k) {
      const v = new THREE.Vector3();
      if (isLobe(k) && lobeLocalC[k]) v.copy(lobeLocalC[k]);
      else if (regionLocalC[k]) v.copy(regionLocalC[k]);
      else {
        let pm = null; for (const pk in partMeshes) if (PART_REGION[pk] === k) pm = partMeshes[pk];
        if (!pm) return null;
        pm.geometry.computeBoundingBox(); pm.geometry.boundingBox.getCenter(v);
        pm.updateWorldMatrix(true, false); return pm.localToWorld(v);
      }
      if (!brainMesh) return null;
      brainMesh.updateWorldMatrix(true, false); return brainMesh.localToWorld(v);
    },
    setColorMode(mode) { uOverlay.value = (mode === 'lobes') ? 0.6 : 0; },
    setAffected(keys) { const a = new Array(7).fill(0); (keys||[]).forEach(k => { if (k in LOBE_IDX) a[LOBE_IDX[k]] = 1; }); uAff.value = a; (keys||[]).forEach(k => setPartEmissive(k, 'aff')); },
    setGhost(on) { Object.values(parts).forEach(m => { const mt = Array.isArray(m.material) ? m.material[0] : m.material; mt.transparent = on; mt.opacity = on ? 0.5 : 1; mt.depthWrite = !on; mt.needsUpdate = true; }); },
    setInterior(on) { const sd = on ? THREE.DoubleSide : THREE.FrontSide; pickables.forEach(m => { const mt = Array.isArray(m.material) ? m.material[0] : m.material; if (mt.side !== sd) { mt.side = sd; mt.needsUpdate = true; } }); },   // double-side so inner walls render when flying inside (issue #15)
    setClip(planes) {   // material clipping planes for the cross-section tool (issue #18)
      const list = [brainMesh, brainMirror, ...Object.values(parts)].filter(Boolean);
      list.forEach(m => { const mts = Array.isArray(m.material) ? m.material : [m.material]; mts.forEach(mt => { mt.clippingPlanes = planes || null; mt.clipShadows = true; mt.needsUpdate = true; }); });
    },
    setTier(t) { if (t !== this.tier) { this.tier = t; loadPartTex(t); } },
    setSSS(strength) { SSS_STRENGTH.value = strength; },   // subsurface translucency amount (issue #12)
    applyLifespan(age, sexFactor) {
      let vol; if (age<=2) vol=0.28+0.47*(age/2); else if (age<=5) vol=0.75+0.17*((age-2)/3); else if (age<=22) vol=0.92+0.08*((age-5)/17); else if (age<=40) vol=1; else vol=1-0.10*((age-40)/50);
      group.scale.setScalar(Math.cbrt(vol) * (1 + 0.035 * sexFactor)); return { volumeScale: vol };
    },
  };
}
