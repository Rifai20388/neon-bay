// Neon Bay's city: a procedural sun-soaked coastal grid. Roads run every 60
// units; blocks hold towers, shops and parks; a beach and the sea close the
// south edge. Everything is boxes, shared materials and one canvas window
// texture, so the whole city costs a few hundred draw calls at most.
import * as THREE from 'three';
import { mulberry32, range, pick, int } from './rng.js';

export const ROAD_PITCH = 60;
export const ROAD_W = 12;
export const ROADS = [-240, -180, -120, -60, 0, 60, 120, 180, 240];
export const CITY_HALF = 290;
export const BEACH_Z = 268;
export const SEA_Z = 320;
export const WORLD = { minX: -CITY_HALF, maxX: CITY_HALF, minZ: -CITY_HALF, maxZ: 312 };

// Push a circle (x, z, radius) out of every building AABB it overlaps.
// Returns true when a push happened. Used by the player, cars and traffic.
export function resolveCircle(pos, radius, colliders) {
  let hit = false;
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // Centre inside the box: shove out along the smallest overlap.
        const l = pos.x - c.minX; const r = c.maxX - pos.x;
        const t = pos.z - c.minZ; const b = c.maxZ - pos.z;
        const m = Math.min(l, r, t, b);
        if (m === l) pos.x = c.minX - radius;
        else if (m === r) pos.x = c.maxX + radius;
        else if (m === t) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  return hit;
}

function windowTexture(rng, base, lit) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 16) {
    for (let x = 8; x < 120; x += 16) {
      const r = rng();
      g.fillStyle = r < lit ? '#ffd98a' : (r < lit + 0.25 ? '#9fc4e8' : '#20242c');
      g.fillRect(x, y, 10, 11);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = '#2b2b31'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#e8c33c'; g.fillRect(30, 8, 4, 24);
  g.fillStyle = '#c8c8c8'; g.fillRect(2, 0, 2, 64); g.fillRect(60, 0, 2, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene) {
  const rng = mulberry32(1337);
  const colliders = [];
  const clouds = [];
  const animated = { sea: null, clouds };

  // Light: warm late-afternoon sun plus sky bounce.
  const sun = new THREE.DirectionalLight(0xffe2b0, 1.9);
  sun.position.set(180, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 800;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x9a8a70, 0.95));
  scene.background = new THREE.Color(0x8ec3e8);
  scene.fog = new THREE.Fog(0x9fc8e8, 420, 900);

  // Ground: pale concrete, then the beach and the sea to the south.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 760),
    new THREE.MeshLambertMaterial({ color: 0xb8b2a4 }),
  );
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 20);
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 64),
    new THREE.MeshLambertMaterial({ color: 0xe8d29a }),
  );
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.05, BEACH_Z + 30);
  sand.receiveShadow = true;
  scene.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 420),
    new THREE.MeshLambertMaterial({ color: 0x2a7fae }),
  );
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.02, SEA_Z + 208);
  scene.add(sea);
  animated.sea = sea;

  // Roads: dark strips with a dashed centre line, both directions.
  const roadTex = roadTexture();
  for (const r of ROADS) {
    for (const horizontal of [true, false]) {
      const tex = roadTex.clone();
      tex.needsUpdate = true;
      // U runs along the road's 600 length: 9 dash tiles; V spans its width once.
      tex.repeat.set(9, 1);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const road = new THREE.Mesh(new THREE.PlaneGeometry(600, ROAD_W), mat);
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = horizontal ? 0 : Math.PI / 2;
      road.position.set(horizontal ? 0 : r, 0.08, horizontal ? r : 0);
      road.receiveShadow = true;
      scene.add(road);
    }
  }

  // Buildings: one window texture per facade tone, repeated per building.
  const facadeTones = [
    { base: '#c9b8a3', lit: 0.22 }, { base: '#a8b8c4', lit: 0.18 },
    { base: '#d8a08a', lit: 0.26 }, { base: '#b3c4a8', lit: 0.2 },
    { base: '#8fa8c8', lit: 0.3 }, { base: '#e0d4c0', lit: 0.2 },
  ];
  const facadeMats = facadeTones.map((t) => {
    const tex = windowTexture(rng, t.base, t.lit);
    return new THREE.MeshLambertMaterial({ map: tex });
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5348 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x3d6f9e, emissive: 0x1a3a55 });

  const blockCentres = [];
  for (let i = 0; i < 8; i += 1) {
    for (let j = 0; j < 8; j += 1) {
      blockCentres.push({ x: -210 + i * 60, z: -210 + j * 60 });
    }
  }

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  function addBuilding(x, z, w, d, h, mat, glass) {
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    // Stretch the window grid so windows stay roughly square.
    const tex = mat.map.clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(w / 14)), Math.max(1, Math.round(h / 14)));
    mesh.material = new THREE.MeshLambertMaterial({ map: tex });
    scene.add(mesh);
    if (glass) {
      const crown = new THREE.Mesh(boxGeo, glassMat);
      crown.scale.set(w * 0.7, 2, d * 0.7);
      crown.position.set(x, h + 1, z);
      scene.add(crown);
    }
    const roof = new THREE.Mesh(boxGeo, roofMat);
    roof.scale.set(w * 0.9, 0.6, d * 0.9);
    roof.position.set(x, h + 0.3, z);
    scene.add(roof);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  for (const b of blockCentres) {
    const distCentre = Math.hypot(b.x, b.z);
    const roll = rng();
    if (roll < 0.14) {
      // Park: palms and a lawn instead of a building.
      const lawn = new THREE.Mesh(
        new THREE.PlaneGeometry(44, 44),
        new THREE.MeshLambertMaterial({ color: 0x6fae5a }),
      );
      lawn.rotation.x = -Math.PI / 2; lawn.position.set(b.x, 0.06, b.z);
      lawn.receiveShadow = true;
      scene.add(lawn);
      for (let i = 0; i < 5; i += 1) addPalm(scene, b.x + range(rng, -18, 18), b.z + range(rng, -18, 18), rng);
      continue;
    }
    const tall = distCentre < 90;
    const h = tall ? range(rng, 26, 58) : range(rng, 9, 26);
    const mat = pick(rng, facadeMats);
    if (roll < 0.62) {
      addBuilding(b.x, b.z, range(rng, 26, 40), range(rng, 26, 40), h, mat, h > 44);
    } else {
      // Two smaller buildings side by side.
      addBuilding(b.x - 11, b.z, range(rng, 16, 20), range(rng, 24, 34), h * 0.8, mat, false);
      addBuilding(b.x + 11, b.z, range(rng, 16, 20), range(rng, 24, 34), h * 0.65, pick(rng, facadeMats), false);
    }
  }

  // Landmark: the Bay Tower, the tallest glass slab downtown.
  addBuilding(-210, -210, 34, 34, 74, facadeMats[4], true);

  // Streetlights along the roads.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffe9a0 });
  const poleGeo = new THREE.CylinderGeometry(0.18, 0.24, 7, 6);
  const lampGeo = new THREE.SphereGeometry(0.5, 8, 6);
  for (const r of ROADS) {
    for (let t = -240; t <= 240; t += 60) {
      for (const [x, z] of [[r + 8, t], [t, r + 8]]) {
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, 3.5, z); pole.castShadow = true;
        scene.add(pole);
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(x, 7.1, z);
        scene.add(lamp);
      }
    }
  }

  // Palms along the beach front.
  for (let x = -280; x <= 280; x += 28) {
    if (rng() < 0.75) addPalm(scene, x + range(rng, -6, 6), BEACH_Z + range(rng, 4, 22), rng);
  }

  // Clouds: flat white blobs drifting slowly, high up and far out so they
  // never sit in front of a street-level camera.
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 8; i += 1) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 6, 12), 8, 6), cloudMat);
      puff.scale.y = 0.45;
      puff.position.set(range(rng, -14, 14), range(rng, -2, 2), range(rng, -6, 6));
      cloud.add(puff);
    }
    cloud.position.set(range(rng, -380, 380), range(rng, 170, 230), range(rng, -380, 380));
    scene.add(cloud);
    clouds.push(cloud);
  }

  // The sun disc, low in the west, for the postcard look.
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(14, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false }),
  );
  sunDisc.position.set(-420, 150, -260);
  scene.add(sunDisc);

  return {
    colliders,
    animated,
    update(dt, t) {
      for (const c of clouds) {
        c.position.x += dt * 1.5;
        if (c.position.x > 360) c.position.x = -360;
      }
      if (animated.sea) animated.sea.position.y = 0.02 + Math.sin(t * 0.4) * 0.15;
    },
  };
}

function addPalm(scene, x, z, rng) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.4, 7, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a6a4a }),
  );
  trunk.position.set(x, 3.5, z);
  trunk.rotation.z = range(rng, -0.12, 0.12);
  trunk.castShadow = true;
  scene.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  for (let i = 0; i < 6; i += 1) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.5, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(x + Math.cos(a) * 1.6, 7.4, z + Math.sin(a) * 1.6);
    leaf.rotation.z = Math.cos(a) * 1.1;
    leaf.rotation.x = -Math.sin(a) * 1.1;
    leaf.castShadow = true;
    scene.add(leaf);
  }
}

// Nearest point on the road network to (x, z): the roads form a grid, so snap
// to the closest road line on either axis.
export function nearestRoadPoint(x, z) {
  let best = ROADS[0]; let bestD = Infinity;
  for (const r of ROADS) {
    const d = Math.abs(x - r);
    if (d < bestD) { bestD = d; best = r; }
  }
  const rx = best;
  bestD = Infinity; best = ROADS[0];
  for (const r of ROADS) {
    const d = Math.abs(z - r);
    if (d < bestD) { bestD = d; best = r; }
  }
  const rz = best;
  return Math.abs(x - rx) < Math.abs(z - rz) ? { x: rx, z, axis: 'z' } : { x, z: rz, axis: 'x' };
}
