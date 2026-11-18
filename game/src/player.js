// The player on foot: a low-poly person (boxes for torso, head, limbs) with
// a walk swing, WASD movement relative to the camera, jumping, and getting
// in and out of cars. Heading uses the same convention as the cars:
// forward is (sin h, 0, cos h), and turning right lowers h.
import * as THREE from 'three';
import { resolveCircle, WORLD } from './city.js';

const SHIRTS = [0xe84a5f, 0x3fa7d6, 0x59a96a, 0xe8a33d, 0x7a5fd0];

export function makePerson(shirtColor) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2e3a55 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x2b2118 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), shirt);
  torso.position.y = 1.12; torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
  head.position.y = 1.72; head.castShadow = true;
  group.add(head);
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.42), hair);
  hairTop.position.y = 1.95;
  group.add(hairTop);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.26), pants);
  legL.position.set(-0.16, 0.36, 0); legL.castShadow = true;
  const legR = legL.clone(); legR.position.x = 0.16;
  group.add(legL); group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.2), shirt);
  armL.position.set(-0.42, 1.14, 0); armL.castShadow = true;
  const armR = armL.clone(); armR.position.x = 0.42;
  group.add(armL); group.add(armR);
  group.userData = { legL, legR, armL, armR, torso };
  return group;
}

export class Player {
  constructor(scene, rng) {
    this.group = makePerson(SHIRTS[Math.floor(rng() * SHIRTS.length)]);
    scene.add(this.group);
    this.pos = new THREE.Vector3(0, 0, 30);
    this.heading = 0;
    this.velY = 0;
    this.onGround = true;
    this.walkPhase = 0;
    this.speed = 0;
    this.health = 100;
    this.cash = 0;
    this.radius = 0.55;
  }

  // Move on foot. `yaw` is the camera yaw; forward is W relative to it.
  // Returns the horizontal speed for the HUD and engine sound.
  step(dt, axes, yaw, running, jump, colliders) {
    const moveSpeed = running ? 9.5 : 5.2;
    const fx = Math.sin(yaw); const fz = Math.cos(yaw);
    // Camera right for a camera looking along (sin yaw, 0, cos yaw) is
    // (-cos yaw, 0, sin yaw).
    const rx = -Math.cos(yaw); const rz = Math.sin(yaw);
    let mx = fx * axes.forward + rx * axes.right;
    let mz = fz * axes.forward + rz * axes.right;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len; mz /= len;
      this.heading = Math.atan2(mx, mz);
      this.speed = moveSpeed;
      this.walkPhase += dt * (running ? 13 : 9);
    } else {
      this.speed = 0;
      this.walkPhase += dt * 2;
    }
    this.pos.x += mx * this.speed * dt;
    this.pos.z += mz * this.speed * dt;
    if (jump && this.onGround) {
      this.velY = 7.5;
      this.onGround = false;
    }
    this.velY -= 22 * dt;
    this.pos.y += this.velY * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.velY = 0; this.onGround = true; }
    resolveCircle(this.pos, this.radius, colliders);
    this.pos.x = Math.max(WORLD.minX, Math.min(WORLD.maxX, this.pos.x));
    this.pos.z = Math.max(WORLD.minZ, Math.min(WORLD.maxZ, this.pos.z));
    // Walk swing.
    const swing = this.speed > 0.1 ? Math.sin(this.walkPhase) * 0.55 : 0;
    const u = this.group.userData;
    u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.8; u.armR.rotation.x = swing * 0.8;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    return this.speed;
  }

  // Lose health; returns true when the player is wasted (health hits 0).
  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  }

  heal(amount) {
    this.health = Math.min(100, this.health + amount);
  }

  place(x, z, heading = 0) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.velY = 0;
    this.group.position.copy(this.pos);
    this.group.rotation.y = heading;
  }
}
