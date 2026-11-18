// Cars for Neon Bay: one mesh factory and one arcade physics step. A car is
// a box body, a cabin, four wheels and two headlights; the physics is a
// bicycle-lite model — speed along the heading, steering that bites harder
// at low speed, a handbrake that breaks the rear loose.
import * as THREE from 'three';
import { clamp, pushCircleOutOfBox } from './util.js';

const CAR_COLORS = [0xd23b2e, 0x2e6fd2, 0xe8b93b, 0x3aa655, 0x8a5fd2, 0xd8d8d8, 0x22242a, 0xe2703a];

export function randomCarColor(rng) {
  return CAR_COLORS[Math.floor(rng.next() * CAR_COLORS.length)];
}

export function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x181a20 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fc4d8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.3), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), glassMat);
  cabin.position.set(0, 1.1, -0.25);
  cabin.castShadow = true;
  group.add(cabin);

  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.28, 0.3), darkMat);
  bumperF.position.set(0, 0.42, 2.15);
  group.add(bumperF);
  const bumperB = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.28, 0.3), darkMat);
  bumperB.position.set(0, 0.42, -2.15);
  group.add(bumperB);

  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheels = [];
  for (const [x, z] of [
    [-0.95, 1.35],
    [0.95, 1.35],
    [-0.95, -1.35],
    [0.95, -1.35],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.38, z);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }

  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const x of [-0.65, 0.65]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), lightMat);
    lamp.position.set(x, 0.62, 2.32);
    group.add(lamp);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const x of [-0.65, 0.65]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), tailMat);
    lamp.position.set(x, 0.62, -2.32);
    group.add(lamp);
  }

  let lightBar = null;
  if (isPolice) {
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.5), darkMat);
    barBase.position.set(0, 1.48, -0.25);
    group.add(barBase);
    lightBar = {
      red: new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.2, 0.46),
        new THREE.MeshBasicMaterial({ color: 0xff2020 }),
      ),
      blue: new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.2, 0.46),
        new THREE.MeshBasicMaterial({ color: 0x2040ff }),
      ),
    };
    lightBar.red.position.set(-0.38, 1.5, -0.25);
    lightBar.blue.position.set(0.38, 1.5, -0.25);
    group.add(lightBar.red);
    group.add(lightBar.blue);
  }

  return { group, wheels, lightBar };
}

// A fresh drivable car state. `heading` is radians, 0 = facing -z (north).
export function makeCar(x, z, heading, color, isPolice) {
  const mesh = makeCarMesh(color, isPolice);
  mesh.group.position.set(x, 0, z);
  mesh.group.rotation.y = heading;
  return {
    mesh: mesh.group,
    wheels: mesh.wheels,
    lightBar: mesh.lightBar,
    x,
    z,
    heading,
    speed: 0,
    steer: 0,
    hp: 100,
    isPolice: !!isPolice,
    color,
    // Traffic AI fields (unused for the player's car).
    roadAxis: null,
    roadCoord: 0,
    dir: 1,
    lane: 1,
    stuck: 0,
  };
}

// Arcade drive step. `drive` is { throttle: -1..1, steer: -1..1, brake: bool }.
export function stepCar(car, drive, dt, colliders) {
  const maxSpeed = car.isPolice ? 40 : 38;
  const maxReverse = 11;
  const accel = 24;
  const brakeDecel = 34;
  const drag = 2.2;

  if (drive.brake) {
    car.speed -= Math.sign(car.speed) * brakeDecel * dt;
    if (Math.abs(car.speed) < 1.2) car.speed = 0;
  } else if (drive.throttle > 0) {
    car.speed += accel * drive.throttle * dt;
  } else if (drive.throttle < 0) {
    if (car.speed > 0.5) {
      car.speed -= brakeDecel * 0.7 * dt;
    } else {
      car.speed += accel * 0.55 * drive.throttle * dt;
    }
  }
  // Rolling drag, stronger when the handbrake is on.
  const dragK = drive.brake ? 5.5 : drag;
  car.speed -= car.speed * dragK * dt * 0.4;
  car.speed = clamp(car.speed, -maxReverse, maxSpeed);

  // Steering bites less the faster the car goes; the handbrake sharpens it.
  const speedFactor = clamp(Math.abs(car.speed) / 12, 0.25, 1);
  const steerAuthority = (drive.brake ? 1.9 : 1.15) * (1.25 - speedFactor * 0.55);
  car.steer = clamp(drive.steer, -1, 1);
  const turnRate = car.steer * steerAuthority * (car.speed >= 0 ? 1 : -1);
  car.heading += turnRate * (Math.abs(car.speed) / 12) * dt * 1.9;

  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z - Math.cos(car.heading) * car.speed * dt;
  car.x = nx;
  car.z = nz;

  // Keep the car inside the world.
  car.x = clamp(car.x, -185, 185);
  car.z = clamp(car.z, -185, 215);

  // Building collision: circle vs every nearby box, push out and bleed speed.
  const out = { x: car.x, z: car.z };
  let hit = false;
  for (const box of colliders) {
    if (Math.abs(car.x - (box.minX + box.maxX) / 2) > 30 || Math.abs(car.z - (box.minZ + box.maxZ) / 2) > 30) {
      continue;
    }
    if (pushCircleOutOfBox(car.x, car.z, 1.9, box, out)) {
      hit = true;
      car.x = out.x;
      car.z = out.z;
    }
  }
  if (hit && Math.abs(car.speed) > 6) {
    car.speed *= 0.55;
  }

  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  // Spin the wheels with the road speed and turn the front pair.
  const spin = (car.speed * dt) / 0.38;
  for (let i = 0; i < car.wheels.length; i++) {
    car.wheels[i].rotation.x += spin;
    if (i < 2) car.wheels[i].rotation.y = car.steer * 0.38;
  }
}
