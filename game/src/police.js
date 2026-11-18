// Wanted level and the Neon Bay police. Heat is the 0-100 score behind the
// stars; crimes add it, hiding bleeds it off. Cruisers drive the road grid
// toward the player and ram; sit still next to one for too long and you are
// busted.
import { makeCar, randomCarColor } from './vehicles.js';
import { clamp, dist2D, pushCircleOutOfBox } from './util.js';
import { ROAD_CENTERS, CITY_EDGE } from './city.js';

export function starsFromHeat(heat) {
  if (heat <= 0) return 0;
  return clamp(Math.ceil(heat / 20), 1, 5);
}

export function addHeat(G, n) {
  G.heat = clamp(G.heat + n, 0, 100);
  G.wanted = starsFromHeat(G.heat);
}

function nearestNode(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const nx of ROAD_CENTERS) {
    for (const nz of ROAD_CENTERS) {
      const d = (nx - x) * (nx - x) + (nz - z) * (nz - z);
      if (d < bestD) {
        bestD = d;
        best = { x: nx, z: nz };
      }
    }
  }
  return best;
}

function spawnCruiser(G) {
  // Appear on a road 70-110 away from the player.
  let x = 0;
  let z = 0;
  for (let tries = 0; tries < 12; tries++) {
    const node = G.rng.pick(G.city.nodes);
    const d = dist2D(node.x, node.z, G.player.x, G.player.z);
    if (d > 70 && d < 115) {
      x = node.x;
      z = node.z;
      break;
    }
    x = node.x;
    z = node.z;
  }
  const car = makeCar(x, z, 0, 0x1a1d24, true);
  // White doors read as a cruiser at a glance.
  car.mesh.children[0].material = car.mesh.children[0].material.clone();
  car.mesh.children[0].material.color.setHex(0xe8e8e8);
  car.roadAxis = 'x';
  car.roadCoord = x;
  car.dir = 1;
  car.cruise = 26;
  car.hp = 100;
  car.leaving = false;
  car.targetNode = nearestNode(G.player.x, G.player.z);
  car.ramCooldown = 0;
  car.touchTimer = 0;
  G.scene.add(car.mesh);
  return car;
}

export function updatePolice(G, dt) {
  const wanted = G.wanted;
  G.audio.siren(wanted > 0);

  // Keep the right number of cruisers on the street.
  while (G.cruisers.length < wanted) G.cruisers.push(spawnCruiser(G));
  if (wanted === 0) {
    for (const c of G.cruisers) c.leaving = true;
  }

  const px = G.player.x;
  const pz = G.player.z;
  let nearestCruiser = Infinity;

  for (const cruiser of [...G.cruisers]) {
    const d = dist2D(cruiser.x, cruiser.z, px, pz);
    nearestCruiser = Math.min(nearestCruiser, d);
    cruiser.ramCooldown = Math.max(0, cruiser.ramCooldown - dt);

    if (cruiser.leaving) {
      // Drive away from the player and despawn once far off.
      cruiser.heading = Math.atan2(cruiser.x - px, -(cruiser.z - pz));
      cruiser.speed = Math.min(30, cruiser.speed + 12 * dt);
      cruiser.x += Math.sin(cruiser.heading) * cruiser.speed * dt;
      cruiser.z -= Math.cos(cruiser.heading) * cruiser.speed * dt;
      if (d > 170) {
        G.scene.remove(cruiser.mesh);
        G.cruisers.splice(G.cruisers.indexOf(cruiser), 1);
      }
      cruiser.mesh.position.set(cruiser.x, 0, cruiser.z);
      cruiser.mesh.rotation.y = cruiser.heading;
      continue;
    }

    if (cruiser.hp <= 0) {
      // Disabled cruiser: smoke, stop, then get towed away.
      cruiser.speed = Math.max(0, cruiser.speed - 10 * dt);
      cruiser.mesh.position.set(cruiser.x, 0, cruiser.z);
      cruiser.disabledTimer = (cruiser.disabledTimer || 0) + dt;
      if (cruiser.disabledTimer > 4) {
        G.scene.remove(cruiser.mesh);
        G.cruisers.splice(G.cruisers.indexOf(cruiser), 1);
      }
      continue;
    }

    if (d < 26) {
      // Close pursuit: steer straight at the player.
      const wantHeading = Math.atan2(px - cruiser.x, -(pz - cruiser.z));
      let diff = wantHeading - cruiser.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cruiser.heading += clamp(diff, -1.9 * dt, 1.9 * dt);
      cruiser.speed = Math.min(cruiser.cruise + 6, cruiser.speed + 14 * dt);
    } else {
      // Road pursuit: hop between intersections, always toward the player.
      const along = cruiser.roadAxis === 'x' ? cruiser.z : cruiser.x;
      const target = cruiser.targetNode
        ? cruiser.roadAxis === 'x'
          ? cruiser.targetNode.z
          : cruiser.targetNode.x
        : along;
      const arrived = Math.abs(along - target) < 3;
      if (arrived) {
        const node = nearestNode(px, pz);
        // From here, pick the neighbouring intersection closest to the player.
        const here = {
          x: cruiser.roadAxis === 'x' ? cruiser.roadCoord : target,
          z: cruiser.roadAxis === 'x' ? target : cruiser.roadCoord,
        };
        const options = [];
        for (const [nx, nz] of [
          [here.x + 40, here.z],
          [here.x - 40, here.z],
          [here.x, here.z + 40],
          [here.x, here.z - 40],
        ]) {
          if (Math.abs(nx) > CITY_EDGE || Math.abs(nz) > CITY_EDGE) continue;
          options.push({ x: nx, z: nz, d: dist2D(nx, nz, node.x, node.z) });
        }
        options.sort((a, b) => a.d - b.d);
        const pick = options[0] || node;
        if (pick.x !== here.x) {
          cruiser.roadAxis = 'z';
          cruiser.roadCoord = pick.z;
          cruiser.dir = pick.x > here.x ? 1 : -1;
        } else {
          cruiser.roadAxis = 'x';
          cruiser.roadCoord = pick.x;
          cruiser.dir = pick.z > here.z ? 1 : -1;
        }
        cruiser.targetNode = pick;
      }
      cruiser.speed = Math.min(cruiser.cruise, cruiser.speed + 12 * dt);
      if (cruiser.roadAxis === 'x') {
        cruiser.z += cruiser.dir * cruiser.speed * dt;
        cruiser.x += (cruiser.roadCoord - cruiser.x) * Math.min(1, dt * 3);
        cruiser.heading = cruiser.dir > 0 ? Math.PI : 0;
      } else {
        cruiser.x += cruiser.dir * cruiser.speed * dt;
        cruiser.z += (cruiser.roadCoord - cruiser.z) * Math.min(1, dt * 3);
        cruiser.heading = cruiser.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }

    if (d >= 26) {
      cruiser.x += Math.sin(cruiser.heading) * cruiser.speed * dt;
      cruiser.z -= Math.cos(cruiser.heading) * cruiser.speed * dt;
    }

    // Keep cruisers out of buildings.
    const out = { x: cruiser.x, z: cruiser.z };
    for (const box of G.city.colliders) {
      if (Math.abs(cruiser.x - (box.minX + box.maxX) / 2) > 30 || Math.abs(cruiser.z - (box.minZ + box.maxZ) / 2) > 30) continue;
      if (pushCircleOutOfBox(cruiser.x, cruiser.z, 1.9, box, out)) {
        cruiser.x = out.x;
        cruiser.z = out.z;
        cruiser.speed *= 0.7;
      }
    }

    // Ram: shove the player's car and hurt Jax on a hard hit.
    if (d < 3.4 && cruiser.ramCooldown <= 0) {
      cruiser.ramCooldown = 0.9;
      const push = 9;
      const dx = px - cruiser.x;
      const dz = pz - cruiser.z;
      const len = Math.max(0.1, Math.hypot(dx, dz));
      if (G.player.car) {
        G.player.car.x += (dx / len) * push * 0.35;
        G.player.car.z += (dz / len) * push * 0.35;
        G.player.car.speed *= 0.8;
      } else {
        G.player.x += (dx / len) * 2.2;
        G.player.z += (dz / len) * 2.2;
      }
      if (Math.abs(cruiser.speed) > 8) {
        G.player.health -= 4;
        G.audio.thud();
        G.hudFlash = 0.25;
      }
      cruiser.speed *= 0.6;
    }

    // Busted: a cruiser sits on a slow player for 2.5 seconds.
    const playerSpeed = G.player.car ? Math.abs(G.player.car.speed) : G.player.moving ? 3.5 : 0;
    if (d < 7 && playerSpeed < 2.5) {
      cruiser.touchTimer += dt;
      if (cruiser.touchTimer > 2.5) {
        G.events.push({ type: 'busted' });
        cruiser.touchTimer = 0;
      }
    } else {
      cruiser.touchTimer = 0;
    }

    // Flash the light bar.
    if (cruiser.lightBar) {
      const phase = Math.floor(G.time * 3.2) % 2 === 0;
      cruiser.lightBar.red.visible = phase;
      cruiser.lightBar.blue.visible = !phase;
    }
    cruiser.mesh.position.set(cruiser.x, 0, cruiser.z);
    cruiser.mesh.rotation.y = cruiser.heading;
    const spin = (cruiser.speed * dt) / 0.38;
    for (const w of cruiser.wheels) w.rotation.x += spin;
  }

  // Heat bleeds off when no cruiser is anywhere near.
  if (wanted > 0 && nearestCruiser > 45) {
    G.heatTimer = (G.heatTimer || 0) + dt;
    if (G.heatTimer > 3) {
      G.heat = Math.max(0, G.heat - (nearestCruiser > 80 ? 12 : 7) * dt);
      G.wanted = starsFromHeat(G.heat);
    }
  } else {
    G.heatTimer = 0;
  }
}
