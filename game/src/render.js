// Renderer — Three.js r187 scene for Nusa Sky Courier. (Skills: router /
// threejs-scene-setup / threejs-materials-lighting / threejs-performance /
// camera-systems.) Meshes are a view of world state: buildScene creates them
// once, updateScene copies world state onto them every frame.
import * as THREE from 'three';
import { PALETTE, ISLANDS, CAMERA, PERF } from './config.js';

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

  // Sea — one low-poly plane.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(60000, 60000, 24, 24),
    std(PALETTE.sea, { roughness: 0.5, color: 0x3a9ac8, emissive: 0x0a2a3a, emissiveIntensity: 0.5 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -2, 10000);
  sea.receiveShadow = true;
  scene.add(sea);

  // Islands, one mesh each (plus a lava cap on Bara, a city block on Tanjung).
  for (const island of ISLANDS) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(island.radius, island.height, 20),
      std(island.color),
    );
    cone.position.set(island.x, island.height / 2 - 10, island.z);
    cone.receiveShadow = true;
    scene.add(cone);
    if (island.kind === 'volcano') {
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(island.radius * 0.22, island.height * 0.22, 12),
        new THREE.MeshStandardMaterial({ color: PALETTE.lava, emissive: 0xff3d00, emissiveIntensity: 1.6, roughness: 0.6 }),
      );
      cap.position.set(island.x, island.height - 10, island.z);
      scene.add(cap);
    }
    if (island.kind === 'city') {
      const boxes = [];
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = std(PALETTE.cityGrey, { roughness: 0.8 });
      const city = new THREE.InstancedMesh(geo, mat, 24);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      const p = new THREE.Vector3();
      let i = 0;
      for (let gx = -2; gx <= 2 && i < 24; gx += 1) {
        for (let gz = -2; gz <= 2 && i < 24; gz += 1) {
          if (gx === 0 && gz === 0) continue;
          const h = 120 + ((gx * 7 + gz * 13) % 5) * 60;
          p.set(island.x + gx * 320, h / 2, island.z + gz * 320);
          s.set(180, h, 180);
          m.compose(p, q, s);
          city.setMatrixAt(i, m);
          i += 1;
        }
      }
      city.count = i;
      city.castShadow = true;
      scene.add(city);
    }
    if (island.kind === 'green') {
      const palmGeo = new THREE.ConeGeometry(60, 220, 6);
      const palms = new THREE.InstancedMesh(palmGeo, std(PALETTE.palm), 18);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3(1, 1, 1);
      const p = new THREE.Vector3();
      for (let i = 0; i < 18; i += 1) {
        const a = (i / 18) * Math.PI * 2;
        p.set(island.x + Math.cos(a) * island.radius * 0.62, 260, island.z + Math.sin(a) * island.radius * 0.62);
        m.compose(p, q, s);
        palms.setMatrixAt(i, m);
      }
      scene.add(palms);
    }
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

  // Aircraft from primitives: fuselage, wings, tail, propeller, nav lights.
  // Span 120 ft — a small plane against a 200 ft runway, not a jumbo.
  const plane = new THREE.Group();
  const fuselage = new THREE.Mesh(
    new THREE.ConeGeometry(12, 90, 10),
    std(PALETTE.planeCream, { roughness: 0.5 }),
  );
  fuselage.rotation.x = Math.PI / 2;
  fuselage.castShadow = true;
  plane.add(fuselage);
  const wing = new THREE.Mesh(
    new THREE.BoxGeometry(120, 4, 28),
    std(PALETTE.planeOrange, { roughness: 0.6 }),
  );
  wing.castShadow = true;
  plane.add(wing);
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(45, 4, 18),
    std(PALETTE.planeOrange, { roughness: 0.6 }),
  );
  tail.position.set(0, 5, -38);
  plane.add(tail);
  const fin = new THREE.Mesh(
    new THREE.BoxGeometry(4, 24, 20),
    std(PALETTE.planeOrange, { roughness: 0.6 }),
  );
  fin.position.set(0, 10, -38);
  plane.add(fin);
  const prop = new THREE.Mesh(
    new THREE.BoxGeometry(4, 52, 3),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 }),
  );
  prop.position.set(0, 0, 48);
  plane.add(prop);
  const navL = new THREE.Mesh(
    new THREE.SphereGeometry(3, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x00ff66, emissive: 0x00ff66, emissiveIntensity: 2 }),
  );
  navL.position.set(-60, 0, 0);
  plane.add(navL);
  const navR = navL.clone();
  navR.material = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2 });
  navR.position.x = 60;
  plane.add(navR);
  scene.add(plane);

  // Clouds — flat pink blobs, unlit so they read at dusk.
  const cloudGeo = new THREE.SphereGeometry(1, 8, 6);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xe8a8c8, transparent: true, opacity: 0.5 });
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, 12);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < 12; i += 1) {
      p.set(-6000 + (i % 4) * 4000, 3200 + (i % 3) * 500, 2000 + Math.floor(i / 4) * 6000);
      s.set(1400, 260, 900);
      m.compose(p, q, s);
      clouds.setMatrixAt(i, m);
    }
  }
  scene.add(clouds);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 60000);
  camera.position.set(0, 200, -800);

  return { scene, camera, sun, plane, prop, ringMeshes, snapped: false };
}

export function updateScene(view, world, dt, camOrbit) {
  const p = world.plane;
  // Plane group follows the flight model (feet → scene units are feet).
  view.plane.position.set(p.x, Math.max(p.y, 0) + 8, p.z);
  view.plane.rotation.set(0, 0, 0);
  view.plane.rotation.y = -p.heading * DEG;
  view.plane.rotation.z = -p.roll * DEG;
  view.plane.rotation.x = p.pitch * DEG;
  view.prop.rotation.z += dt * (4 + p.throttle * 30);
  // Rings spin slowly; collected rings hide.
  for (let i = 0; i < view.ringMeshes.length; i += 1) {
    view.ringMeshes[i].rotation.z += dt * 0.4;
    view.ringMeshes[i].visible = !world.rings[i].collected;
  }
  // Chase camera: behind the plane, mouse orbit offsets the yaw.
  // First frame snaps straight behind the plane (no long lerp-in).
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
