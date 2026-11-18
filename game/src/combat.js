// Jax's pistol: a hitscan shot from the camera's crosshair, a fading tracer
// and a muzzle flash. Hitting a pedestrian drops them, hitting a cruiser
// damages it, hitting a traffic car stops it — and every hit raises heat.
import * as THREE from 'three';
import { addHeat } from './police.js';
import { scarePeds, spawnPed } from './traffic.js';

const raycaster = new THREE.Raycaster();
const screenCentre = new THREE.Vector2(0, 0);
const MAX_RANGE = 90;

export function createCombat(scene) {
  const tracerMat = new THREE.LineBasicMaterial({
    color: 0xffe9a8,
    transparent: true,
    opacity: 0.9,
  });
  const tracerGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  const tracer = new THREE.Line(tracerGeo, tracerMat);
  tracer.visible = false;
  tracer.frustumCulled = false;
  scene.add(tracer);
  const flash = new THREE.PointLight(0xffd24a, 0, 9, 1.6);
  scene.add(flash);
  return { tracer, tracerMat, flash, life: 0 };
}

function tagEntity(object, entity) {
  object.userData.entity = entity;
}

export function registerShootables(G) {
  for (const ped of G.peds) tagEntity(ped.mesh, { kind: 'ped', ref: ped });
  for (const car of G.trafficCars) tagEntity(car.mesh, { kind: 'car', ref: car });
  for (const cruiser of G.cruisers) tagEntity(cruiser.mesh, { kind: 'cruiser', ref: cruiser });
}

function findEntity(object) {
  let o = object;
  while (o) {
    if (o.userData && o.userData.entity) return o.userData.entity;
    o = o.parent;
  }
  return null;
}

export function tryShoot(G) {
  if (G.shootCooldown > 0 || G.mode !== 'playing') return;
  G.shootCooldown = 0.24;
  G.audio.shot();

  raycaster.setFromCamera(screenCentre, G.camera);
  raycaster.far = MAX_RANGE;
  const targets = [];
  for (const ped of G.peds) if (!ped.down) targets.push(ped.mesh);
  for (const car of G.trafficCars) targets.push(car.mesh);
  for (const cruiser of G.cruisers) targets.push(cruiser.mesh);
  const hits = raycaster.intersectObjects(targets, true);

  // Muzzle at the camera, slightly right and down, like a held pistol.
  const muzzle = G.camera.position.clone();
  const fwd = new THREE.Vector3();
  G.camera.getWorldDirection(fwd);
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  muzzle.addScaledVector(fwd, 1.1).addScaledVector(right, 0.35).add(new THREE.Vector3(0, -0.25, 0));

  let end;
  if (hits.length > 0) {
    const hit = hits[0];
    end = hit.point.clone();
    const entity = findEntity(hit.object);
    if (entity) applyHit(G, entity, end);
  } else {
    end = G.camera.position.clone().addScaledVector(fwd, MAX_RANGE);
  }

  const pos = G.combat.tracer.geometry.attributes.position;
  pos.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
  pos.setXYZ(1, end.x, end.y, end.z);
  pos.needsUpdate = true;
  G.combat.tracer.visible = true;
  G.combat.tracerMat.opacity = 0.9;
  G.combat.life = 0.15;
  G.combat.flash.position.copy(muzzle);
  G.combat.flash.intensity = 14;
}

function applyHit(G, entity, point) {
  if (entity.kind === 'ped') {
    const ped = entity.ref;
    if (ped.down) return;
    ped.down = true;
    ped.downTimer = 2.5;
    ped.mesh.rotation.x = -Math.PI / 2 + 0.12;
    addHeat(G, 8);
    scarePeds(G, point.x, point.z, 16);
    G.audio.thud();
  } else if (entity.kind === 'cruiser') {
    const cruiser = entity.ref;
    cruiser.hp -= 25;
    addHeat(G, 10);
    G.audio.thud();
    if (cruiser.hp <= 0) {
      G.subtitle = 'Cruiser disabled — the cops will remember that.';
      G.subtitleTimer = 4;
    }
  } else if (entity.kind === 'car') {
    const car = entity.ref;
    car.cruise = 0;
    car.speed = Math.max(0, car.speed - 6);
    addHeat(G, 5);
    // The driver bails out and runs.
    const driver = spawnPed(G, { x: car.x + 3, z: car.z + 2 });
    driver.fleeTimer = 4;
    driver.fleeFrom = { x: car.x, z: car.z };
    G.peds.push(driver);
    scarePeds(G, point.x, point.z, 14);
    G.audio.thud();
  }
}

export function updateCombat(G, dt) {
  if (G.combat.life > 0) {
    G.combat.life -= dt;
    G.combat.tracerMat.opacity = Math.max(0, (G.combat.life / 0.15) * 0.9);
    G.combat.flash.intensity = Math.max(0, G.combat.flash.intensity - dt * 160);
    if (G.combat.life <= 0) {
      G.combat.tracer.visible = false;
      G.combat.flash.intensity = 0;
    }
  }
}
