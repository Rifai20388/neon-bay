// Staged screenshot scenes for the entry's four images. A `?shot=N` URL
// parameter drops the player into a composed, living scene and, for the
// driving shots, hands the wheel to a small waypoint autopilot so the frame
// shows the game in motion. The game itself is unchanged — only the setup.
import { makeCar, randomCarColor } from './vehicles.js';
import { startMission } from './missions.js';
import { addHeat } from './police.js';
import { clamp, angleDiff } from './util.js';

export function shotFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const n = parseInt(params.get('shot') || '0', 10);
  return n >= 1 && n <= 4 ? n : 0;
}

// Waypoints the autopilot follows (road centres, in order).
const LOOPS = {
  1: [
    { x: 0, z: -60 },
    { x: 0, z: -140 },
    { x: 80, z: -140 },
    { x: 80, z: 60 },
    { x: -40, z: 60 },
    { x: -40, z: -60 },
  ],
  3: [
    { x: 0, z: 20 },
    { x: 0, z: -100 },
    { x: -80, z: -100 },
    { x: -80, z: 100 },
    { x: 40, z: 100 },
  ],
  4: [
    { x: 40, z: 80 },
    { x: 40, z: -20 },
    { x: 20, z: -20 },
  ],
};

export function applyShotSetup(G, n) {
  G.shot = n;
  G.mode = 'playing';
  G.hud.title.style.display = 'none';
  G.player.health = 100;
  G.player.cash = 0;

  if (n === 1) {
    // Cover: driving up the main avenue, HUD and minimap on.
    const car = makeCar(0, -60, 0, 0xd23b2e, false);
    G.scene.add(car.mesh);
    enterCar(G, car);
    G.autopilot = { waypoints: LOOPS[1], index: 0 };
    G.objectiveText = 'Neon Bay — free roam. Steal cars, run jobs, outrun the cops.';
  } else if (n === 2) {
    // On foot at a busy intersection, traffic and pedestrians around.
    G.player.x = 40;
    G.player.z = 40;
    G.player.heading = 0;
    G.player.camYaw = 0;
    G.player.mesh.position.set(40, 0, 40);
    G.objectiveText = 'Neon Bay — on foot. The city is yours to walk.';
    // A couple of extra cars rolling through the intersection.
    for (let i = 0; i < 3; i++) {
      const car = makeCar(40, -20 - i * 30, 0, randomCarColor(G.rng), false);
      car.roadAxis = 'x';
      car.roadCoord = 40;
      car.dir = 1;
      car.cruise = 10;
      car.speed = 10;
      G.scene.add(car.mesh);
      G.trafficCars.push(car);
    }
  } else if (n === 3) {
    // Police chase: three stars, two cruisers closing in from behind.
    const car = makeCar(0, 20, 0, 0xd23b2e, false);
    G.scene.add(car.mesh);
    enterCar(G, car);
    addHeat(G, 60);
    G.autopilot = { waypoints: LOOPS[3], index: 0 };
    G.objectiveText = 'Lose the cops — 3 stars! Hide to cool off.';
    G.subtitle = 'Lena: "Three stars, Jax. Lose them!"';
    G.subtitleTimer = 6;
    // Two cruisers already closing in head-on, so they read in the frame.
    for (const [x, z] of [
      [-4, 2],
      [5, -5],
    ]) {
      const cruiser = makeCar(x, z, Math.PI, 0x1a1d24, true);
      cruiser.mesh.children[0].material = cruiser.mesh.children[0].material.clone();
      cruiser.mesh.children[0].material.color.setHex(0xe8e8e8);
      cruiser.cruise = 30;
      cruiser.speed = 22;
      cruiser.hp = 100;
      cruiser.leaving = false;
      cruiser.targetNode = { x: 0, z: 0 };
      cruiser.ramCooldown = 0;
      cruiser.touchTimer = 0;
      G.scene.add(cruiser.mesh);
      G.cruisers.push(cruiser);
    }
  } else if (n === 4) {
    // Mission in progress: Package Run, driving toward Bay Tower.
    const car = makeCar(40, 80, 0, 0xd23b2e, false);
    G.scene.add(car.mesh);
    enterCar(G, car);
    G.missionIndex = 1;
    startMission(G, 1);
    // Jump straight to the delivery leg so the beacon shows at the tower.
    G.missionLeg = 1;
    G.missionTime = 120;
    G.marker.group.position.set(20, 0, -20);
    G.marker.group.visible = true;
    G.autopilot = { waypoints: LOOPS[4], index: 0 };
    G.subtitle = 'Lena: "Package in hand. Bay Tower — go!"';
    G.subtitleTimer = 6;
  }
}

export function enterCar(G, car) {
  // Take a traffic car off the street and make it the player's.
  const i = G.trafficCars.indexOf(car);
  if (i >= 0) G.trafficCars.splice(i, 1);
  G.player.car = car;
  G.player.mesh.visible = false;
  G.player.x = car.x;
  G.player.z = car.z;
}

export function exitCar(G) {
  const car = G.player.car;
  if (!car) return;
  G.player.car = null;
  G.player.x = car.x + 3.2;
  G.player.z = car.z + 1.5;
  G.player.y = 0;
  G.player.heading = car.heading;
  G.player.mesh.visible = true;
  G.player.mesh.position.set(G.player.x, 0, G.player.z);
  // The car stays parked where it was left and can be stolen again.
  G.trafficCars.push(car);
}

// The autopilot steers toward the next waypoint and eases off for traffic.
export function updateAutopilot(G, dt) {
  const auto = G.autopilot;
  const car = G.player.car;
  if (!auto || !car || G.mode !== 'playing') return;
  const wp = auto.waypoints[auto.index];
  const dx = wp.x - car.x;
  const dz = wp.z - car.z;
  const d = Math.hypot(dx, dz);
  if (d < 9) {
    auto.index = (auto.index + 1) % auto.waypoints.length;
    return;
  }
  const desired = Math.atan2(dx, -dz);
  const steer = clamp(angleDiff(car.heading, desired) * 2.2, -1, 1);
  let throttle = 0.85;
  if (Math.abs(car.speed) > 24) throttle = 0.15;
  // Ease off when a traffic car is right ahead.
  for (const other of G.trafficCars) {
    const ox = other.x - car.x;
    const oz = other.z - car.z;
    const forward = ox * Math.sin(car.heading) - oz * Math.cos(car.heading);
    const lateral = Math.abs(ox * Math.cos(car.heading) + oz * Math.sin(car.heading));
    if (forward > 0 && forward < 13 && lateral < 4) {
      throttle = 0;
      break;
    }
  }
  G.autoDrive = { throttle, steer, brake: false };
}
