// Neon Bay's street life: AI cars that follow the road grid and pedestrians
// who stroll the sidewalks and run from gunfire. Traffic cars keep to the
// right-hand lane, brake for the car ahead, and turn at intersections.
import * as THREE from 'three';
import { makeCar, randomCarColor, stepCar } from './vehicles.js';
import { clamp, dist2D } from './util.js';
import { ROAD_CENTERS, CITY_EDGE } from './city.js';

function laneOffset(axis, dir) {
  // Right-hand traffic: the lane sits 2.5 to the right of the road centre.
  if (axis === 'x') return dir > 0 ? -2.5 : 2.5;
  return dir > 0 ? 2.5 : -2.5;
}

export function spawnTrafficCar(G, atEdge) {
  const axis = G.rng.chance(0.5) ? 'x' : 'z';
  const road = G.rng.pick(ROAD_CENTERS);
  const dir = G.rng.chance(0.5) ? 1 : -1;
  let along;
  if (atEdge) {
    along = dir > 0 ? -CITY_EDGE : CITY_EDGE;
  } else {
    along = G.rng.range(-CITY_EDGE, CITY_EDGE);
  }
  const car = makeCar(0, 0, 0, randomCarColor(G.rng), false);
  car.roadAxis = axis;
  car.roadCoord = road;
  car.dir = dir;
  car.cruise = G.rng.range(8, 13);
  car.x = axis === 'x' ? road + laneOffset(axis, dir) : along;
  car.z = axis === 'x' ? along : road + laneOffset(axis, dir);
  car.heading = axis === 'x' ? (dir > 0 ? Math.PI : 0) : dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  car.speed = car.cruise;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  G.scene.add(car.mesh);
  return car;
}

function nearestIntersectionCoord(value) {
  let best = ROAD_CENTERS[0];
  for (const c of ROAD_CENTERS) {
    if (Math.abs(c - value) < Math.abs(best - value)) best = c;
  }
  return best;
}

export function createTraffic(G) {
  G.trafficCars = [];
  for (let i = 0; i < 14; i++) G.trafficCars.push(spawnTrafficCar(G, false));
  G.peds = [];
  for (let i = 0; i < 20; i++) G.peds.push(spawnPed(G, false));
}

function pedMesh(rng) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({
    color: [0x3a6fd2, 0xd2a23a, 0x7a4fd2, 0x3aa655, 0xd2603a, 0x9aa3ad][Math.floor(rng.next() * 6)],
  });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc89878 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x333a48 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.55, 4, 8), shirt);
  torso.position.y = 1.0;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), skin);
  head.position.y = 1.68;
  group.add(head);
  const legGeo = new THREE.BoxGeometry(0.18, 0.6, 0.2);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.16, 0.3, 0);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.16, 0.3, 0);
  group.add(legR);
  return { group, legL, legR };
}

export function spawnPed(G, near) {
  const parts = pedMesh(G.rng);
  const x = near ? near.x + G.rng.range(-8, 8) : G.rng.range(-160, 160);
  const z = near ? near.z + G.rng.range(-8, 8) : G.rng.range(-160, 160);
  parts.group.position.set(x, 0, z);
  G.scene.add(parts.group);
  return {
    parts,
    mesh: parts.group,
    x,
    z,
    heading: G.rng.range(0, Math.PI * 2),
    speed: G.rng.range(1.4, 2.6),
    target: { x: G.rng.range(-160, 160), z: G.rng.range(-160, 160) },
    walkPhase: G.rng.range(0, 6),
    down: false,
    downTimer: 0,
    fleeTimer: 0,
    fleeFrom: null,
  };
}

function updateTrafficCar(G, car, dt) {
  // Find the next intersection along this road.
  const along = car.roadAxis === 'x' ? car.z : car.x;
  const next = car.dir > 0 ? nearestIntersectionCoord(along + 6) : nearestIntersectionCoord(along - 6);
  const atNode = Math.abs(along - next) < 1.5;

  // Brake for the car ahead in the same lane.
  let targetSpeed = car.cruise;
  for (const other of G.trafficCars) {
    if (other === car || other.roadAxis !== car.roadAxis || other.roadCoord !== car.roadCoord || other.dir !== car.dir) {
      continue;
    }
    const ahead = car.roadAxis === 'x' ? (other.z - car.z) * car.dir : (other.x - car.x) * car.dir;
    if (ahead > 0 && ahead < 11) {
      targetSpeed = 0;
      break;
    }
  }
  // Brake for the player's car when it is right ahead.
  if (G.player.car) {
    const pc = G.player.car;
    const dx = pc.x - car.x;
    const dz = pc.z - car.z;
    const forward = car.roadAxis === 'x' ? dz * car.dir : dx * car.dir;
    const lateral = car.roadAxis === 'x' ? Math.abs(dx) : Math.abs(dz);
    if (forward > 0 && forward < 10 && lateral < 4) targetSpeed = 0;
  }

  car.speed += clamp(targetSpeed - car.speed, -14 * dt, 8 * dt);
  if (car.speed < 0.2 && targetSpeed === 0) car.speed = 0;

  if (atNode && car.speed > 1) {
    // At an intersection: mostly straight on, sometimes turn onto the
    // crossing road in a random direction.
    if (G.rng.next() < 0.18) {
      const newAxis = car.roadAxis === 'x' ? 'z' : 'x';
      const newCoord = nearestIntersectionCoord(car.roadAxis === 'x' ? car.z : car.x);
      car.roadAxis = newAxis;
      car.roadCoord = newCoord;
      car.dir = G.rng.chance(0.5) ? 1 : -1;
    }
  }

  // Move along the road, snapping the lateral position to the lane.
  if (car.roadAxis === 'x') {
    car.z += car.dir * car.speed * dt;
    car.x += (car.roadCoord + laneOffset('x', car.dir) - car.x) * Math.min(1, dt * 4);
    car.heading = car.dir > 0 ? Math.PI : 0;
  } else {
    car.x += car.dir * car.speed * dt;
    car.z += (car.roadCoord + laneOffset('z', car.dir) - car.z) * Math.min(1, dt * 4);
    car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  // Recycle cars that left the city or sat still too long.
  const out =
    car.roadAxis === 'x'
      ? Math.abs(car.z) > CITY_EDGE + 12
      : Math.abs(car.x) > CITY_EDGE + 12;
  if (out) {
    const fresh = spawnTrafficCar(G, true);
    const i = G.trafficCars.indexOf(car);
    G.scene.remove(car.mesh);
    if (i >= 0) G.trafficCars[i] = fresh;
    return;
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const spin = (car.speed * dt) / 0.38;
  for (const w of car.wheels) w.rotation.x += spin;
}

function updatePed(G, ped, dt) {
  if (ped.down) {
    ped.downTimer -= dt;
    ped.mesh.rotation.x = Math.max(0, ped.mesh.rotation.x - dt * 2);
    if (ped.downTimer <= 0) {
      G.scene.remove(ped.mesh);
      const i = G.peds.indexOf(ped);
      if (i >= 0) G.peds[i] = spawnPed(G, null);
    }
    return;
  }
  let tx = ped.target.x;
  let tz = ped.target.z;
  let speed = ped.speed;
  if (ped.fleeTimer > 0) {
    ped.fleeTimer -= dt;
    if (ped.fleeFrom) {
      tx = ped.x + (ped.x - ped.fleeFrom.x);
      tz = ped.z + (ped.z - ped.fleeFrom.z);
      speed = ped.speed * 2.4;
    }
  }
  const dx = tx - ped.x;
  const dz = tz - ped.z;
  const d = Math.hypot(dx, dz);
  if (d < 2) {
    ped.target = { x: G.rng.range(-160, 160), z: G.rng.range(-160, 160) };
    return;
  }
  ped.heading = Math.atan2(dx, -dz);
  ped.x += (dx / d) * speed * dt;
  ped.z += (dz / d) * speed * dt;
  ped.walkPhase += dt * speed * 3.2;
  ped.mesh.position.set(ped.x, 0, ped.z);
  ped.mesh.rotation.y = ped.heading;
  const swing = Math.sin(ped.walkPhase) * 0.5;
  ped.parts.legL.rotation.x = swing;
  ped.parts.legR.rotation.x = -swing;
}

export function updateTraffic(G, dt) {
  for (const car of [...G.trafficCars]) updateTrafficCar(G, car, dt);
  for (const ped of [...G.peds]) updatePed(G, ped, dt);
}

// Called by combat: every pedestrian near the shot runs from it.
export function scarePeds(G, x, z, radius) {
  for (const ped of G.peds) {
    if (ped.down) continue;
    if (dist2D(ped.x, ped.z, x, z) < radius) {
      ped.fleeTimer = 3;
      ped.fleeFrom = { x, z };
    }
  }
}

export { stepCar };
