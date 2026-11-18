// Neon Bay — main loop and wiring. This file owns the game context (G) and
// the frame: input actions, camera, modes (title / playing / paused /
// busted / wasted), saving, and the event queue the systems feed.
import * as THREE from 'three';
import { makeRng } from './rng.js';
import { buildCity } from './city.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { loadSave, storeSave, clearSave } from './save.js';
import { makePlayer, stepPlayer } from './player.js';
import { stepCar } from './vehicles.js';
import { createTraffic, updateTraffic, spawnPed } from './traffic.js';
import { updatePolice, addHeat, starsFromHeat } from './police.js';
import { createMissionMarker, startMission, updateMissions, missionObjectiveLabel, MISSIONS } from './missions.js';
import { createCombat, tryShoot, updateCombat, registerShootables } from './combat.js';
import { createHud, updateHud } from './hud.js';
import { shotFromUrl, applyShotSetup, enterCar, exitCar, updateAutopilot } from './shots.js';
import { clamp, dist2D } from './util.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc8e8);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

const G = {
  scene,
  camera,
  renderer,
  rng: makeRng(1337),
  time: 0,
  mode: 'title',
  events: [],
  heat: 0,
  wanted: 0,
  heatTimer: 0,
  shootCooldown: 0,
  hudFlash: 0,
  subtitle: '',
  subtitleTimer: 0,
  objectiveText: '',
  promptText: '',
  missionIndex: 0,
  missionLeg: 0,
  missionTime: 0,
  missionActive: false,
  missionRestart: false,
  breather: 0,
  saveSoon: false,
  saveTimer: 0,
  autopilot: null,
  autoDrive: null,
  shot: 0,
  camPos: new THREE.Vector3(0, 8, 60),
};

G.city = buildCity(scene);
G.input = createInput(canvas);
G.input.attach();
G.audio = createAudio();
G.hud = createHud();
G.combat = createCombat(scene);
G.marker = createMissionMarker(scene);
G.player = makePlayer(0, 40, 0);
G.player.cash = 0;
G.player.health = 100;
G.player.car = null;
scene.add(G.player.mesh);
createTraffic(G);
G.cruisers = [];

// Debug/test handle: lets a play-test (or a curious player) read the live
// state without touching the code. Harmless in normal play.
window.__NEON_BAY__ = G;

// --- camera helpers ---------------------------------------------------------
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  if (G.player.car) {
    const car = G.player.car;
    const fx = Math.sin(car.heading);
    const fz = -Math.cos(car.heading);
    camTarget.set(car.x - fx * 11, 4.6, car.z - fz * 11);
    G.camPos.lerp(camTarget, 1 - Math.exp(-dt * 4.5));
    camera.position.copy(G.camPos);
    camera.lookAt(car.x + fx * 9, 1.6, car.z + fz * 9);
  } else {
    const p = G.player;
    const yaw = p.camYaw;
    const pitch = p.camPitch;
    const dist = 7.5;
    const ox = -Math.sin(yaw) * Math.cos(pitch) * dist;
    const oz = Math.cos(yaw) * Math.cos(pitch) * dist;
    const oy = Math.sin(pitch) * dist + 1.2;
    camTarget.set(p.x + ox, p.y + oy, p.z + oz);
    G.camPos.lerp(camTarget, 1 - Math.exp(-dt * 9));
    camera.position.copy(G.camPos);
    camera.lookAt(p.x, p.y + 1.6, p.z);
  }
}

// --- entering / leaving cars -------------------------------------------------
function tryEnterCar() {
  let best = null;
  let bestD = 4.6;
  for (const car of G.trafficCars) {
    const d = dist2D(G.player.x, G.player.z, car.x, car.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  if (!best) return;
  enterCar(G, best);
  addHeat(G, 25);
  G.subtitle = 'You stole a car — the cops noticed.';
  G.subtitleTimer = 4;
  G.audio.blip();
  // The driver bails out and walks off.
  const driver = spawnPed(G, { x: best.x + 3, z: best.z + 2 });
  driver.fleeTimer = 4;
  driver.fleeFrom = { x: best.x, z: best.z };
  G.peds.push(driver);
}

function resetCar() {
  const car = G.player.car;
  if (!car) return;
  // Put the car back on the nearest road centre, facing along it.
  let best = 0;
  for (const c of G.city.roads) {
    if (Math.abs(c - car.x) < Math.abs(best - car.x)) best = c;
  }
  car.x = best;
  car.z = clamp(car.z, -160, 160);
  car.heading = 0;
  car.speed = 0;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = 0;
}

// --- busted / wasted ---------------------------------------------------------
function handleBusted() {
  const lost = Math.floor(G.player.cash * 0.15);
  G.player.cash -= lost;
  G.heat = 0;
  G.wanted = 0;
  G.audio.stopSiren();
  for (const c of G.cruisers) c.leaving = true;
  if (G.player.car) exitCar(G);
  G.player.x = G.city.station.x;
  G.player.z = G.city.station.z + 10;
  G.player.y = 0;
  G.player.health = 100;
  G.player.mesh.position.set(G.player.x, 0, G.player.z);
  G.mode = 'busted';
  G.hud.endTitle.textContent = 'BUSTED';
  G.hud.endText.textContent = `The cops caught you outside the station. You lost $${lost} — 15% of your cash.`;
  G.hud.end.style.display = 'flex';
  G.input.unlock();
  G.saveSoon = true;
}

function handleWasted() {
  const lost = Math.floor(G.player.cash * 0.2);
  G.player.cash -= lost;
  G.heat = 0;
  G.wanted = 0;
  G.audio.stopSiren();
  for (const c of G.cruisers) c.leaving = true;
  if (G.player.car) exitCar(G);
  G.player.x = G.city.hospital.x;
  G.player.z = G.city.hospital.z + 10;
  G.player.y = 0;
  G.player.health = 100;
  G.player.mesh.position.set(G.player.x, 0, G.player.z);
  G.mode = 'wasted';
  G.hud.endTitle.textContent = 'WASTED';
  G.hud.endText.textContent = `You woke up at the hospital, $200 lighter in spirit and $${lost} lighter in cash.`;
  G.hud.end.style.display = 'flex';
  G.input.unlock();
  G.saveSoon = true;
}

// --- saving ------------------------------------------------------------------
function saveNow() {
  storeSave({
    cash: G.player.cash,
    missionIndex: G.missionIndex,
    pos: { x: G.player.x, y: G.player.y, z: G.player.z },
    heading: G.player.heading,
    health: G.player.health,
  });
  G.saveSoon = false;
  G.saveTimer = 0;
}

// --- starting ----------------------------------------------------------------
function startGame(fromSave) {
  const save = fromSave ? loadSave() : null;
  if (save) {
    G.player.cash = save.cash;
    G.missionIndex = Math.min(save.missionIndex, MISSIONS.length - 1);
    G.player.x = save.pos[0];
    G.player.z = save.pos[2];
    G.player.y = 0;
    G.player.heading = save.heading;
    G.player.health = save.health;
    G.player.mesh.position.set(G.player.x, 0, G.player.z);
  } else {
    G.player.cash = 0;
    G.missionIndex = 0;
    G.player.health = 100;
    G.player.x = 0;
    G.player.z = 40;
    G.player.heading = 0;
    G.player.mesh.position.set(0, 0, 40);
  }
  G.heat = 0;
  G.wanted = 0;
  G.mode = 'playing';
  G.hud.title.style.display = 'none';
  G.hud.end.style.display = 'none';
  G.input.lock();
  G.audio.ensure();
  G.objectiveText = 'Neon Bay — free roam. Steal cars, run jobs, outrun the cops.';
  G.subtitle = 'Lena: "Jax! You are back. Steal a car and meet me at the plaza — the Palms have work."';
  G.subtitleTimer = 7;
  // First job starts after a short breather so the player can look around.
  G.breather = 6;
  G.missionActive = false;
  G.missionRestart = false;
}

function wireButtons() {
  const newBtn = document.getElementById('btn-new');
  const contBtn = document.getElementById('btn-continue');
  const resumeBtn = document.getElementById('btn-resume');
  const endBtn = document.getElementById('btn-end');
  const hasSave = !!loadSave();
  contBtn.style.display = hasSave ? 'inline-block' : 'none';
  newBtn.addEventListener('click', () => {
    clearSave();
    startGame(false);
  });
  contBtn.addEventListener('click', () => startGame(true));
  resumeBtn.addEventListener('click', () => {
    G.mode = 'playing';
    G.hud.pause.style.display = 'none';
    G.input.lock();
  });
  endBtn.addEventListener('click', () => {
    G.hud.end.style.display = 'none';
    G.mode = 'playing';
    G.input.lock();
  });
}

wireButtons();

// Screenshot staging bypasses the title screen entirely. No pointer lock
// here: there is no user gesture in a capture, and the shots do not need it.
const shot = shotFromUrl();
if (shot > 0) {
  applyShotSetup(G, shot);
} else {
  G.mode = 'title';
}

// --- the frame ---------------------------------------------------------------
const clock = new THREE.Clock();
let firstFrame = true;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;

  // Clouds always drift, even on the title screen.
  for (const cloud of G.city.clouds) {
    cloud.position.x += cloud.userData.drift * dt;
    if (cloud.position.x > 260) cloud.position.x = -260;
  }

  if (G.mode === 'playing') {
    const keys = G.input.keys;
    const mouse = G.input.takeMouse();
    G.player.camYaw += mouse.dx * 0.0032;
    G.player.camPitch = clamp(G.player.camPitch + mouse.dy * 0.0024, 0.06, 1.15);

    // One-shot actions.
    if (G.input.wasPressed('KeyP')) {
      G.mode = 'paused';
      G.hud.pause.style.display = 'flex';
      G.input.unlock();
      G.audio.engineOff();
      G.saveSoon = true;
    }
    if (G.input.wasPressed('KeyM')) {
      G.audio.setMuted(!G.audio.isMuted());
    }
    if (G.input.wasPressed('KeyE')) {
      if (G.player.car) exitCar(G);
      else tryEnterCar();
    }
    if (G.input.wasPressed('KeyR')) resetCar();
    if (G.input.takeClick() || G.input.wasPressed('KeyF')) tryShoot(G);

    // Drive or walk.
    if (G.player.car) {
      const car = G.player.car;
      let drive = null;
      if (G.autopilot) {
        updateAutopilot(G, dt);
        drive = G.autoDrive || { throttle: 0, steer: 0, brake: false };
      } else {
        let throttle = 0;
        if (keys.has('KeyW') || keys.has('ArrowUp')) throttle += 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) throttle -= 1;
        let steer = 0;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) steer -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) steer += 1;
        drive = { throttle, steer, brake: keys.has('Space') };
      }
      stepCar(car, drive, dt, G.city.colliders);
      G.player.x = car.x;
      G.player.z = car.z;
      G.player.heading = car.heading;
      G.audio.engine(Math.abs(car.speed) / 38);
    } else {
      stepPlayer(G.player, keys, G.player.camYaw, dt, G.city.colliders, 0);
      G.audio.engine(0);
    }

    updateTraffic(G, dt);
    updatePolice(G, dt);
    updateMissions(G, dt);
    updateCombat(G, dt);
    registerShootables(G);

    G.shootCooldown = Math.max(0, G.shootCooldown - dt);
    G.hudFlash = Math.max(0, G.hudFlash - dt);
    G.subtitleTimer = Math.max(0, G.subtitleTimer - dt);
    G.objectiveText = missionObjectiveLabel(G);

    // Prompt line: what can I do right now?
    if (G.player.car) {
      G.promptText = 'E — get out   Space — handbrake   R — reset car   F — shoot';
    } else {
      G.promptText = 'E — steal a car   F — shoot   P — pause   M — mute';
    }

    // Busted / wasted.
    for (const ev of G.events.splice(0)) {
      if (ev.type === 'busted') handleBusted();
    }
    if (G.player.health <= 0 && G.mode === 'playing') handleWasted();

    // Autosave.
    G.saveTimer += dt;
    if (G.saveTimer > 20 || G.saveSoon) saveNow();

    updateCamera(dt);
  } else if (G.mode === 'title') {
    // Slow orbit around the plaza behind the title screen.
    const t = G.time * 0.05;
    camera.position.set(Math.sin(t) * 90, 42, Math.cos(t) * 90 - 20);
    camera.lookAt(20, 12, -20);
  }

  updateHud(G);
  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    document.body.classList.add('ready');
  }
  G.input.endFrame();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

frame();
