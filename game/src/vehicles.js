// Cars for Neon Bay: a low-poly car model built from boxes, and the arcade
// driving model the player, traffic and police all share. No physics engine:
// speed, heading and steering with circle-vs-building collision.
import * as THREE from 'three';
import { resolveCircle, WORLD } from './city.js';

const CAR_COLORS = [0xd84a4a, 0x4a7fd8, 0xe8c33c, 0x4ad884, 0xe8e8e8, 0x2b2b31, 0xd86ab0, 0x7a5fd0];

export function randomCarColor(rng) {
  return CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
}

// Build a car about 4.4 long, 2 wide, facing +Z when heading is 0.
export function makeCar(color, police = false) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c1e24 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fc4e8, emissive: 0x223344 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 4.4), bodyMat);
  body.position.y = 0.55; body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), glassMat);
  cabin.position.set(0, 1.15, -0.2); cabin.castShadow = true;
  group.add(cabin);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.18, 4.42), darkMat);
  trim.position.y = 0.32;
  group.add(trim);
  // Headlights and taillights.
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffe9a0 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xff2a2a, emissive: 0x881111 });
  for (const s of [-0.65, 0.65]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), headMat);
    head.position.set(s, 0.6, 2.21);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tailMat);
    tail.position.set(s, 0.6, -2.21);
    group.add(tail);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14151a });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.38, z);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  let lightBar = null;
  if (police) {
    // Police livery: white body with a black hood stripe and a light bar.
    bodyMat.color.set(0xf2f2f2);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.1, 1.2), darkMat);
    stripe.position.set(0, 0.9, 1.2);
    group.add(stripe);
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3),
      new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xcc0000 }));
    red.position.x = -0.35;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0022cc }));
    blue.position.x = 0.35;
    lightBar.add(red); lightBar.add(blue);
    lightBar.position.set(0, 1.55, -0.2);
    group.add(lightBar);
    group.userData.lightBar = lightBar;
  }
  group.userData.wheels = wheels;
  return group;
}

// Arcade car state. `heading` is radians, 0 = facing +Z... forward is -Z in
// three.js terms, so the group is rotated by heading and moved along it.
export class Car {
  constructor(group, x, z, heading) {
    this.group = group;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.maxSpeed = 38;
    this.maxReverse = 12;
    this.accel = 16;
    this.brake = 34;
    this.radius = 2.3;
    this.health = 100;
    this.smoking = false;
  }

  // throttle -1..1, steerInput -1..1, handbrake bool.
  drive(dt, throttle, steerInput, handbrake, colliders) {
    const targetSteer = steerInput * 0.55;
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);
    if (throttle > 0) {
      this.speed += this.accel * throttle * dt;
    } else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= this.brake * dt;
      else this.speed += this.accel * 0.6 * throttle * dt;
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 10 * dt);
    }
    if (handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 26 * dt);
    this.speed = Math.max(-this.maxReverse, Math.min(this.maxSpeed, this.speed));
    if (Math.abs(this.speed) > 0.05) {
      // Steering right (positive steer) turns the heading down: with forward
      // (sin h, 0, cos h), a smaller h points toward the camera's right.
      const dir = this.speed >= 0 ? 1 : -1;
      this.heading -= this.steer * dir * (Math.abs(this.speed) / 14) * dt * 1.6;
    }
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    const before = { x: this.pos.x, z: this.pos.z };
    this.pos.x = nx; this.pos.z = nz;
    if (resolveCircle(this.pos, this.radius, colliders)) {
      // Hit a building: lose speed and stop dead into the wall.
      const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
      const wanted = Math.abs(this.speed) * dt;
      if (wanted > 0.01 && moved < wanted * 0.5) this.speed *= 0.35;
    }
    this.pos.x = Math.max(WORLD.minX, Math.min(WORLD.maxX, this.pos.x));
    this.pos.z = Math.max(WORLD.minZ, Math.min(WORLD.maxZ, this.pos.z));
    this.sync();
  }

  // Push this car out of another circle (car-car collision): simple and soft.
  // Speeds blend instead of swapping, so a fast car keeps most of its speed
  // and shoves the slower car aside instead of stopping dead.
  collideWith(other) {
    const dx = this.pos.x - other.pos.x;
    const dz = this.pos.z - other.pos.z;
    const d = Math.hypot(dx, dz);
    const min = this.radius + other.radius;
    if (d > 0.01 && d < min) {
      const push = (min - d) / 2;
      const nx = dx / d; const nz = dz / d;
      this.pos.x += nx * push; this.pos.z += nz * push;
      other.pos.x -= nx * push; other.pos.z -= nz * push;
      const s = this.speed;
      this.speed = this.speed * 0.7 + other.speed * 0.3;
      other.speed = other.speed * 0.7 + s * 0.3;
      return true;
    }
    return false;
  }

  sync() {
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.heading;
    const spin = this.speed * 0.016;
    for (const w of this.group.userData.wheels) w.rotation.x += spin;
  }
}
