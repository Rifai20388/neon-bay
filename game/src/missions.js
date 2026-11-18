// Lena's jobs for Jax: three missions with a beginning, a middle and a
// payout. A mission is a list of legs; each leg is either "reach this
// spot", "get in a car" or "lose the cops". The beacon marks the spot.
import * as THREE from 'three';
import { addHeat } from './police.js';
import { dist2D } from './util.js';

export const MISSIONS = [
  {
    name: 'The Getaway',
    reward: 150,
    timeLimit: 120,
    intro: 'Lena: "Jax, the Palms need a driver. Grab a car and meet me at the plaza."',
    complete: 'Lena: "Clean. Here is your cut — $150. The Palms remember drivers like you."',
    legs: [
      { kind: 'car', label: 'Steal a car' },
      { kind: 'spot', x: 20, z: -20, label: 'Drive to the plaza' },
    ],
  },
  {
    name: 'Package Run',
    reward: 300,
    timeLimit: 150,
    intro: 'Lena: "A package is waiting at the docks. Bring it to Bay Tower — fast, and don\'t let the cops see you."',
    complete: 'Lena: "Delivered. $300, and the Palms owe you one."',
    legs: [
      { kind: 'spot', x: 140, z: 186, label: 'Pick up the package at the docks', heat: 10 },
      { kind: 'spot', x: 20, z: -20, label: 'Deliver the package to Bay Tower' },
    ],
  },
  {
    name: 'Lay Low',
    reward: 500,
    timeLimit: 180,
    intro: 'Lena: "One last job, Jax. The cops are all over you — shake them, then reach the safehouse."',
    complete: 'Lena: "You vanished like smoke. $500. You are one of us now."',
    legs: [
      { kind: 'hide', label: 'Lose the cops — hide until the heat dies' },
      { kind: 'spot', x: -140, z: -100, label: 'Reach the safehouse' },
    ],
  },
];

export function createMissionMarker(scene) {
  const group = new THREE.Group();
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd24a,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  beacon.position.y = 30;
  group.add(beacon);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color: 0xffd24a }),
  );
  diamond.position.y = 9;
  group.add(diamond);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  group.add(ring);
  group.visible = false;
  scene.add(group);
  return { group, diamond, ring };
}

function currentLeg(G) {
  const m = MISSIONS[G.missionIndex];
  if (!m || G.missionLeg >= m.legs.length) return null;
  return m.legs[G.missionLeg];
}

export function missionObjectiveLabel(G) {
  if (G.missionIndex >= MISSIONS.length) return 'Free roam — all jobs done. The city is yours.';
  const m = MISSIONS[G.missionIndex];
  if (G.breather > 0) return 'Take a breath — Lena will call with the next job.';
  const leg = currentLeg(G);
  if (!leg) return m.name;
  return `${m.name} — ${leg.label}`;
}

export function startMission(G, index) {
  const m = MISSIONS[index];
  if (!m) {
    G.missionActive = false;
    G.marker.group.visible = false;
    return;
  }
  G.missionIndex = index;
  G.missionLeg = 0;
  G.missionTime = m.timeLimit;
  G.missionActive = true;
  G.breather = 0;
  G.subtitle = m.intro;
  G.subtitleTimer = 6;
  if (index === 2) addHeat(G, 60);
  placeMarker(G);
}

function placeMarker(G) {
  const leg = currentLeg(G);
  if (!leg || leg.kind !== 'spot') {
    G.marker.group.visible = false;
    return;
  }
  G.marker.group.position.set(leg.x, 0, leg.z);
  G.marker.group.visible = true;
}

function completeLeg(G) {
  const m = MISSIONS[G.missionIndex];
  const leg = currentLeg(G);
  if (leg && leg.heat) addHeat(G, leg.heat);
  G.missionLeg += 1;
  G.audio.blip();
  if (G.missionLeg >= m.legs.length) {
    // Mission done: pay out and rest before the next job.
    G.player.cash += m.reward;
    G.subtitle = m.complete;
    G.subtitleTimer = 6;
    G.audio.sting();
    G.missionActive = false;
    G.missionIndex += 1;
    G.marker.group.visible = false;
    G.breather = 8;
    G.saveSoon = true;
  } else {
    placeMarker(G);
  }
}

export function updateMissions(G, dt) {
  // Spin and bob the marker diamond.
  if (G.marker.group.visible) {
    G.marker.diamond.rotation.y += dt * 1.6;
    G.marker.diamond.position.y = 9 + Math.sin(G.time * 2.2) * 0.8;
    const s = 1 + Math.sin(G.time * 3) * 0.08;
    G.marker.ring.scale.set(s, s, 1);
  }

  if (G.breather > 0) {
    G.breather -= dt;
    if (G.breather <= 0) {
      if (G.missionRestart) {
        // A failed job restarts; a finished job moves to the next one.
        G.missionRestart = false;
        startMission(G, G.missionIndex);
      } else if (G.missionIndex < MISSIONS.length) {
        startMission(G, G.missionIndex);
      }
    }
    return;
  }
  if (!G.missionActive) return;

  G.missionTime -= dt;
  if (G.missionTime <= 0) {
    failMission(G, 'Out of time — the job slipped away.');
    return;
  }
  const leg = currentLeg(G);
  if (!leg) return;
  if (leg.kind === 'car') {
    if (G.player.car) completeLeg(G);
  } else if (leg.kind === 'hide') {
    if (G.wanted === 0) completeLeg(G);
  } else if (leg.kind === 'spot') {
    if (dist2D(G.player.x, G.player.z, leg.x, leg.z) < 8) completeLeg(G);
  }
}

function failMission(G, why) {
  G.subtitle = `Lena: "${why} I will give you another shot."`;
  G.subtitleTimer = 6;
  G.audio.fail();
  G.missionActive = false;
  G.marker.group.visible = false;
  G.breather = 5;
  // The same job restarts after the breather.
  G.missionRestart = true;
}
