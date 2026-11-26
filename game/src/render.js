// Renderer — Three.js r187 scene for Nusa Sky Courier. (Skills: router /
// threejs-scene-setup / threejs-materials-lighting / threejs-geometry /
// threejs-performance / camera-systems / game-feel.) Meshes are a view of
// world state: buildScene creates them once, updateScene copies world
// state onto them every frame. M10: smooth lathe + soft tier blend,
// asphalt runway, two-layer soft clouds, sea foam, stealth jet.
import * as THREE from 'three';
import { PALETTE, ISLANDS, LANDMARKS, CAMERA, PERF } from './config.js';
import { mergeGeometries } from './merge.js';

const DEG = Math.PI / 180;

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

// Deterministic 2D hash (0..1) — seeded terrain noise without storing state.
function hash2(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const _tierColor = new THREE.Color();
const _tierBlend = new THREE.Color();
// Pure tier colour at height y (no jitter, no blending) — shared by
// tierColor and its boundary blend.
function tierHex(kind, y, h) {
  const t = y / h;
  if (y <= 8) return PALETTE.sand;
  if (kind === 'volcano') {
    if (t > 0.82) return PALETTE.snow;
    if (t > 0.6) return PALETTE.rockLight;
    if (t > 0.35) return PALETTE.rockMid;
    return PALETTE.rockDark;
  }
  if (kind === 'city') {
    if (t > 0.7) return 0x8a8578;
    if (t > 0.35) return PALETTE.greenBright;
    return PALETTE.greenDeep;
  }
  if (t > 0.7) return PALETTE.palm;
  if (t > 0.35) return PALETTE.greenBright;
  return PALETTE.greenDeep;
}

// Tiered colour by height fraction. M9: sharper, more separated tiers
// (rockDark/mid/light and deep/bright green are far apart in value) so
// the bands read as 3-4 distinct stripes, not one brown gradient. The
// fine jitter is kept small — the bands, not the noise, must read.
// M10.1: the hard step is softened ±0.04 around each boundary (blend
// rings inserted in islandProfile give the blend vertices to land on),
// so the slope reads smooth while the 4 zones stay readable.
function tierColor(kind, y, h, x, z, out) {
  const t = y / h;
  const jitter = 0.94 + 0.12 * hash2(x, z);
  out.setHex(tierHex(kind, y, h));
  const bounds = [...tierBounds(kind), 8 / h];
  for (const b of bounds) {
    const d = Math.abs(t - b);
    if (d < 0.04 && d > 0) {
      const ny = Math.min(h, Math.max(0, (t + (t < b ? 0.06 : -0.06)) * h));
      _tierBlend.setHex(tierHex(kind, ny, h));
      out.lerp(_tierBlend, (1 - d / 0.04) * 0.5);
    }
  }
  out.multiplyScalar(jitter);
  return out;
}

// Tier boundaries per island kind — a ring is inserted at each boundary
// in islandProfile so the colour step lands on vertices (crisp bands)
// instead of interpolating across one big triangle.
function tierBounds(kind) {
  if (kind === 'volcano') return [0.35, 0.6, 0.82];
  return [0.35, 0.7];
}

// Tiered island profile: beach ring at the base, slope tiers, peak.
// (level-design: dress last — the profile keeps the old cone's footprint so
// rings, city and palms still sit where the sim expects them.)
function islandProfile(island) {
  const r = island.radius;
  const h = island.height;
  // M9: a wider beach apron (base 1.10r -> 1.03r over 6 ft) so the sand
  // ring reads from the air; the old 1.08r/4 ft lip was invisible.
  const base = [
    new THREE.Vector2(r * 1.1, 1),
    new THREE.Vector2(r * 1.03, 6),
    new THREE.Vector2(r * 0.8, h * 0.3),
    new THREE.Vector2(r * 0.55, h * 0.6),
    new THREE.Vector2(r * 0.3, h * 0.85),
    new THREE.Vector2(0, h),
  ];
  const radiusAt = (y) => {
    for (let i = 0; i < base.length - 1; i += 1) {
      if (y >= base[i].y && y <= base[i + 1].y) {
        const f = (y - base[i].y) / (base[i + 1].y - base[i].y);
        return base[i].x + (base[i + 1].x - base[i].x) * f;
      }
    }
    return 0;
  };
  // Extra rings: sand edge (y=10, crisp beach cutoff) + each tier
  // boundary. Inserted points lie exactly on the old piecewise lines, so
  // islandSurfaceY (landmark heights) is unchanged.
  // M10.1: blend rings at b±0.04 around every boundary so the tier
  // softening in tierColor has vertices to land on.
  const extra = [10, ...tierBounds(island.kind).map((b) => h * b)];
  for (const b of [...tierBounds(island.kind), 8 / h]) {
    for (const off of [-0.04, 0.04]) {
      const y = h * (b + off);
      if (y > 2 && y < h - 2) extra.push(y);
    }
  }
  for (const y of extra) {
    if (base.some((p) => p.y === y)) continue;
    const idx = base.findIndex((p) => p.y > y);
    base.splice(idx === -1 ? base.length : idx, 0, new THREE.Vector2(radiusAt(y), y));
  }
  return base;
}

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
    if (r > 1) {
      // Irregular silhouette: radial noise, strongest mid-slope, zero at
      // beach and peak so the tiers stay clean.
      const a = Math.atan2(z, x);
      const n = hash2(Math.cos(a) * 5 + island.x * 0.01, Math.sin(a) * 5 + island.z * 0.01) - 0.5;
      const nr = r + n * 80 * Math.sin(Math.PI * t);
      x = (x / r) * nr;
      z = (z / r) * nr;
      pos.setX(i, x);
      pos.setZ(i, z);
    }
    tierColor(island.kind, y, island.height, island.x + x, island.z + z, _tierColor);
    // M9 gullies: darker radial wedges down the slope, seeded per angle
    // (threejs-geometry: per-vertex colour variation on the lathe rings),
    // so the bands read as carved terrain, not flat paint. Skipped on
    // beach + snow so those stay bright and crisp.
    if (y > 8 && t <= 0.82) {
      const a = Math.atan2(z, x);
      const g = 0.88 + 0.2 * hash2(Math.cos(a) * 7 + island.x * 0.01, Math.sin(a) * 7 + island.z * 0.01);
      _tierColor.multiplyScalar(g);
    }
    colors[i * 3] = _tierColor.r;
    colors[i * 3 + 1] = _tierColor.g;
    colors[i * 3 + 2] = _tierColor.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

// Height of the island's tiered profile at world (x, z) — piecewise linear
// over the profile radii, so landmarks sit ON the slope, not under it.
export function islandSurfaceY(island, x, z) {
  const d = Math.hypot(x - island.x, z - island.z);
  const profile = islandProfile(island);
  for (let i = 0; i < profile.length - 1; i += 1) {
    const r0 = profile[i].x;
    const y0 = profile[i].y;
    const r1 = profile[i + 1].x;
    const y1 = profile[i + 1].y;
    if (d <= r0 && d >= r1) {
      const f = (r0 - d) / (r0 - r1);
      return y0 + (y1 - y0) * f;
    }
  }
  return d <= profile[0].x ? profile[0].y : 0;
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
  const bands = ['#f2f2e8', '#c23b2e', '#f2f2e8', '#c23b2e'];
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
      // M9: bigger, hotter lava cap (0.30r, emissive 2.4) — the old
      // 0.22r cap read as a small orange tip, not a crater.
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(island.radius * 0.3, island.height * 0.26, 12),
        new THREE.MeshStandardMaterial({ color: PALETTE.lava, emissive: 0xff3d00, emissiveIntensity: 2.4, roughness: 0.6 }),
      );
      cap.position.set(island.x, island.height - 10, island.z);
      scene.add(cap);
    }
    if (island.kind === 'city') {
      // Village: cream/tan bodies + red pyramid roofs, 2 InstancedMesh.
      // Same 24 grid spots as the old grey boxes (level-design: landmark
      // guides the eye to Tanjung from the air).
      const spots = [];
      for (let gx = -2; gx <= 2; gx += 1) {
        for (let gz = -2; gz <= 2; gz += 1) {
          if (gx === 0 && gz === 0) continue;
          const h = 120 + ((gx * 7 + gz * 13) % 5) * 60;
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
        p.set(spot.x, spot.h / 2, spot.z);
        s.set(180, spot.h, 180);
        m.compose(p, q, s);
        bodies.setMatrixAt(i, m);
        col.setHex(bodyCols[(i * 7 + 3) % 3]);
        col.multiplyScalar(0.92 + 0.16 * hash2(spot.x, spot.z));
        bodies.setColorAt(i, col);
        p.set(spot.x, spot.h + 35, spot.z);
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

  // Aircraft — M10.5 STEALTH REDESIGN (refs: F-22 Raptor twin canted
  // tails + swept trapezoidal wings, YF-23 V-tail, FB-22 delta, Project
  // Wingman Chimera dark-grey + orange accents). ONE merged
  // vertex-colored mesh + twin-jet exhaust glow + one merged nav-light
  // mesh: still 3 calls. Span still 120 ft, same group interface.
  const plane = new THREE.Group();
  // Chined stealth fuselage: 12-segment cone (smoother than the old
  // 10-seg one — fewer visible facets), matte charcoal.
  const fuselageGeo = new THREE.ConeGeometry(12, 90, 12);
  fuselageGeo.rotateX(Math.PI / 2);
  // Thin orange spine stripe — the Nusa identity accent survives the
  // dark livery (Project Wingman Mk.1: "Oh, and don't forget the
  // color ORANGE").
  const stripeGeo = new THREE.BoxGeometry(2.5, 2, 70);
  stripeGeo.translate(0, 11, 0);
  const canopyGeo = new THREE.SphereGeometry(8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  canopyGeo.translate(0, 5, 0);
  // Swept-back wings: each half is a box rotated ±0.29 rad (~17°) about
  // Y, so the leading edge sweeps back toward the tail (F-22 style).
  const wingRGeo = new THREE.BoxGeometry(62, 4, 24);
  wingRGeo.rotateY(0.29);
  wingRGeo.translate(30.5, 0, -5);
  const wingLGeo = new THREE.BoxGeometry(62, 4, 24);
  wingLGeo.rotateY(-0.29);
  wingLGeo.translate(-30.5, 0, -5);
  // Orange wingtip caps, swept to match.
  const tipRGeo = new THREE.BoxGeometry(8, 4.5, 12);
  tipRGeo.rotateY(0.29);
  tipRGeo.translate(56, 0, -13);
  const tipLGeo = new THREE.BoxGeometry(8, 4.5, 12);
  tipLGeo.rotateY(-0.29);
  tipLGeo.translate(-56, 0, -13);
  // Orange trailing-edge strips — the wing reads as a thin line from
  // dead behind, so the rear edge carries the Nusa orange (visible in
  // shots 1/3 where the top stripe is hidden).
  const trailRGeo = new THREE.BoxGeometry(62, 2, 2);
  trailRGeo.rotateY(0.29);
  trailRGeo.translate(27.1, 3, -16.5);
  const trailLGeo = new THREE.BoxGeometry(62, 2, 2);
  trailLGeo.rotateY(-0.29);
  trailLGeo.translate(-27.1, 3, -16.5);
  // V-tail (YF-23/F-22 canted twins): two fins canted ±28° outward —
  // no vertical fin, no horizontal tailplane, so the dead-rear "red
  // cross" read is gone by construction. (28°, not 35°: the steeper
  // cant splayed like spider legs in the first capture.)
  const finRGeo = new THREE.BoxGeometry(3, 18, 18);
  finRGeo.rotateZ(-0.49);
  finRGeo.translate(10, 11, -38);
  const finLGeo = new THREE.BoxGeometry(3, 18, 18);
  finLGeo.rotateZ(0.49);
  finLGeo.translate(-10, 11, -38);
  // Orange fin-tip stripes, same cant (stripe centre = fin centre +
  // canted-up × 11.5, so the stripe caps the fin tip exactly).
  const finStripeRGeo = new THREE.BoxGeometry(3.5, 5, 19);
  finStripeRGeo.rotateZ(-0.49);
  finStripeRGeo.translate(15.4, 21.1, -38);
  const finStripeLGeo = new THREE.BoxGeometry(3.5, 5, 19);
  finStripeLGeo.rotateZ(0.49);
  finStripeLGeo.translate(-15.4, 21.1, -38);
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
    { geo: canopyGeo, color: 0x0a0f16 },
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
    { geo: legL, color: PALETTE.gearDark },
    { geo: legR, color: PALETTE.gearDark },
    { geo: legL2, color: PALETTE.gearDark },
    { geo: legR2, color: PALETTE.gearDark },
    ...wheelGeos.map((geo) => ({ geo, color: PALETTE.gearDark })),
  ], { roughness: 0.7 });
  planeBody.castShadow = true;
  plane.add(planeBody);
  // Twin-jet exhaust glow — M10.5/M10-fix: a stealth jet has no
  // propeller. Two small radial-gradient discs, one directly behind
  // each dark nozzle (x ±7, r 7.5), sharing one AdditiveBlending
  // material so the glow adds light instead of painting a solid ball
  // (M10: one r15 NormalBlending disc read as a white ping-pong ball
  // in the tail centre). Opacity grows with throttle (set in
  // updateScene via `exhaust`, whose material is shared by both
  // discs). Cost: +1 draw call (2 meshes); budget has margin
  // (landing 27/30 before this change).
  const exhaustMat = new THREE.MeshBasicMaterial({
    map: exhaustTexture(), color: 0xffffff, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    forceSinglePass: true, depthWrite: false,
  });
  const exhaustGeo = new THREE.CircleGeometry(7.5, 16);
  const exhaust = new THREE.Mesh(exhaustGeo, exhaustMat);
  exhaust.position.set(7, 0, -50);
  exhaust.rotation.y = Math.PI;
  plane.add(exhaust);
  const exhaustL = new THREE.Mesh(exhaustGeo, exhaustMat);
  exhaustL.position.set(-7, 0, -50);
  exhaustL.rotation.y = Math.PI;
  plane.add(exhaustL);
  // Nav lights — one merged unlit mesh (green left, red right, white
  // tail). M9: radius 3 -> 5 so they read at chase distance. M10-fix:
  // the tail light stays r2.5 — at r5 its unlit white sphere sat dead
  // centre between the nozzles and read as a white ball, which the
  // glow-disc split alone could not fix.
  const navLGeo = new THREE.SphereGeometry(5, 8, 6);
  navLGeo.translate(-60, 0, -7);
  const navRGeo = new THREE.SphereGeometry(5, 8, 6);
  navRGeo.translate(60, 0, -7);
  const navTGeo = new THREE.SphereGeometry(2.5, 8, 6);
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

  return { scene, camera, sun, plane, exhaust, ringMeshes, snapped: false };
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
  view.exhaust.material.opacity = 0.2 + p.throttle * 0.3;
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
