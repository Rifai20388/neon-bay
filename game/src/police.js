// The wanted system and the Neon Bay police. Crimes raise the wanted level;
// police cars spawn, chase and ram the player; laying low lets the heat die
// down, and getting caught means a bust: lost cash and a trip to the station.
import * as THREE from 'three';
import { makeCar, Car, randomCarColor } from './vehicles.js';
import { mulberry32, range } from './rng.js';
import { autopilotDrive } from './shots.js';

export class Police {
  constructor(scene, traffic, colliders) {
    this.scene = scene;
    this.traffic = traffic;
    this.colliders = colliders;
    this.rng = mulberry32(4242);
    this.wanted = 0;
    this.heat = 0; // 0..100 toward the next star, decays when quiet.
    this.cars = [];
    this.bustedTimer = 0;
    this.busted = false;
    this.wasted = false;
    this.sirenTime = 0;
  }

  // A crime: stealing a car, hitting a pedestrian, shooting. Heat 1-99 is
  // one star, 100-199 two, up to five stars at 400+.
  addHeat(amount) {
    this.heat = Math.min(500, this.heat + amount);
    this.wanted = this.heat <= 0 ? 0 : Math.min(5, Math.floor(this.heat / 100) + 1);
  }

  clearWanted() {
    this.wanted = 0;
    this.heat = 0;
    this.bustedTimer = 0;
  }

  wantedCount() {
    return this.wanted;
  }

  spawnPolice(px, pz) {
    const r = this.rng;
    let x;
    let z;
    if (this.paceAll) {
      // A staged pursuit: every cruiser starts on the player's road, just
      // behind them, staggered across the lanes, heading the same way.
      const lane = this.cars.length % 2 === 0 ? 3 : -3;
      x = Math.max(-280, Math.min(280, px + lane));
      z = Math.max(-280, Math.min(280, pz - 25 - this.cars.length * 8));
    } else {
      const angle = r() * Math.PI * 2;
      const dist = range(r, 55, 80);
      x = Math.max(-280, Math.min(280, px + Math.cos(angle) * dist));
      z = Math.max(-280, Math.min(280, pz + Math.sin(angle) * dist));
    }
    const group = makeCar(0xf2f2f2, true);
    this.scene.add(group);
    const car = new Car(group, x, z, 0);
    // pursuitSpeed, when set, caps every cruiser (a staged chase can keep
    // the pursuit just behind the player instead of ramming it off the road).
    car.maxSpeed = this.pursuitSpeed ?? (30 + this.wanted * 2.2);
    car.kind = 'police';
    car.health = 100;
    car.pace = !!this.paceAll;
    // Pacing cruisers hold opposite lanes, so a pursuit reads as a line of
    // cars instead of one car hiding the next.
    car.laneOffset = this.paceAll ? (this.cars.length % 2 === 0 ? 3 : -3) : 0;
    this.cars.push(car);
    return car;
  }

  step(dt, playerPos, playerSpeed, inCar, playerHealth) {
    // Keep one police car per wanted star (at most 3 on screen).
    const want = Math.min(3, this.wanted);
    while (this.cars.length < want) this.spawnPolice(playerPos.x, playerPos.z);
    while (this.cars.length > want) {
      const car = this.cars.pop();
      this.scene.remove(car.group);
    }
    // Heat decays only while no police car is close.
    let nearest = Infinity;
    for (const car of this.cars) {
      nearest = Math.min(nearest, Math.hypot(car.pos.x - playerPos.x, car.pos.z - playerPos.z));
    }
    if (this.wanted > 0 && nearest > 70) {
      this.heat = Math.max(0, this.heat - dt * 7);
      this.wanted = this.heat <= 0 ? 0 : Math.min(5, Math.floor(this.heat / 100) + 1);
    }
    // Chase: steer toward the player, ram on contact, back off and retry.
    // A pacing cruiser instead holds its lane and follows the player's road,
    // so a staged pursuit stays in frame instead of cutting across blocks.
    for (const car of this.cars) {
      const dx = playerPos.x - car.pos.x;
      const dz = playerPos.z - car.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      if (car.pace) {
        const cmd = autopilotDrive(car, dt, null, this.traffic.cars, this.paceHeading ?? 0, car.laneOffset ?? 0);
        car.drive(dt, cmd.throttle, cmd.steer, false, this.colliders);
      } else {
        const targetHeading = Math.atan2(dx, dz);
        let diff = targetHeading - car.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const steer = Math.max(-1, Math.min(1, diff * 1.5));
        const throttle = dist > 8 ? 1 : 0.4;
        car.drive(dt, throttle, steer, false, this.colliders);
      }
      // Ram: shove the player away from the cruiser and hurt them on a
      // hard hit, at most once every half second per police car. The shove
      // is scaled by dt so a long contact does not teleport the player.
      if (dist < car.radius + 2.4) {
        const push = (car.radius + 2.4 - dist) * 3 * dt;
        playerPos.x += (dx / dist) * push;
        playerPos.z += (dz / dist) * push;
        car.ramCooldown = (car.ramCooldown || 0) - dt;
        if (Math.abs(car.speed) > 8 && car.ramCooldown <= 0) {
          playerHealth.damage(8);
          car.ramCooldown = 0.5;
          car.speed *= 0.55;
        }
      }
      // Police light bar flashes.
      if (car.group.userData.lightBar) {
        car.group.userData.lightBar.visible = Math.floor(this.sirenTime * 4) % 2 === 0;
      }
      // Disabled police cars smoke and stop.
      if (car.health <= 0) {
        car.maxSpeed = 0;
        car.speed *= 0.9;
      }
      // Keep police inside the city and recycle the ones left far behind.
      if (dist > 260) {
        const a = this.rng() * Math.PI * 2;
        car.pos.x = playerPos.x + Math.cos(a) * 70;
        car.pos.z = playerPos.z + Math.sin(a) * 70;
      }
    }
    this.sirenTime += dt;
    // Busted: a police car sits on a slow player for a while.
    if (this.wanted > 0 && nearest < 7 && playerSpeed < 3 && !this.busted) {
      this.bustedTimer += dt;
      if (this.bustedTimer > 3) this.busted = true;
    } else {
      this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);
    }
    return this.busted;
  }

  // Called after a bust or a waste: clear the scene of police cars.
  reset() {
    for (const car of this.cars) this.scene.remove(car.group);
    this.cars = [];
    this.busted = false;
    this.wasted = false;
    this.bustedTimer = 0;
    this.clearWanted();
  }
}
