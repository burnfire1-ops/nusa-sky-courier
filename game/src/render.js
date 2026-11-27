// Renderer — Three.js r187 scene for Nusa Sky Courier. (Skills: router /
// threejs-scene-setup / threejs-materials-lighting / threejs-geometry /
// threejs-performance / camera-systems / game-feel.) Meshes are a view of
// world state: buildScene creates them once, updateScene copies world
// state onto them every frame. M10: smooth lathe + soft tier blend,
// asphalt runway, two-layer soft clouds, sea foam, stealth jet.
// M11: natural volcano — asymmetric silhouette, crater + lava pool +
// lava flow, irregular ridges (volcano only; city/green byte-identical).
import * as THREE from 'three';
import { PALETTE, ISLANDS, LANDMARKS, CAMERA, PERF } from './config.js';
import { mergeGeometries } from './merge.js';
// M12-clean N1: the pure terrain math moved to terrain.js (node-testable);
// render.js keeps only the THREE-facing wrappers. DEG/clamp live in util.js.
import { hash2, smoothstep, volcanoAngleMod, lavaFlowMask, tierColor, islandProfileData, islandSurfaceY } from './terrain.js';
import { DEG } from './util.js';
import { AIRCRAFT, taperPositions, gearDown, fuselageRadiusAt } from './aircraft.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  return renderer;
}

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...opts });
}

// Thin THREE-facing wrapper over the pure profile data (terrain.js):
// LatheGeometry reads .x/.y off Vector2s, so the data pairs are wrapped
// here and nowhere else.
function islandProfile(island) {
  return islandProfileData(island).map(([x, y]) => new THREE.Vector2(x, y));
}

const _tierColor = new THREE.Color();
const _tierBlend = new THREE.Color();
const _lavaColor = new THREE.Color(PALETTE.lava);
const _rockDarkColor = new THREE.Color(PALETTE.rockDark);

function buildIslandGeometry(island) {
  // M10.1: 28 -> 48 lathe segments (threejs-geometry: segment count
  // trades smoothness for vertex count) so the cone silhouette and the
  // slope shading read smooth, not faceted. ~1.5k tris/island, still
  // far inside the <40k budget.
  const geo = new THREE.LatheGeometry(islandProfile(island), 48);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    let x = pos.getX(i);
    const y = pos.getY(i);
    let z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const t = Math.min(1, Math.max(0, y / island.height));
    const a = r > 1 ? Math.atan2(z, x) : 0;
    const rl = r / island.radius; // radius fraction, pre-displacement
    if (r > 1) {
      // M11.1: asymmetric silhouette (volcano only) — low-frequency
      // angular modulation, faded to 0 below 0.08h so the beach ring +
      // foam ring stay circular and the lighthouse stays on sand.
      let nr = r;
      if (island.kind === 'volcano') {
        const w = smoothstep(0.08, 0.30, t);
        nr = r * (1 + (volcanoAngleMod(island, a) - 1) * w);
      }
      // Micro-irregularity (M8, 80 -> 60: the low-frequency M11.1
      // modulation now carries the silhouette, the noise is texture).
      const n = hash2(Math.cos(a) * 5 + island.x * 0.01, Math.sin(a) * 5 + island.z * 0.01) - 0.5;
      nr += n * 60 * Math.sin(Math.PI * t);
      x = (x / r) * nr;
      z = (z / r) * nr;
      pos.setX(i, x);
      pos.setZ(i, z);
    }
    // M11.2: crater notch on the south face (a = -PI/2 faces the runway
    // and the shot-1 camera, which looks north) — the rim dips ~0.08h
    // there so the crater + lava read from the front, not only from
    // above. Fades to 0 below 0.88h; the crater floor tilts with it.
    // Colours below still use the original y (profile height), not the
    // notched y, so the tiers stay tied to the profile.
    if (island.kind === 'volcano' && y > island.height * 0.88) {
      const notch = Math.pow(Math.max(0, Math.cos(a + Math.PI / 2)), 2);
      const wy = (y / island.height - 0.88) / 0.12;
      pos.setY(i, y - notch * 0.08 * island.height * wy);
    }
    tierColor(island.kind, y, island.height, island.x + x, island.z + z, _tierColor, _tierBlend);
    // M9 gullies: darker radial wedges down the slope, seeded per angle
    // (threejs-geometry: per-vertex colour variation on the lathe rings),
    // so the bands read as carved terrain, not flat paint. Skipped on
    // beach + snow so those stay bright and crisp.
    if (y > 8 && t <= 0.82) {
      let g = 0.88 + 0.2 * hash2(Math.cos(a) * 7 + island.x * 0.01, Math.sin(a) * 7 + island.z * 0.01);
      if (island.kind === 'volcano') {
        // M11.3: irregular ridges — a low-frequency envelope makes some
        // sectors deeply carved and others nearly smooth, instead of
        // uniform wedges all around. Broad wedges (freq 3) + the fine
        // M9 variation, so ridges read at both distances.
        const env = 0.5 + 0.5 * Math.sin(3 * a + hash2(island.x * 0.01, 51) * Math.PI * 2);
        const broad = hash2(Math.cos(a) * 3 + island.x * 0.01, Math.sin(a) * 3 + island.z * 0.01);
        g = 1 - env * (0.05 + 0.22 * broad);
      }
      _tierColor.multiplyScalar(g);
    }
    // M11.2 crater interior (volcano only): dark rim + glowing floor,
    // so the bowl reads as a crater from above (shot 2) instead of a
    // pale snow cap. Outer wall (rl > 0.215) keeps its tier colour.
    if (island.kind === 'volcano' && y > island.height * 0.90 && rl < 0.215) {
      if (rl < 0.155) _tierColor.lerp(_lavaColor, 0.6);
      else _tierColor.lerp(_rockDarkColor, 0.75);
    }
    // M11.2 lava flow (volcano only): vertex-colour tongue from the
    // notch down the south face — 0 draw calls. The pool disc below
    // covers the from-above view; the flow covers the front view.
    if (island.kind === 'volcano') {
      const flow = lavaFlowMask(island, a, y);
      if (flow > 0) _tierColor.lerp(_lavaColor, flow);
    }
    colors[i * 3] = _tierColor.r;
    colors[i * 3 + 1] = _tierColor.g;
    colors[i * 3 + 2] = _tierColor.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

// Merge [{ geo, color }] into ONE vertex-colored mesh (1 draw call).
// Geometries are translated/rotated by the caller, then disposed here.
function mergeParts(specs, materialOpts = {}) {
  const parts = specs.map(({ geo, color }) => {
    const c = new THREE.Color(color);
    const part = {
      positions: geo.attributes.position.array,
      normals: geo.attributes.normal.array,
      uvs: geo.attributes.uv.array,
      color: [c.r, c.g, c.b],
      index: geo.index.array,
    };
    geo.dispose();
    return part;
  });
  const merged = mergeGeometries(parts);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(merged.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(merged.normals, 3));
  if (merged.uvs) geo.setAttribute('uv', new THREE.BufferAttribute(merged.uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(merged.colors, 3));
  geo.setIndex(new THREE.BufferAttribute(merged.index, 1));
  // M10: extra material opts (transparent/opacity) pass through for
  // basic materials too — 'basic' itself is stripped, not forwarded.
  const { basic, ...rest } = materialOpts;
  return new THREE.Mesh(
    geo,
    basic
      ? new THREE.MeshBasicMaterial({ vertexColors: true, ...rest })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, ...rest }),
  );
}

// Runtime CanvasTexture — procedural, no external file (references gate:
// only data: URIs or files inside game/).
// M10.5: twin-jet exhaust glow (a stealth jet has no propeller) —
// radial orange gradient, brightest at the core, transparent rim.
// Replaces the old prop-blur disc; same single mesh, same draw call.
function exhaustTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,195,100,0.9)');
  g.addColorStop(0.4, 'rgba(255,110,30,0.5)');
  g.addColorStop(1, 'rgba(255,80,10,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// M10.2: runway asphalt — seeded speckle + faint twin tyre streaks.
function asphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2b2b33';
  ctx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 260; i += 1) {
    const a = 0.05 + 0.12 * hash2(i * 1.7, i);
    ctx.fillStyle = `rgba(120, 120, 130, ${a.toFixed(2)})`;
    ctx.fillRect(hash2(i, i * 2.3) * 128, hash2(i * 3.3, i) * 256, 1 + hash2(i, 7) * 3, 1 + hash2(9, i) * 3);
  }
  for (const cx of [48, 80]) {
    const g = ctx.createLinearGradient(cx - 10, 0, cx + 10, 0);
    g.addColorStop(0, 'rgba(10,10,14,0)');
    g.addColorStop(0.5, 'rgba(10,10,14,0.35)');
    g.addColorStop(1, 'rgba(10,10,14,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 10, 0, 20, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 10);
  return tex;
}

// M10.3: soft-edged cloud blob — radial falloff so clouds read as
// vapour, not flat paper cutouts. Tint comes from instanceColor.
function cloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function stripeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  // M12-clean N4: the stripe colours ARE the palette lighthouse
  // colours (same values) — reference them instead of duplicating
  // the literals.
  const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;
  const bands = [css(PALETTE.lighthouseWhite), css(PALETTE.lighthouseRed),
    css(PALETTE.lighthouseWhite), css(PALETTE.lighthouseRed)];
  bands.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, i * 64, 64, 64);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildScene(world) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyDusk);
  scene.fog = new THREE.Fog(PALETTE.skyDusk, 8000, 40000);

  scene.add(new THREE.HemisphereLight(0xffb36b, 0x1c2f4a, 1.5));
  const sun = new THREE.DirectionalLight(PALETTE.skyHorizon, 2.4);
  // Cool fill from the north-west so the sea still reads as water under the orange dusk key.
  const fill = new THREE.DirectionalLight(0x88aaff, 0.7);
  fill.position.set(-6000, 4000, 8000);
  scene.add(fill);
  sun.position.set(8000, 6000, -4000);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -4000; sun.shadow.camera.right = 4000;
  sun.shadow.camera.top = 4000; sun.shadow.camera.bottom = -4000;
  sun.shadow.camera.near = 100; sun.shadow.camera.far = 30000;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  // Sea — low-poly plane with a procedural sun-glint texture (CanvasTexture
  // generated at runtime; no external file). Speckles are hash2-seeded, so
  // the texture is identical on every load.
  const seaCanvas = document.createElement('canvas');
  seaCanvas.width = 256;
  seaCanvas.height = 256;
  {
    const ctx = seaCanvas.getContext('2d');
    ctx.fillStyle = '#2a7ba8';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 46; i += 1) {
      const a = 0.06 + 0.14 * hash2(i, i * 3.7);
      ctx.fillStyle = `rgba(8, 50, 80, ${a.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(hash2(i * 1.3, 7) * 256, hash2(11, i * 2.1) * 256, 12 + hash2(i, 5) * 30, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 700; i += 1) {
      const a = 0.12 + 0.4 * hash2(i * 2.7, i);
      ctx.fillStyle = `rgba(159, 216, 232, ${a.toFixed(2)})`;
      ctx.fillRect(hash2(i, i * 1.9) * 256, hash2(i * 3.1, i) * 256, 1 + hash2(i, 9) * 2, 1 + hash2(4, i) * 2);
    }
    for (let i = 0; i < 60; i += 1) {
      ctx.fillStyle = `rgba(255, 240, 210, ${(0.5 + 0.4 * hash2(i * 5, i)).toFixed(2)})`;
      ctx.fillRect(hash2(i * 7, i) * 256, hash2(i, i * 6) * 256, 1, 1);
    }
    // M10.4: large soft warm patches (sun-path mottling) + big soft dark
    // swells, so the sea reads with depth at 48x repeat instead of a
    // flat sparkle field.
    for (let i = 0; i < 12; i += 1) {
      const a = 0.05 + 0.07 * hash2(i * 9.1, 3);
      ctx.fillStyle = `rgba(255, 200, 140, ${a.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(hash2(i * 4.4, 21) * 256, hash2(31, i * 3.3) * 256, 40 + hash2(i, 17) * 45, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 8; i += 1) {
      const a = 0.05 + 0.06 * hash2(i * 6.7, 8);
      ctx.fillStyle = `rgba(6, 40, 64, ${a.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(hash2(i * 2.9, 41) * 256, hash2(51, i * 4.7) * 256, 50 + hash2(i, 23) * 50, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const seaTex = new THREE.CanvasTexture(seaCanvas);
  seaTex.colorSpace = THREE.SRGBColorSpace;
  seaTex.wrapS = THREE.RepeatWrapping;
  seaTex.wrapT = THREE.RepeatWrapping;
  seaTex.repeat.set(48, 48);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(60000, 60000, 1, 1),
    new THREE.MeshStandardMaterial({ map: seaTex, roughness: 0.28, metalness: 0.3, emissive: 0x0a2a3a, emissiveIntensity: 0.4 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -2, 10000);
  sea.receiveShadow = true;
  scene.add(sea);

  // M10.4: foam ring at each island's waterline (beach edge) — one
  // merged basic-material mesh, 1 draw call, soft white surf.
  {
    const foamParts = ISLANDS.map((island) => {
      const geo = new THREE.RingGeometry(island.radius * 1.02, island.radius * 1.13, 48);
      geo.rotateX(-Math.PI / 2);
      geo.translate(island.x, 0.5, island.z);
      return { geo, color: 0xeaf6f8 };
    });
    const foam = mergeParts(foamParts, { basic: true, transparent: true, opacity: 0.35, depthWrite: false });
    scene.add(foam);
  }

  // Sky dome — gradient vertex colours + a sun glow baked toward the key
  // light's azimuth (south-east), so the dusk reads on the horizon the
  // camera faces. BackSide, no fog: 1 draw call, no separate sun mesh.
  {
    const domeGeo = new THREE.SphereGeometry(42000, 24, 16);
    const pos = domeGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const top = new THREE.Color(0x1a1030);
    const mid = new THREE.Color(0x4a2a55);
    const horizon = new THREE.Color(0xff8c42);
    const low = new THREE.Color(0x14324a);
    const glow = new THREE.Color(0xffd9a0);
    const sunAz = new THREE.Vector2(8000, -4000).normalize();
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i) / 42000;
      const z = pos.getZ(i);
      if (y >= 0.3) c.copy(mid).lerp(top, (y - 0.3) / 0.7);
      else if (y >= 0) c.copy(horizon).lerp(mid, y / 0.3);
      else if (y >= -0.12) c.copy(low).lerp(horizon, (y + 0.12) / 0.12);
      else c.copy(low);
      // Sun glow: strongest near the horizon toward the key light.
      const az = new THREE.Vector2(x, z).normalize();
      const facing = Math.max(0, az.dot(sunAz));
      const band = Math.max(0, 1 - Math.abs(y - 0.08) / 0.25);
      c.lerp(glow, Math.pow(facing, 3) * band * 0.55);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    domeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const dome = new THREE.Mesh(
      domeGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }),
    );
    dome.position.set(0, 0, 10000);
    scene.add(dome);
  }

  // Islands — tiered lathe with vertex colours (one shared vertex-color
  // material, one mesh each), plus a lava cap on Bara, a city block on
  // Tanjung. (threejs-geometry: LatheGeometry profile; threejs-performance:
  // same 3 island calls as the old cones.)
  const islandMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  for (const island of ISLANDS) {
    const islandMesh = new THREE.Mesh(buildIslandGeometry(island), islandMaterial);
    islandMesh.position.set(island.x, 0, island.z);
    islandMesh.receiveShadow = true;
    scene.add(islandMesh);
    if (island.kind === 'volcano') {
      // M11.2: lava pool inside the crater (replaces the M9 cone cap,
      // which poked above the peak like a spike) — flat disc on the
      // crater floor, same 1 draw call, emissive orange so it reads
      // from above (shot 2) and through the south rim notch (shot 1).
      const pool = new THREE.Mesh(
        new THREE.CircleGeometry(island.radius * 0.12, 24),
        new THREE.MeshStandardMaterial({ color: PALETTE.lava, emissive: 0xff3d00, emissiveIntensity: 2.4, roughness: 0.6, side: THREE.DoubleSide }),
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(island.x, island.height * 0.925, island.z);
      scene.add(pool);
    }
    if (island.kind === 'city') {
      // Village: cream/tan bodies + red pyramid roofs, 2 InstancedMesh.
      // Same 24 grid spots as the old grey boxes (level-design: landmark
      // guides the eye to Tanjung from the air).
      const spots = [];
      for (let gx = -2; gx <= 2; gx += 1) {
        for (let gz = -2; gz <= 2; gz += 1) {
          if (gx === 0 && gz === 0) continue;
          // M12-fix S2: JS % keeps the sign of a negative operand, so 4
          // houses got negative heights (inverted boxes underground).
          // Wrap it so h is always 120..360.
          const h = 120 + ((((gx * 7 + gz * 13) % 5) + 5) % 5) * 60;
          spots.push({ x: island.x + gx * 320, z: island.z + gz * 320, h });
        }
      }
      const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
      const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, spots.length);
      const roofGeo = new THREE.ConeGeometry(150, 70, 4);
      const roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
      const roofs = new THREE.InstancedMesh(roofGeo, roofMat, spots.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const qRoof = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
      const s = new THREE.Vector3();
      const p = new THREE.Vector3();
      const col = new THREE.Color();
      const bodyCols = [PALETTE.villageCream, PALETTE.villageTan, 0x8a8578];
      spots.forEach((spot, i) => {
        // M12-fix S2: plant houses ON the slope via islandSurfaceY (like
        // the palms) — the old fixed y=0 buried most of the village
        // (terrain here is 162-204 ft).
        const gy = islandSurfaceY(island, spot.x, spot.z);
        p.set(spot.x, gy + spot.h / 2, spot.z);
        s.set(180, spot.h, 180);
        m.compose(p, q, s);
        bodies.setMatrixAt(i, m);
        col.setHex(bodyCols[(i * 7 + 3) % 3]);
        col.multiplyScalar(0.92 + 0.16 * hash2(spot.x, spot.z));
        bodies.setColorAt(i, col);
        p.set(spot.x, gy + spot.h + 35, spot.z);
        s.set(1, 1, 1);
        m.compose(p, qRoof, s);
        roofs.setMatrixAt(i, m);
        col.setHex(PALETTE.roofRed);
        col.multiplyScalar(0.85 + 0.3 * hash2(spot.z, spot.x));
        roofs.setColorAt(i, col);
      });
      bodies.count = spots.length;
      roofs.count = spots.length;
      bodies.instanceColor.needsUpdate = true;
      roofs.instanceColor.needsUpdate = true;
      bodies.castShadow = true;
      scene.add(bodies);
      scene.add(roofs);
    }
    if (island.kind === 'green') {
      // Palms: merged trunk + fronds, instanced 36× in two rings, planted
      // ON the slope via islandSurfaceY (the old y=260 buried them).
      const trunk = new THREE.CylinderGeometry(7, 10, 130, 6);
      trunk.translate(0, 65, 0);
      const fronds = new THREE.ConeGeometry(70, 240, 7);
      fronds.translate(0, 250, 0);
      const palm = mergeParts([
        { geo: trunk, color: 0x6b4a2f },
        { geo: fronds, color: PALETTE.palm },
      ]);
      const palms = new THREE.InstancedMesh(palm.geometry, palm.material, 36);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      const p = new THREE.Vector3();
      const col = new THREE.Color();
      for (let i = 0; i < 36; i += 1) {
        const ring = i < 20 ? 0.55 : 0.72;
        const a = (i / 36) * Math.PI * 2 + (i < 20 ? 0 : 0.35);
        const px = island.x + Math.cos(a) * island.radius * ring;
        const pz = island.z + Math.sin(a) * island.radius * ring;
        const sc = 0.8 + 0.4 * hash2(px, pz);
        p.set(px, islandSurfaceY(island, px, pz) - 8, pz);
        s.set(sc, sc, sc);
        m.compose(p, q, s);
        palms.setMatrixAt(i, m);
        col.setHex(PALETTE.palm);
        col.multiplyScalar(0.85 + 0.3 * hash2(pz, px));
        palms.setColorAt(i, col);
      }
      palms.instanceColor.needsUpdate = true;
      scene.add(palms);
    }
  }

  // Landmarks — one draw call each (merged or instanced), no castShadow
  // (dusk light, far from the plane: shadows would not read).
  const lm = LANDMARKS;
  // Lighthouse on Bara's south shore: striped tower + lamp in the beacon set.
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(34, 44, 380, 12),
    new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.7 }),
  );
  tower.position.set(lm.lighthouse.x, lm.lighthouse.y + 190, lm.lighthouse.z);
  scene.add(tower);
  // Viaduct across Tanjung's south bay: extruded deck with 3 arch holes.
  {
    const shape = new THREE.Shape();
    shape.moveTo(-450, 0);
    shape.lineTo(450, 0);
    shape.lineTo(450, 60);
    shape.lineTo(-450, 60);
    shape.closePath();
    for (const cx of [-280, 0, 280]) {
      const hole = new THREE.Path();
      hole.moveTo(cx - 55, 0);
      hole.absarc(cx, 0, 55, Math.PI, 0, true);
      hole.lineTo(cx + 55, 0);
      shape.holes.push(hole);
    }
    const viaductGeo = new THREE.ExtrudeGeometry(shape, { depth: 70, bevelEnabled: false });
    const viaduct = new THREE.Mesh(viaductGeo, std(0x9a8a76, { roughness: 0.95 }));
    viaduct.position.set(lm.viaduct.x, 2, lm.viaduct.z - 35);
    scene.add(viaduct);
  }
  // Hangar + apron on the sea-plane base beside the runway north end.
  {
    const pad = new THREE.BoxGeometry(520, 8, 420);
    pad.translate(0, 4, 0);
    const box = new THREE.BoxGeometry(320, 140, 220);
    box.translate(0, 78, 0);
    const roof = new THREE.ConeGeometry(200, 90, 4);
    roof.rotateY(Math.PI / 4);
    roof.scale(1.6, 1, 1.1);
    roof.translate(0, 193, 0);
    const door = new THREE.BoxGeometry(180, 100, 6);
    door.translate(0, 58, -113);
    const hangar = mergeParts([
      { geo: pad, color: 0x6a6a72 },
      { geo: box, color: PALETTE.hangarGrey },
      { geo: roof, color: 0x7a8088 },
      { geo: door, color: 0x6a7a8a },
    ]);
    hangar.position.set(lm.hangar.x, 0, lm.hangar.z);
    scene.add(hangar);
  }
  // Windsock beside the runway threshold (merged pole + sock).
  {
    const pad = new THREE.BoxGeometry(30, 6, 30);
    pad.translate(0, 3, 0);
    const pole = new THREE.CylinderGeometry(3, 4, 90, 6);
    pole.translate(0, 48, 0);
    const sock = new THREE.ConeGeometry(13, 70, 8);
    sock.rotateZ(-Math.PI / 2);
    sock.translate(35, 92, 0);
    const windsock = mergeParts([
      { geo: pad, color: 0x6a6a72 },
      { geo: pole, color: 0x8a8f98 },
      { geo: sock, color: PALETTE.planeOrange },
    ]);
    windsock.position.set(lm.windsock.x, 0, lm.windsock.z);
    scene.add(windsock);
  }
  // ILS antenna array beside the threshold (merged mast + crossbars).
  {
    const pad = new THREE.BoxGeometry(40, 6, 40);
    pad.translate(0, 3, 0);
    const mast = new THREE.BoxGeometry(6, 120, 6);
    mast.translate(0, 60, 0);
    const bar1 = new THREE.BoxGeometry(90, 6, 6);
    bar1.translate(0, 110, 0);
    const bar2 = new THREE.BoxGeometry(60, 6, 6);
    bar2.translate(0, 80, 0);
    const ils = mergeParts([
      { geo: pad, color: 0x6a6a72 },
      { geo: mast, color: 0xf2f2e8 },
      { geo: bar1, color: 0xf2f2e8 },
      { geo: bar2, color: 0xf2f2e8 },
    ]);
    ils.position.set(lm.ils.x, 0, lm.ils.z);
    scene.add(ils);
  }
  // World beacons: lighthouse lamp + runway threshold lights, one call.
  {
    const beacons = new THREE.InstancedMesh(
      new THREE.SphereGeometry(4, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      4,
    );
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    const spots = [
      { p: [lm.lighthouse.x, lm.lighthouse.y + 388, lm.lighthouse.z], c: 0xffd9a0 },
      { p: [-80, 4, -2950], c: 0x00ff66 },
      { p: [80, 4, -2950], c: 0x00ff66 },
      { p: [0, 4, -50], c: 0xffffff },
    ];
    spots.forEach((spot, i) => {
      m.makeTranslation(spot.p[0], spot.p[1], spot.p[2]);
      beacons.setMatrixAt(i, m);
      col.setHex(spot.c);
      beacons.setColorAt(i, col);
    });
    beacons.instanceColor.needsUpdate = true;
    scene.add(beacons);
  }

  // Runway on Bara Utara: asphalt with a procedural texture, full
  // markings (edge lines, threshold bars, touchdown zone), centreline
  // dashes, threshold lights.
  // M10.2: the old flat dark slab read as a pasted black rectangle —
  // the asphalt CanvasTexture (seeded speckle + faint twin tyre
  // streaks) and the merged marking set make it read as a real runway.
  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 3000),
    new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.85 }),
  );
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(0, 2, -1500);
  runway.receiveShadow = true;
  scene.add(runway);
  const dashGeo = new THREE.BoxGeometry(12, 2, 120);
  const dashMat = std(PALETTE.runwayLine, { roughness: 0.6 });
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, 9);
  {
    const m = new THREE.Matrix4();
    for (let i = 0; i < 9; i += 1) {
      m.makeTranslation(0, 4, -2800 + i * 320);
      dashes.setMatrixAt(i, m);
    }
  }
  scene.add(dashes);
  // M10.2: edge lines, threshold bars at both ends, touchdown-zone
  // pairs — one merged mesh, 1 draw call.
  {
    const parts = [];
    for (const x of [-96, 96]) {
      const edge = new THREE.BoxGeometry(4, 2, 3000);
      edge.translate(x, 4, -1500);
      parts.push({ geo: edge, color: 0xd8d8d0 });
    }
    for (const z of [-2920, -80]) {
      for (let i = 0; i < 8; i += 1) {
        const bar = new THREE.BoxGeometry(16, 2, 140);
        bar.translate(-84 + i * 24, 4, z);
        parts.push({ geo: bar, color: 0xd8d8d0 });
      }
    }
    for (const z of [-2400, -2000]) {
      for (const x of [-40, 40]) {
        const tz = new THREE.BoxGeometry(16, 2, 120);
        tz.translate(x, 4, z);
        parts.push({ geo: tz, color: 0xd8d8d0 });
      }
    }
    scene.add(mergeParts(parts));
  }

  // Rings — gold torus, emissive so they read at dusk.
  const ringMeshes = world.rings.map((ring) => {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(ring.r, 12, 8, 28),
      new THREE.MeshStandardMaterial({ color: PALETTE.ringGold, emissive: 0xaa7700, emissiveIntensity: 0.9, roughness: 0.4 }),
    );
    mesh.position.set(ring.x, ring.y, ring.z);
    scene.add(mesh);
    return mesh;
  });

  // Aircraft — V2-G REMODEL (27 Nov 2026; refs as M10.5: F-22 Raptor twin
  // canted tails + swept trapezoidal wings, YF-23 V-tail, FB-22 delta,
  // Project Wingman Chimera dark-grey + orange accents). ONE merged
  // vertex-colored mesh + twin-jet exhaust glow + one merged nav-light
  // mesh + one merged gear mesh (hidden in flight): still 3 calls in
  // the air, 4 on the ground. Span still 120 ft, same group interface.
  // V2-G fixes (parent diagnosis from the 3x zoom crop): nav lights were
  // unlit r5 balloons; the V-tail was a flat plate with a red roof; the
  // 4 ft wing vanished edge-on; gear showed in flight; the canopy was a
  // black ball. Geometry numbers live in aircraft.js (pure, tested).
  const plane = new THREE.Group();
  // Chined stealth fuselage: 12-segment cone (smoother than the old
  // 10-seg one — fewer visible facets), matte charcoal.
  const fuselageGeo = new THREE.ConeGeometry(12, 90, 12);
  fuselageGeo.rotateX(Math.PI / 2);
  // Thin orange spine stripe — the Nusa identity accent survives the
  // dark livery (Project Wingman Mk.1: "Oh, and don't forget the
  // color ORANGE").
  // V2-G3: the stripe FOLLOWS the cone (was a straight 70 ft box at
  // constant y 11 — the cone tapers 12 -> 0 toward the nose, so the
  // straight stripe floated up to ~9 ft above the fuselage and read as
  // a red rod hovering over the plane; proven by the spine-only probe).
  // Now 40 ft (z -35..+5, ending where the fuselage is still wide
  // enough: r 5.33 at z +5 vs stripe half-width 1.25), centreline at
  // r(z) + proud - height/2 so its top sits exactly `proud` (0.5 ft)
  // above the cone surface along the whole length.
  const stripe = AIRCRAFT.spineStripe;
  const stripeGeo = new THREE.BoxGeometry(stripe.width, stripe.height, stripe.length);
  taperPositions(stripeGeo.attributes.position.array, {
    axis: 2, from: -stripe.length / 2, to: stripe.length / 2,
    shiftY: [
      fuselageRadiusAt(stripe.zCenter - stripe.length / 2) + stripe.proud - stripe.height / 2 - stripe.yBase,
      fuselageRadiusAt(stripe.zCenter + stripe.length / 2) + stripe.proud - stripe.height / 2 - stripe.yBase,
    ],
  });
  stripeGeo.computeVertexNormals();
  stripeGeo.translate(0, stripe.yBase, stripe.zCenter);
  // Canopy — V2-G: low elongated bubble (was an r8 black hemisphere, a
  // ball on the fuselage). Dome scaled flat (0.5) and long (1.6), base
  // sunk to y=6 where the fuselage (r ~6.8) is wider than the canopy,
  // dark blue-grey glass instead of near-black.
  const canopyGeo = new THREE.SphereGeometry(
    AIRCRAFT.canopy.radius, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2,
  );
  canopyGeo.scale(AIRCRAFT.canopy.scaleX, AIRCRAFT.canopy.scaleY, AIRCRAFT.canopy.scaleZ);
  canopyGeo.translate(0, AIRCRAFT.canopy.y, AIRCRAFT.canopy.z);
  // Swept-back wings — V2-G: tapered, not a flat plate. Each half tapers
  // 7 ft thick / 27.6 ft chord at the root to 3 ft / 14.4 ft at the tip
  // (taperPositions, aircraft.js), then a small dihedral (~3.4 deg) so
  // the top surface reads from the chase camera instead of vanishing
  // edge-on. Sweep stays ±0.29 rad (~17 deg), span stays 120 ft.
  const wing = AIRCRAFT.wing;
  const wingRGeo = new THREE.BoxGeometry(62, wing.thickness, wing.chord);
  taperPositions(wingRGeo.attributes.position.array, {
    axis: 0, from: -wing.halfSpan, to: wing.halfSpan,
    scaleY: [wing.rootThickScale, wing.tipThickScale],
    scaleZ: [wing.rootChordScale, wing.tipChordScale],
  });
  wingRGeo.computeVertexNormals();
  wingRGeo.rotateY(wing.sweep);
  wingRGeo.rotateZ(wing.dihedral);
  wingRGeo.translate(30.5, 0, -5);
  const wingLGeo = new THREE.BoxGeometry(62, wing.thickness, wing.chord);
  taperPositions(wingLGeo.attributes.position.array, {
    axis: 0, from: wing.halfSpan, to: -wing.halfSpan,
    scaleY: [wing.rootThickScale, wing.tipThickScale],
    scaleZ: [wing.rootChordScale, wing.tipChordScale],
  });
  wingLGeo.computeVertexNormals();
  wingLGeo.rotateY(-wing.sweep);
  wingLGeo.rotateZ(-wing.dihedral);
  wingLGeo.translate(-30.5, 0, -5);
  // Orange wingtip caps, swept to match — V2-G: tilted with the dihedral
  // and raised to meet the lifted tip (tip centre ~y 1.8).
  const tipRGeo = new THREE.BoxGeometry(8, 4.5, 12);
  tipRGeo.rotateY(wing.sweep);
  tipRGeo.rotateZ(wing.dihedral);
  tipRGeo.translate(59, 1.8, -13.9);
  const tipLGeo = new THREE.BoxGeometry(8, 4.5, 12);
  tipLGeo.rotateY(-wing.sweep);
  tipLGeo.rotateZ(-wing.dihedral);
  tipLGeo.translate(-59, 1.8, -13.9);
  // Orange trailing-edge strips — V2-G: same dihedral tilt, re-seated on
  // the thicker wing's top surface (mid-span top ~y 2.4).
  // V2-G2: the strip must FOLLOW the tapered trailing edge — a straight
  // strip at fixed z floated 4 ft behind the tip (the red stick in the
  // probe-1 crop). Its centreline now tapers with the chord (root
  // trailing -13.8, tip -7.2, wing-local z) and it pivots about the
  // wing centre (x 30.5), so it sits on the trailing edge along the
  // whole span instead of floating behind the tip.
  const trailRGeo = new THREE.BoxGeometry(62, 2, 2);
  taperPositions(trailRGeo.attributes.position.array, {
    axis: 0, from: -wing.halfSpan, to: wing.halfSpan,
    shiftZ: [AIRCRAFT.trailStrip.rootZ, AIRCRAFT.trailStrip.tipZ],
  });
  trailRGeo.computeVertexNormals();
  trailRGeo.rotateY(wing.sweep);
  trailRGeo.rotateZ(wing.dihedral);
  trailRGeo.translate(AIRCRAFT.trailStrip.pivotX, AIRCRAFT.trailStrip.y, -5);
  const trailLGeo = new THREE.BoxGeometry(62, 2, 2);
  taperPositions(trailLGeo.attributes.position.array, {
    axis: 0, from: wing.halfSpan, to: -wing.halfSpan,
    shiftZ: [AIRCRAFT.trailStrip.rootZ, AIRCRAFT.trailStrip.tipZ],
  });
  trailLGeo.computeVertexNormals();
  trailLGeo.rotateY(-wing.sweep);
  trailLGeo.rotateZ(-wing.dihedral);
  trailLGeo.translate(-AIRCRAFT.trailStrip.pivotX, AIRCRAFT.trailStrip.y, -5);
  // V-tail (YF-23/F-22 canted twins): two fins canted ±28° outward —
  // no vertical fin, no horizontal tailplane, so the dead-rear "red
  // cross" read is gone by construction. (28°, not 35°: the steeper
  // cant splayed like spider legs in the first capture.)
  // V2-G: each fin tapers to 45% chord at the tip and sweeps 6 ft aft,
  // so it reads as a fin, not a flat plate.
  const fin = AIRCRAFT.fin;
  const finRGeo = new THREE.BoxGeometry(3, 18, 18);
  taperPositions(finRGeo.attributes.position.array, {
    axis: 1, from: -9, to: 9,
    scaleZ: [1, fin.tipChordScale],
    shiftZ: [0, -fin.sweepBack],
  });
  finRGeo.computeVertexNormals();
  finRGeo.rotateZ(-fin.cant);
  finRGeo.translate(10, 11, -38);
  const finLGeo = new THREE.BoxGeometry(3, 18, 18);
  taperPositions(finLGeo.attributes.position.array, {
    axis: 1, from: -9, to: 9,
    scaleZ: [1, fin.tipChordScale],
    shiftZ: [0, -fin.sweepBack],
  });
  finLGeo.computeVertexNormals();
  finLGeo.rotateZ(fin.cant);
  finLGeo.translate(-10, 11, -38);
  // Orange fin-tip caps — V2-G: small caps on the tapered tip (was a
  // 5 ft tall, 19 ft long slab — the "red roof" in the zoom crop).
  // Fin tip centre sits at (±14.2, 18.9, -44) after the cant.
  // V2-G2: the cap was still wider than the fin tip (3.6 vs 3) so it
  // overhung and read as a roof. Now narrower than the tip (2.8 vs 3)
  // and shorter (7 vs 8.1), sunk so only ~1 ft shows: an orange tip
  // edge, not a slab.
  const finStripeRGeo = new THREE.BoxGeometry(fin.capWidth, fin.stripeHeight, fin.capDepth);
  finStripeRGeo.rotateZ(-fin.cant);
  finStripeRGeo.translate(14.2, 19.0, -44);
  const finStripeLGeo = new THREE.BoxGeometry(fin.capWidth, fin.stripeHeight, fin.capDepth);
  finStripeLGeo.rotateZ(fin.cant);
  finStripeLGeo.translate(-14.2, 19.0, -44);
  // Twin exhaust nozzles (dark, small — the first r=5/6 nozzles read as
  // two black holes from behind; the glow disc now halos them instead).
  const nozzleRGeo = new THREE.CylinderGeometry(3.5, 4.5, 8, 8);
  nozzleRGeo.rotateX(Math.PI / 2);
  nozzleRGeo.translate(7, 0, -46);
  const nozzleLGeo = new THREE.CylinderGeometry(3.5, 4.5, 8, 8);
  nozzleLGeo.rotateX(Math.PI / 2);
  nozzleLGeo.translate(-7, 0, -46);
  const legL = new THREE.BoxGeometry(3, 7, 3);
  legL.translate(-8, -3.5, 8);
  const legR = new THREE.BoxGeometry(3, 7, 3);
  legR.translate(8, -3.5, 8);
  const legL2 = new THREE.BoxGeometry(3, 7, 3);
  legL2.translate(-8, -3.5, -18);
  const legR2 = new THREE.BoxGeometry(3, 7, 3);
  legR2.translate(8, -3.5, -18);
  const wheelGeo = new THREE.CylinderGeometry(6, 6, 3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelPositions = [[-8, -6, 8], [8, -6, 8], [-8, -6, -18], [8, -6, -18]];
  const wheelGeos = wheelPositions.map(([x, y, z]) => {
    const g = wheelGeo.clone();
    g.translate(x, y, z);
    return g;
  });
  const planeBody = mergeParts([
    { geo: fuselageGeo, color: PALETTE.stealth },
    { geo: stripeGeo, color: PALETTE.planeOrange },
    { geo: canopyGeo, color: AIRCRAFT.canopy.color },
    { geo: wingRGeo, color: PALETTE.stealth },
    { geo: wingLGeo, color: PALETTE.stealth },
    { geo: tipLGeo, color: PALETTE.planeOrange },
    { geo: tipRGeo, color: PALETTE.planeOrange },
    { geo: trailLGeo, color: PALETTE.planeOrange },
    { geo: trailRGeo, color: PALETTE.planeOrange },
    { geo: finRGeo, color: PALETTE.stealth },
    { geo: finLGeo, color: PALETTE.stealth },
    { geo: finStripeRGeo, color: PALETTE.planeOrange },
    { geo: finStripeLGeo, color: PALETTE.planeOrange },
    { geo: nozzleRGeo, color: PALETTE.stealthDark },
    { geo: nozzleLGeo, color: PALETTE.stealthDark },
  ], { roughness: 0.7 });
  planeBody.castShadow = true;
  plane.add(planeBody);
  // Landing gear — V2-G: its own merged mesh, NOT part of the body.
  // updateScene hides it in flight (gearDown in aircraft.js: down on
  // the ground / on final, up in cruise), so the wheels no longer read
  // as black balls under the fuselage in the play shot. +1 draw call
  // only when visible (ground shots: 27-29/30, still inside budget).
  const planeGear = mergeParts([
    { geo: legL, color: PALETTE.gearDark },
    { geo: legR, color: PALETTE.gearDark },
    { geo: legL2, color: PALETTE.gearDark },
    { geo: legR2, color: PALETTE.gearDark },
    ...wheelGeos.map((geo) => ({ geo, color: PALETTE.gearDark })),
  ], { roughness: 0.7 });
  planeGear.castShadow = true;
  plane.add(planeGear);
  // Twin-jet exhaust glow — M10.5/M10-fix: a stealth jet has no
  // propeller. Two small radial-gradient discs, one directly behind
  // each dark nozzle (x ±7, r 7.5), sharing one AdditiveBlending
  // material so the glow adds light instead of painting a solid ball
  // (M10: one r15 NormalBlending disc read as a white ping-pong ball
  // in the tail centre). Opacity grows with throttle (set in
  // updateScene via `exhaustDisc`, whose material is shared by both
  // discs (one opacity write drives both). Cost: +1 draw call (2 meshes); budget has margin
  // (landing 27/30 before this change).
  const exhaustMat = new THREE.MeshBasicMaterial({
    map: exhaustTexture(), color: 0xffffff, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    forceSinglePass: true, depthWrite: false,
  });
  const exhaustGeo = new THREE.CircleGeometry(7.5, 16);
  const exhaustDisc = new THREE.Mesh(exhaustGeo, exhaustMat);
  exhaustDisc.position.set(7, 0, -50);
  exhaustDisc.rotation.y = Math.PI;
  plane.add(exhaustDisc);
  const exhaustL = new THREE.Mesh(exhaustGeo, exhaustMat);
  exhaustL.position.set(-7, 0, -50);
  exhaustL.rotation.y = Math.PI;
  plane.add(exhaustL);
  // Nav lights — one merged unlit mesh (green left, red right, white
  // tail). V2-G: r2 wingtips + r1.5 tail, set into the wingtip caps'
  // outer faces (x ±63.5, y 1.8 — the dihedral-lifted tip) instead of
  // r5 spheres floating at the tip (they read as balloons; the M10-fix
  // already cut the tail light for the same reason).
  const navLGeo = new THREE.SphereGeometry(AIRCRAFT.navLightRadius, 8, 6);
  navLGeo.translate(-63.5, 1.8, -15);
  const navRGeo = new THREE.SphereGeometry(AIRCRAFT.navLightRadius, 8, 6);
  navRGeo.translate(63.5, 1.8, -15);
  const navTGeo = new THREE.SphereGeometry(AIRCRAFT.navTailRadius, 8, 6);
  navTGeo.translate(0, 2, -44);
  const navLights = mergeParts([
    { geo: navLGeo, color: 0x00ff66 },
    { geo: navRGeo, color: 0xff2222 },
    { geo: navTGeo, color: 0xffffff },
  ], { basic: true });
  plane.add(navLights);
  scene.add(plane);

  // Clouds — soft-edged blobs (M10.3: radial-falloff CanvasTexture so
  // they read as vapour, not paper cutouts), two tones via instanceColor,
  // 28 in two altitude bands + multi-lobe companions. One InstancedMesh,
  // 1 draw call.
  const cloudGeo = new THREE.SphereGeometry(1, 8, 6);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: cloudTexture(), transparent: true, opacity: 0.55, depthWrite: false });
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, 28);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    for (let i = 0; i < 28; i += 1) {
      let x, y, z, sx, sy, sz, dim = 1;
      if (i < 18) {
        // Low band — same seeded layout as M8.
        x = -9000 + (i % 6) * 3600;
        y = 3200 + (i % 4) * 450;
        z = -2000 + Math.floor(i / 6) * 7000;
        sx = 1400 + hash2(i, 3) * 500;
        sy = 240 + hash2(5, i) * 120;
        sz = 900 + hash2(i, 8) * 300;
      } else if (i < 24) {
        // High band — smaller, dimmer, farther up.
        const j = i - 18;
        x = -8000 + (j % 3) * 5000;
        y = 5000 + (j % 2) * 500;
        z = -1000 + Math.floor(j / 3) * 6000;
        sx = 1000 + hash2(i, 13) * 400;
        sy = 180 + hash2(15, i) * 90;
        sz = 650 + hash2(i, 18) * 250;
        dim = 0.7;
      } else {
        // Multi-lobe companions hugging a low-band cloud.
        const j = i - 24;
        const bx = -9000 + (j % 6) * 3600;
        const bz = -2000 + Math.floor(j / 6) * 7000;
        x = bx + 900 + hash2(i, 21) * 500;
        y = 3200 + (j % 4) * 450 + 120;
        z = bz + 400;
        sx = 800 + hash2(i, 23) * 300;
        sy = 160 + hash2(25, i) * 80;
        sz = 550 + hash2(i, 28) * 200;
      }
      p.set(x, y, z);
      s.set(sx, sy, sz);
      m.compose(p, q, s);
      clouds.setMatrixAt(i, m);
      col.setHex(i % 2 === 0 ? PALETTE.cloudWhite : PALETTE.cloudPink);
      col.multiplyScalar((0.9 + 0.2 * hash2(i, i)) * dim);
      clouds.setColorAt(i, col);
    }
    clouds.instanceColor.needsUpdate = true;
  }
  scene.add(clouds);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 60000);
  camera.position.set(0, 200, -800);

  return { scene, camera, sun, plane, gear: planeGear, exhaustDisc, ringMeshes, snapped: false };
}

const _cockpitPos = new THREE.Vector3();
const _cockpitLook = new THREE.Vector3();

export function updateScene(view, world, dt, camOrbit, cockpit = false) {
  const p = world.plane;
  // Plane group follows the flight model (feet → scene units are feet).
  // +12 puts the gear wheels exactly on the ground at touchdown.
  view.plane.position.set(p.x, Math.max(p.y, 0) + 12, p.z);
  view.plane.rotation.set(0, 0, 0);
  view.plane.rotation.y = -p.heading * DEG;
  view.plane.rotation.z = -p.roll * DEG;
  view.plane.rotation.x = p.pitch * DEG;
  // Exhaust glow: brighter with throttle (idle glow at rest, hot plume
  // at full power). M10.5: the old prop disc is gone — the glow sits at
  // the tail, behind the plane, so the cockpit view is unaffected.
  // M10-fix: AdditiveBlending twin discs share one material, so one
  // opacity write drives both; range capped at 0.5 so the glow never
  // reads as a solid ball again.
  view.exhaustDisc.material.opacity = 0.2 + p.throttle * 0.3;
  // Landing gear: down on the ground / on final approach, up in cruise
  // (V2-G, gearDown in aircraft.js). The play/start shots fly at 700 ft,
  // the landing/end shots freeze on final at ~120-350 ft.
  view.gear.visible = gearDown(p);
  // Rings spin slowly; collected rings hide.
  for (let i = 0; i < view.ringMeshes.length; i += 1) {
    view.ringMeshes[i].rotation.z += dt * 0.4;
    view.ringMeshes[i].visible = !world.rings[i].collected;
  }
  if (cockpit) {
    // Cockpit camera (camera-systems: first-person look, rigidly attached —
    // no smoothing, or the view lags the plane). Position and up come from
    // the plane's own quaternion, so pitch and roll read on the horizon.
    _cockpitPos.set(0, 15, 12).applyQuaternion(view.plane.quaternion).add(view.plane.position);
    view.camera.position.copy(_cockpitPos);
    _cockpitLook.set(0, 13, 600).applyQuaternion(view.plane.quaternion).add(view.plane.position);
    view.camera.up.set(0, 1, 0).applyQuaternion(view.plane.quaternion);
    view.camera.lookAt(_cockpitLook);
    view.snapped = false; // re-snap the chase camera when leaving the cockpit
  } else {
    // Chase camera: behind the plane, mouse orbit offsets the yaw.
    // First frame snaps straight behind the plane (no long lerp-in).
    view.camera.up.set(0, 1, 0);
    const h = (p.heading + (camOrbit?.yaw ?? 0)) * DEG;
    const back = CAMERA.distance + (camOrbit?.zoom ?? 0);
    const tx = p.x - Math.sin(h) * back;
    const tz = p.z - Math.cos(h) * back;
    const ty = Math.max(p.y, 0) + CAMERA.height + (camOrbit?.pitch ?? 0);
    if (!view.snapped) {
      view.camera.position.set(tx, ty, tz);
      view.snapped = true;
    } else {
      view.camera.position.x += (tx - view.camera.position.x) * CAMERA.lerp;
      view.camera.position.y += (ty - view.camera.position.y) * CAMERA.lerp;
      view.camera.position.z += (tz - view.camera.position.z) * CAMERA.lerp;
    }
    view.camera.lookAt(p.x + Math.sin(p.heading * DEG) * CAMERA.lookAhead, Math.max(p.y, 0) + 10, p.z + Math.cos(p.heading * DEG) * CAMERA.lookAhead);
  }
  // Sun shadow frustum follows the plane.
  view.sun.position.set(p.x + 8000, 6000, p.z - 4000);
  view.sun.target.position.set(p.x, 0, p.z);
}

export function perfStats(renderer) {
  return {
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    withinBudget: renderer.info.render.calls <= PERF.maxDrawCalls
      && renderer.info.render.triangles <= PERF.maxTriangles,
  };
}

export function onResize(renderer, camera) {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
