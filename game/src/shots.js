// Staged screenshot scenes for Neon Bay (?shot=drive|foot|chase|mission).
// Each one poses the real game — a car on a road, a player on a sidewalk, a
// police chase, a mission run — then lets the normal simulation play it
// forward with a lane-keeping autopilot, so the frame is what the game
// really looks like. Deterministic: the city and traffic are seeded.
import { nearestRoadPoint } from './city.js';

export function parseShot() {
  const q = new URLSearchParams(window.location.search);
  return q.get('shot');
}

// Lane-keeping autopilot for the player's car: stay on the road it is on,
// steering toward the lane centre and the road's direction. `others` are
// cars to overtake: one directly ahead in our lane makes us swing to the
// other side of the road to pass it. `baseHeading` pins the travel
// direction (a staged shot's road), so a knock sideways cannot make the
// car lock onto a cross street instead. `laneOffset` holds a fixed lane
// (a pacing cruiser sits in the left or right lane, not the centre).
export function autopilotDrive(car, dt, target, others, baseHeading, laneOffset = 0) {
  const h = car.heading;
  const near = nearestRoadPoint(car.pos.x, car.pos.z);
  let desired;
  let lateral = 0;
  if (baseHeading !== undefined) {
    desired = baseHeading;
    if (Math.abs(Math.cos(baseHeading)) >= Math.abs(Math.sin(baseHeading))) {
      if (near.axis === 'z') lateral = car.pos.x - near.x;
    } else if (near.axis === 'x') lateral = car.pos.z - near.z;
  } else if (Math.abs(Math.cos(h)) >= Math.abs(Math.sin(h))) {
    // Travelling along z: keep x on the nearest road line.
    desired = Math.cos(h) >= 0 ? 0 : Math.PI;
    if (near.axis === 'z') lateral = car.pos.x - near.x;
  } else {
    desired = Math.sin(h) >= 0 ? Math.PI / 2 : -Math.PI / 2;
    if (near.axis === 'x') lateral = car.pos.z - near.z;
  }
  // Overtake: a car right ahead in our lane means shift to the other side.
  let laneShift = 0;
  if (others) {
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const rx = -Math.cos(h);
    const rz = Math.sin(h);
    for (const o of others) {
      if (o === car) continue;
      const dx = o.pos.x - car.pos.x;
      const dz = o.pos.z - car.pos.z;
      const ahead = dx * fx + dz * fz;
      const side = dx * rx + dz * rz;
      if (ahead > 4 && ahead < 16 && Math.abs(side) < 4.5) {
        laneShift = side >= 0 ? -3 : 3;
        break;
      }
    }
  }
  // Steer toward the road centre with a lookahead: aim a little toward the
  // centre line (or the passing lane, when overtaking) when off it, so the
  // car converges smoothly instead of fishtailing at speed. Note the sign:
  // drive() turns the heading DOWN for a positive steer, so steering toward
  // an aim means steer = (heading - aim), not (aim - heading).
  const aim = desired + Math.max(-0.5, Math.min(0.5, -(lateral - laneShift - laneOffset) * 0.08));
  let diff = car.heading - aim;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  let steer = Math.max(-1, Math.min(1, diff * 1.5));
  // If a mission target is near, bend toward it (same sign as above:
  // steering toward a heading means steer = heading - want).
  if (target) {
    const dx = target.x - car.pos.x;
    const dz = target.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 140 && dist > 10) {
      const want = Math.atan2(dx, dz);
      let d2 = car.heading - want;
      while (d2 > Math.PI) d2 -= Math.PI * 2;
      while (d2 < -Math.PI) d2 += Math.PI * 2;
      steer = Math.max(-1, Math.min(1, steer * 0.4 + d2 * 1.2));
    }
  }
  return { throttle: 0.75, steer, handbrake: false };
}

export function stageShot(name, G) {
  const P = G.player;
  const T = G.traffic;
  const M = G.missions;
  G.mode = 'playing';
  G.autopilot = false;
  G.cameraYaw = Math.PI;
  G.cameraPitch = 0.32;
  G.cameraDist = 10;

  if (name === 'foot') {
    // On foot at a corner, traffic and pedestrians crossing behind.
    P.place(-52, -52, -Math.PI * 0.75);
    G.setInCar(null);
    G.cameraYaw = -Math.PI * 0.75;
    T.spawnAll(P.pos.x, P.pos.z);
    M.hideMarker();
    M.customObjective = 'Neon Bay — on foot. Press E to steal a car.';
    return 'foot';
  }

  if (name === 'chase') {
    // A three-star chase, shot as a rear view: the camera rides ahead of
    // the fleeing car and looks back at it, so the two cruisers on its tail
    // are in the frame. The road ahead is cleared so the player is moving
    // fast; the camera is locked so it never swings back behind the car.
    const car = G.takeCarAt(0, -60, 0);
    G.setInCar(car);
    car.speed = 24;
    car.maxSpeed = 30;
    G.police.addHeat(250);
    // Cruisers a touch slower than the player: they stay on the tail for
    // the whole shot instead of catching up and pinning the car to a wall.
    // They pace the player's road (south) instead of cutting across blocks.
    G.police.pursuitSpeed = 26;
    G.police.paceAll = true;
    G.police.paceHeading = 0;
    const p1 = G.police.spawnPolice(0, -90);
    p1.pos.set(3, 0, -82); p1.heading = 0; p1.speed = 26;
    const p2 = G.police.spawnPolice(0, -30);
    p2.pos.set(-3, 0, -86); p2.heading = 0; p2.speed = 26;
    G.cameraYaw = Math.PI;
    G.cameraPitch = 0.28;
    G.cameraDist = 13;
    G.cameraLock = true;
    G.autopilot = true;
    G.autopilotHeading = 0;
    T.spawnAll(0, -60);
    // Clear the lane ahead so the chase reads as speed, not a traffic jam.
    for (const c of [...T.cars]) {
      if (Math.abs(c.pos.x) < 8 && c.pos.z > -60 && c.pos.z < 100) T.removeCar(c);
    }
    M.hideMarker();
    M.customObjective = 'Lose the cops — 3 stars! Hide to cool off.';
    return 'chase';
  }

  if (name === 'mission') {
    // Mission two in its delivery leg: the package run, beacon ahead on
    // the warehouse road, the player driving for it.
    M.index = 1;
    M.active = true;
    M.stage = 'deliver';
    M.timer = 150;
    M.target = { x: 60, z: -240 };
    M.showMarker();
    M.say(['LENA: Package in the car. Warehouse, north end. Do not stop.']);
    const car = G.takeCarAt(60, -40, Math.PI);
    G.setInCar(car);
    car.speed = 20;
    car.maxSpeed = 26;
    G.cameraYaw = Math.PI;
    G.autopilot = true;
    G.autopilotHeading = Math.PI;
    G.autopilotTarget = { x: 60, z: -240 };
    T.spawnAll(60, -40);
    return 'mission';
  }

  // Default: 'drive', the cover. Cruising down the main drag in a stolen
  // coupe, HUD and minimap up, traffic ahead. Starts north of the city
  // centre so the frame stays among the buildings.
  const car = G.takeCarAt(0, -100, 0);
  G.setInCar(car);
  car.speed = 22;
  car.maxSpeed = 26;
  G.cameraYaw = 0;
  G.autopilot = true;
  G.autopilotHeading = 0;
  T.spawnAll(0, -100);
  M.hideMarker();
  M.customObjective = 'Neon Bay — free roam. Steal cars, run jobs, outrun the cops.';
  return 'drive';
}
