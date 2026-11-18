// Traffic and pedestrians for Neon Bay. Cars drive the road grid in lanes,
// slowing for the car ahead; pedestrians stroll the sidewalks and cross at
// intersections. Both spawn around the player and recycle when far away.
import * as THREE from 'three';
import { makeCar, Car, randomCarColor } from './vehicles.js';
import { makePerson } from './player.js';
import { ROADS, resolveCircle } from './city.js';
import { mulberry32, range, pick } from './rng.js';

const PED_SHIRTS = [0xe84a5f, 0x3fa7d6, 0x59a96a, 0xe8a33d, 0x7a5fd0, 0xd8d8d8, 0x4a4a55];

export class Traffic {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = mulberry32(777);
    this.cars = [];
    this.peds = [];
    this.carCount = 14;
    this.pedCount = 20;
  }

  spawnAll(px, pz) {
    for (let i = 0; i < this.carCount; i += 1) this.addCar(px, pz, true);
    for (let i = 0; i < this.pedCount; i += 1) this.addPed(px, pz, true);
  }

  // A random road point near (px, pz), on a lane (offset 3 from centre).
  roadPointNear(px, pz, spread) {
    const r = this.rng;
    const road = pick(r, ROADS);
    const along = (r() < 0.5 ? px : pz) + range(r, -spread, spread);
    const lane = (r() < 0.5 ? 3 : -3);
    if (r() < 0.5) return { x: road + lane, z: Math.max(-280, Math.min(280, along)), axis: 'z' };
    return { x: Math.max(-280, Math.min(280, along)), z: road + lane, axis: 'x' };
  }

  addCar(px, pz, anywhere) {
    const r = this.rng;
    const p = this.roadPointNear(px, pz, anywhere ? 260 : 120);
    const group = makeCar(randomCarColor(r));
    this.scene.add(group);
    const car = new Car(group, p.x, p.z, 0);
    car.maxSpeed = range(r, 9, 15);
    // Lane direction follows the sign of the lane offset, so the two lanes
    // of a road always run opposite ways and cars keep to their side.
    const laneSign = p.axis === 'z' ? Math.sign(p.x - (Math.round(p.x / 60) * 60)) : Math.sign(p.z - (Math.round(p.z / 60) * 60));
    if (p.axis === 'z') car.heading = laneSign >= 0 ? Math.PI : 0;
    else car.heading = laneSign >= 0 ? -Math.PI / 2 : Math.PI / 2;
    car.speed = car.maxSpeed * 0.7;
    car.kind = 'traffic';
    car.targetSpeed = car.maxSpeed;
    this.cars.push(car);
    return car;
  }

  addPed(px, pz, anywhere) {
    const r = this.rng;
    const road = pick(r, ROADS);
    const along = (r() < 0.5 ? px : pz) + range(r, -spreadFor(anywhere), spreadFor(anywhere));
    const side = r() < 0.5 ? 8.5 : -8.5;
    const onXRoad = r() < 0.5;
    const x = onXRoad ? Math.max(-280, Math.min(280, along)) : road + side;
    const z = onXRoad ? road + side : Math.max(-280, Math.min(280, along));
    const group = makePerson(PED_SHIRTS[Math.floor(r() * PED_SHIRTS.length)]);
    group.scale.setScalar(range(r, 0.92, 1.06));
    this.scene.add(group);
    const ped = {
      group,
      pos: new THREE.Vector3(x, 0, z),
      heading: r() * Math.PI * 2,
      speed: range(r, 1.4, 2.6),
      walkPhase: r() * 6,
      down: false,
      downTimer: 0,
      axis: onXRoad ? 'x' : 'z',
      dir: r() < 0.5 ? 1 : -1,
    };
    group.position.copy(ped.pos);
    this.peds.push(ped);
    return ped;
  }

  // One step of traffic: follow the road, brake for the car ahead, turn at
  // intersections; pedestrians walk their sidewalk and turn at corners.
  step(dt, px, pz, playerCar) {
    const r = this.rng;
    for (const car of this.cars) {
      // Slow down for anything ahead in the same lane.
      let blocked = false;
      const fx = Math.sin(car.heading); const fz = Math.cos(car.heading);
      for (const other of this.cars) {
        if (other === car) continue;
        const dx = other.pos.x - car.pos.x; const dz = other.pos.z - car.pos.z;
        const ahead = dx * fx + dz * fz;
        const side = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < 13 && side < 2.6) { blocked = true; break; }
      }
      if (playerCar) {
        const dx = playerCar.pos.x - car.pos.x; const dz = playerCar.pos.z - car.pos.z;
        const ahead = dx * fx + dz * fz;
        const side = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < 12 && side < 2.8) blocked = true;
      }
      const target = blocked ? 0 : car.targetSpeed;
      car.speed += (target - car.speed) * Math.min(1, dt * 1.6);
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      // At an intersection, sometimes turn onto the crossing road.
      const nearRoadX = nearestRoad(car.pos.x);
      const nearRoadZ = nearestRoad(car.pos.z);
      if (Math.abs(car.pos.x - nearRoadX) < 1.2 && Math.abs(car.pos.z - nearRoadZ) < 1.2 && r() < dt * 0.5) {
        const axis = car.heading % Math.PI === 0 ? 'z' : 'x';
        if (axis === 'z') {
          car.heading = r() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
          car.pos.z = nearRoadZ + (car.heading === Math.PI / 2 ? -3 : 3);
        } else {
          car.heading = r() < 0.5 ? 0 : Math.PI;
          car.pos.x = nearRoadX + (car.heading === 0 ? -3 : 3);
        }
      }
      // Keep inside the city; recycle far from the player.
      if (Math.abs(car.pos.x) > 288 || Math.abs(car.pos.z) > 288
        || Math.hypot(car.pos.x - px, car.pos.z - pz) > 240) {
        this.recycleCar(car, px, pz);
      }
      car.sync();
    }
    for (const ped of this.peds) {
      if (ped.down) {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.down = false;
          ped.group.rotation.x = 0;
          ped.group.position.y = 0;
        }
        continue;
      }
      ped.walkPhase += dt * 7;
      const stepLen = ped.speed * dt;
      if (ped.axis === 'x') ped.pos.x += ped.dir * stepLen;
      else ped.pos.z += ped.dir * stepLen;
      // Turn at an intersection or the city edge.
      const atRoad = ped.axis === 'x'
        ? Math.abs(ped.pos.z - nearestRoad(ped.pos.z)) < 1
        : Math.abs(ped.pos.x - nearestRoad(ped.pos.x)) < 1;
      if (atRoad && r() < dt * 0.25) {
        ped.axis = ped.axis === 'x' ? 'z' : 'x';
        ped.dir = r() < 0.5 ? 1 : -1;
      }
      if (Math.abs(ped.pos.x) > 284 || Math.abs(ped.pos.z) > 284) ped.dir *= -1;
      ped.heading = ped.axis === 'x' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir > 0 ? 0 : Math.PI);
      const swing = Math.sin(ped.walkPhase) * 0.5;
      const u = ped.group.userData;
      u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.7; u.armR.rotation.x = swing * 0.7;
      ped.group.position.copy(ped.pos);
      ped.group.rotation.y = ped.heading;
      if (Math.hypot(ped.pos.x - px, ped.pos.z - pz) > 220) this.recyclePed(ped, px, pz);
    }
  }

  recycleCar(car, px, pz) {
    const p = this.roadPointNear(px, pz, 130);
    car.pos.set(p.x, 0, p.z);
    const laneSign = p.axis === 'z'
      ? Math.sign(p.x - (Math.round(p.x / 60) * 60))
      : Math.sign(p.z - (Math.round(p.z / 60) * 60));
    car.heading = p.axis === 'z' ? (laneSign >= 0 ? Math.PI : 0) : (laneSign >= 0 ? -Math.PI / 2 : Math.PI / 2);
    car.speed = car.targetSpeed * 0.7;
  }

  recyclePed(ped, px, pz) {
    const p = this.roadPointNear(px, pz, 120);
    ped.pos.set(p.x, 0, p.z);
    ped.axis = p.axis;
    ped.dir = this.rng() < 0.5 ? 1 : -1;
    ped.group.position.copy(ped.pos);
  }

  // Knock a pedestrian down (hit by a car or a bullet). Returns the ped.
  knockDown(pos, radius) {
    let best = null; let bestD = Infinity;
    for (const ped of this.peds) {
      if (ped.down) continue;
      const d = Math.hypot(ped.pos.x - pos.x, ped.pos.z - pos.z);
      if (d < radius && d < bestD) { best = ped; bestD = d; }
    }
    if (best) {
      best.down = true;
      best.downTimer = 6;
      best.group.rotation.x = -Math.PI / 2;
      best.group.position.y = 0.4;
    }
    return best;
  }

  nearestCar(pos, maxDist) {
    let best = null; let bestD = maxDist;
    for (const car of this.cars) {
      const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
      if (d < bestD) { best = car; bestD = d; }
    }
    return best;
  }

  removeCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    this.scene.remove(car.group);
  }
}

function spreadFor(anywhere) {
  return anywhere ? 260 : 120;
}

function nearestRoad(v) {
  let best = ROADS[0]; let bestD = Infinity;
  for (const r of ROADS) {
    const d = Math.abs(v - r);
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}
