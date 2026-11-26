// Renderer — Three.js r187 scene for Nusa Sky Courier. (Skills: router /
// threejs-scene-setup / threejs-materials-lighting / threejs-performance /
// camera-systems.) Meshes are a view of world state: buildScene creates them
// once, updateScene copies world state onto them every frame.
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
// Tiered colour by height fraction, with a little per-vertex jitter so the
// slope reads as rock/vegetation, not a flat paint job.
function tierColor(kind, y, h, x, z, out) {
  const t = y / h;
  const jitter = 0.92 + 0.16 * hash2(x, z);
  if (y <= 4) out.setHex(PALETTE.sand);
  else if (kind === 'volcano') {
    if (t > 0.82) out.setHex(PALETTE.snow);
    else if (t > 0.6) out.setHex(PALETTE.rockLight);
    else if (t > 0.35) out.setHex(0x6b4a35);
    else out.setHex(PALETTE.rockDark);
  } else if (kind === 'city') {
    // Green hill with a grey town crown — tan only at the beach, or the
    // whole 220 ft hill reads as one flat orange pancake from above.
    if (t > 0.7) out.setHex(0x8a8578);
    else if (t > 0.35) out.setHex(PALETTE.greenHijau);
    else out.setHex(0x4a8a3f);
  } else if (t > 0.7) out.setHex(PALETTE.palm);
  else if (t > 0.35) out.setHex(PALETTE.greenHijau);
  else out.setHex(0x4a8a3f);
  out.multiplyScalar(jitter);
  return out;
}

// Tiered island profile: beach ring at the base, slope tiers, peak.
// (level-design: dress last — the profile keeps the old cone's footprint so
// rings, city and palms still sit where the sim expects them.)
function islandProfile(island) {
  const r = island.radius;
  const h = island.height;
  return [
    new THREE.Vector2(r * 1.08, 1),
    new THREE.Vector2(r * 1.0, 4),
    new THREE.Vector2(r * 0.8, h * 0.3),
    new THREE.Vector2(r * 0.55, h * 0.6),
    new THREE.Vector2(r * 0.3, h * 0.85),
    new THREE.Vector2(0, h),
  ];
}

function buildIslandGeometry(island) {
  const geo = new THREE.LatheGeometry(islandProfile(island), 28);
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
  return new THREE.Mesh(
    geo,
    materialOpts.basic
      ? new THREE.MeshBasicMaterial({ vertexColors: true })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, ...materialOpts }),
  );
}

// Runtime CanvasTexture — procedural, no external file (references gate:
// only data: URIs or files inside game/).
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
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(island.radius * 0.22, island.height * 0.22, 12),
        new THREE.MeshStandardMaterial({ color: PALETTE.lava, emissive: 0xff3d00, emissiveIntensity: 1.6, roughness: 0.6 }),
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

  // Runway on Bara Utara: dark strip, centreline dashes, threshold lights.
  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 3000),
    std(PALETTE.runway, { roughness: 0.85 }),
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

  // Aircraft — ONE merged vertex-colored mesh (livery, canopy, gear) + a
  // translucent prop-blur disc + one merged nav-light mesh: 3 calls where
  // the old plane took 7. Span still 120 ft, same group interface.
  const plane = new THREE.Group();
  const fuselageGeo = new THREE.ConeGeometry(12, 90, 10);
  fuselageGeo.rotateX(Math.PI / 2);
  const stripeGeo = new THREE.BoxGeometry(4, 3, 70);
  stripeGeo.translate(0, 11, 0);
  const canopyGeo = new THREE.SphereGeometry(8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  canopyGeo.translate(0, 5, 0);
  const wingGeo = new THREE.BoxGeometry(120, 4, 28);
  const tailGeo = new THREE.BoxGeometry(45, 4, 18);
  tailGeo.translate(0, 5, -38);
  const finGeo = new THREE.BoxGeometry(4, 24, 20);
  finGeo.translate(0, 10, -38);
  const legL = new THREE.BoxGeometry(2.5, 6, 2.5);
  legL.translate(-8, -6, 8);
  const legR = new THREE.BoxGeometry(2.5, 6, 2.5);
  legR.translate(8, -6, 8);
  const legL2 = new THREE.BoxGeometry(2.5, 6, 2.5);
  legL2.translate(-8, -7, -18);
  const legR2 = new THREE.BoxGeometry(2.5, 6, 2.5);
  legR2.translate(8, -7, -18);
  const wheelGeo = new THREE.CylinderGeometry(5, 5, 3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelPositions = [[-8, -7, 8], [8, -7, 8], [-8, -7, -18], [8, -7, -18]];
  const wheelGeos = wheelPositions.map(([x, y, z]) => {
    const g = wheelGeo.clone();
    g.translate(x, y, z);
    return g;
  });
  const planeBody = mergeParts([
    { geo: fuselageGeo, color: PALETTE.planeCream },
    { geo: stripeGeo, color: PALETTE.planeOrange },
    { geo: canopyGeo, color: PALETTE.canopyDark },
    { geo: wingGeo, color: PALETTE.planeOrange },
    { geo: tailGeo, color: PALETTE.planeOrange },
    { geo: finGeo, color: PALETTE.planeOrange },
    { geo: legL, color: PALETTE.gearDark },
    { geo: legR, color: PALETTE.gearDark },
    { geo: legL2, color: PALETTE.gearDark },
    { geo: legR2, color: PALETTE.gearDark },
    ...wheelGeos.map((geo) => ({ geo, color: PALETTE.gearDark })),
  ], { roughness: 0.55 });
  planeBody.castShadow = true;
  plane.add(planeBody);
  // Prop blur disc — translucent, opacity grows with throttle (set in
  // updateScene); single pass so it stays one call.
  const prop = new THREE.Mesh(
    new THREE.CircleGeometry(26, 24),
    new THREE.MeshBasicMaterial({
      color: 0xdddddd, transparent: true, opacity: 0.25,
      side: THREE.DoubleSide, forceSinglePass: true, depthWrite: false,
    }),
  );
  prop.position.set(0, 0, 50);
  plane.add(prop);
  // Nav lights — one merged unlit mesh (green left, red right, white tail).
  const navLGeo = new THREE.SphereGeometry(3, 8, 6);
  navLGeo.translate(-60, 0, 0);
  const navRGeo = new THREE.SphereGeometry(3, 8, 6);
  navRGeo.translate(60, 0, 0);
  const navTGeo = new THREE.SphereGeometry(3, 8, 6);
  navTGeo.translate(0, 2, -44);
  const navLights = mergeParts([
    { geo: navLGeo, color: 0x00ff66 },
    { geo: navRGeo, color: 0xff2222 },
    { geo: navTGeo, color: 0xffffff },
  ], { basic: true });
  plane.add(navLights);
  scene.add(plane);

  // Clouds — flat blobs, unlit so they read at dusk; two tones via
  // instanceColor (warm white + pink), 18 across the whole archipelago.
  const cloudGeo = new THREE.SphereGeometry(1, 8, 6);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, 18);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    for (let i = 0; i < 18; i += 1) {
      p.set(-9000 + (i % 6) * 3600, 3200 + (i % 4) * 450, -2000 + Math.floor(i / 6) * 7000);
      s.set(1400 + hash2(i, 3) * 500, 240 + hash2(5, i) * 120, 900 + hash2(i, 8) * 300);
      m.compose(p, q, s);
      clouds.setMatrixAt(i, m);
      col.setHex(i % 2 === 0 ? PALETTE.cloudWhite : PALETTE.cloudPink);
      col.multiplyScalar(0.9 + 0.2 * hash2(i, i));
      clouds.setColorAt(i, col);
    }
    clouds.instanceColor.needsUpdate = true;
  }
  scene.add(clouds);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 60000);
  camera.position.set(0, 200, -800);

  return { scene, camera, sun, plane, prop, ringMeshes, snapped: false };
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
  // Prop blur disc: opacity grows with throttle (a still disc at idle).
  // Fainter in the cockpit — from the pilot's seat it sits right in the
  // eyeline and would wash out the mountain ahead.
  view.prop.material.opacity = cockpit
    ? 0.05 + p.throttle * 0.1
    : 0.12 + p.throttle * 0.3;
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
