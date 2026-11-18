// Neon Bay itself: a sun-soaked procedural coastal city. Everything is
// built from boxes, cylinders and canvas textures — no model files, so the
// game loads offline. The layout is a road grid; the sea sits to the south.
import * as THREE from 'three';
import { makeRng } from './rng.js';
import { clamp } from './util.js';

export const ROAD_CENTERS = [-160, -120, -80, -40, 0, 40, 80, 120, 160];
export const ROAD_HALF = 5;
export const CITY_EDGE = 165;
export const BEACH_Z = 168;
export const SEA_Z = 196;

// One canvas texture per facade tint; windows are drawn once and reused.
function facadeTexture(tint, litRatio, rng) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = tint;
  g.fillRect(0, 0, 128, 256);
  // Subtle vertical shading so faces read as separate floors.
  for (let y = 0; y < 256; y += 32) {
    g.fillStyle = 'rgba(0,0,0,0.05)';
    g.fillRect(0, y, 128, 2);
  }
  const cols = 4;
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = 10 + col * 30;
      const y = 14 + r * 30;
      const lit = rng.next() < litRatio;
      g.fillStyle = lit ? '#ffd98a' : '#20242e';
      g.fillRect(x, y, 18, 20);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x, y, 18, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function palmMesh(rng) {
  const palm = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a45 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 5.5, 6), trunkMat);
  trunk.position.y = 2.75;
  trunk.rotation.z = rng.range(-0.08, 0.08);
  palm.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f9e44, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.1, 5.6, Math.sin(a) * 1.1);
    leaf.rotation.z = Math.cos(a) * 1.1;
    leaf.rotation.x = -Math.sin(a) * 1.1;
    leaf.scale.set(1, 1, 0.28);
    palm.add(leaf);
  }
  return palm;
}

export function buildCity(scene) {
  const rng = makeRng(20261118);
  const colliders = [];
  const clouds = [];

  // --- lights ---------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 520;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.1));
  scene.fog = new THREE.Fog(0xcfe4f5, 260, 620);

  // --- ground, beach, sea ---------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 760),
    new THREE.MeshLambertMaterial({ color: 0x9aa07e }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.08, 40);
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 48),
    new THREE.MeshLambertMaterial({ color: 0xe8d29a }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, BEACH_Z + 20);
  sand.receiveShadow = true;
  scene.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 320),
    new THREE.MeshLambertMaterial({ color: 0x2a7fc4 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.35, SEA_Z + 160);
  scene.add(sea);

  // --- roads ----------------------------------------------------------------
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d8 });
  for (const c of ROAD_CENTERS) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, CITY_EDGE * 2 + 10), roadMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(c, 0, 0);
    v.receiveShadow = true;
    scene.add(v);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(CITY_EDGE * 2 + 10, ROAD_HALF * 2), roadMat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.001, c);
    h.receiveShadow = true;
    scene.add(h);
    // Centre dashes along both directions.
    for (let t = -CITY_EDGE + 10; t < CITY_EDGE; t += 16) {
      const d1 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 5), dashMat);
      d1.rotation.x = -Math.PI / 2;
      d1.position.set(c, 0.02, t);
      scene.add(d1);
      const d2 = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.5), dashMat);
      d2.rotation.x = -Math.PI / 2;
      d2.position.set(t, 0.021, c);
      scene.add(d2);
    }
  }

  // --- facades --------------------------------------------------------------
  const tints = ['#b8a88a', '#8f9aa3', '#a89a7a', '#7d8a99', '#c2b49a'];
  const baseTex = tints.map((t) => facadeTexture(t, 0.22, rng));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4a48 });

  // Block centres are the 30-wide squares between roads.
  const blockCenters = [-140, -100, -60, -20, 20, 60, 100, 140];
  const plaza = { x: 20, z: -20 };
  const parks = new Set(['-140,-100', '100,100', '-100,140', '140,-140', '-140,60']);
  const station = { x: -20, z: -20 };
  const hospital = { x: 60, z: 140 };
  const dock = { x: 140, z: 186 };
  const safehouse = { x: -140, z: -100 };

  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      const key = `${bx},${bz}`;
      if (bx === plaza.x && bz === plaza.z) continue; // plaza + Bay Tower
      if (parks.has(key)) {
        const park = new THREE.Mesh(
          new THREE.PlaneGeometry(30, 30),
          new THREE.MeshLambertMaterial({ color: 0x58a84e }),
        );
        park.rotation.x = -Math.PI / 2;
        park.position.set(bx, 0.03, bz);
        park.receiveShadow = true;
        scene.add(park);
        for (let i = 0; i < 5; i++) {
          const palm = palmMesh(rng);
          palm.position.set(bx + rng.range(-11, 11), 0, bz + rng.range(-11, 11));
          palm.castShadow = true;
          scene.add(palm);
        }
        continue;
      }
      // One to three buildings per block, kept off the road edges.
      const count = rng.int(1, 3);
      for (let i = 0; i < count; i++) {
        const w = rng.range(9, 15);
        const d = rng.range(9, 15);
        const h = rng.range(10, 46);
        const x = bx + rng.range(-8, 8);
        const z = bz + rng.range(-8, 8);
        const tex = baseTex[rng.int(0, baseTex.length - 1)].clone();
        tex.needsUpdate = true;
        tex.repeat.set(Math.max(1, Math.round(w / 12)), Math.max(1, Math.round(h / 14)));
        const side = new THREE.MeshLambertMaterial({ map: tex });
        const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [
          side,
          side,
          roofMat,
          roofMat,
          side,
          side,
        ]);
        building.position.set(x, h / 2, z);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
    }
  }

  // --- Bay Tower (plaza landmark) -------------------------------------------
  {
    const towerTex = baseTex[1].clone();
    towerTex.needsUpdate = true;
    towerTex.repeat.set(3, 6);
    const side = new THREE.MeshLambertMaterial({ map: towerTex });
    const tower = new THREE.Mesh(new THREE.BoxGeometry(20, 92, 20), [side, side, roofMat, roofMat, side, side]);
    tower.position.set(plaza.x, 46, plaza.z);
    tower.castShadow = true;
    scene.add(tower);
    colliders.push({ minX: plaza.x - 10, maxX: plaza.x + 10, minZ: plaza.z - 10, maxZ: plaza.z + 10 });
    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshLambertMaterial({ color: 0xcbbf9f }),
    );
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(plaza.x, 0.03, plaza.z);
    slab.receiveShadow = true;
    scene.add(slab);
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 6, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd24a }),
    );
    beacon.position.set(plaza.x, 95, plaza.z);
    scene.add(beacon);
  }

  // --- police station + hospital (low marker buildings) ----------------------
  function markerBuilding(x, z, w, d, h, color) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color }),
    );
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    scene.add(m);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }
  markerBuilding(station.x, station.z, 18, 12, 9, 0x3a5a8c);
  markerBuilding(hospital.x, hospital.z, 20, 12, 11, 0xe8e8e8);

  // --- streetlights ----------------------------------------------------------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x22242a });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const c of ROAD_CENTERS) {
    for (let t = -140; t <= 140; t += 40) {
      for (const [x, z] of [
        [c + 6, t],
        [t, c + 6],
      ]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.5, 6), poleMat);
        pole.position.set(x, 3.25, z);
        pole.castShadow = true;
        scene.add(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), lampMat);
        lamp.position.set(x, 6.6, z);
        scene.add(lamp);
      }
    }
  }

  // --- beach palms -----------------------------------------------------------
  for (let x = -150; x <= 150; x += 18) {
    if (rng.chance(0.7)) {
      const palm = palmMesh(rng);
      palm.position.set(x + rng.range(-4, 4), 0, BEACH_Z + rng.range(4, 26));
      palm.castShadow = true;
      scene.add(palm);
    }
  }

  // --- drifting clouds -------------------------------------------------------
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 9; i++) {
    const cloud = new THREE.Group();
    const puffs = rng.int(3, 5);
    for (let p = 0; p < puffs; p++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rng.range(5, 10), 8, 6), cloudMat);
      s.position.set(p * rng.range(5, 8) - 10, rng.range(-1, 1.5), rng.range(-3, 3));
      s.scale.y = 0.45;
      cloud.add(s);
    }
    cloud.position.set(rng.range(-220, 220), rng.range(70, 110), rng.range(-200, 160));
    cloud.userData.drift = rng.range(0.6, 1.6);
    scene.add(cloud);
    clouds.push(cloud);
  }

  // Intersections for traffic / police routing.
  const nodes = [];
  for (const x of ROAD_CENTERS) {
    for (const z of ROAD_CENTERS) nodes.push({ x, z });
  }

  return {
    colliders,
    roads: ROAD_CENTERS,
    nodes,
    clouds,
    plaza,
    station,
    hospital,
    dock,
    safehouse,
    beachZ: BEACH_Z,
  };
}
