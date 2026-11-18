// Neon Bay: the bootstrap and game loop. Builds the city, wires the player,
// cars, traffic, police, missions, combat, HUD, audio and save together,
// and runs the frame loop. Play it with WASD + mouse; E steals and exits
// cars; click shoots; P pauses; M mutes. ?shot=drive|foot|chase|mission
// stages a screenshot scene instead of the title screen.
import * as THREE from 'three';
import { buildCity, WORLD } from './city.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { makeCar, Car, randomCarColor } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Combat } from './combat.js';
import { AudioEngine } from './audio.js';
import { HUD } from './hud.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { parseShot, stageShot, autopilotDrive } from './shots.js';
import { mulberry32 } from './rng.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

const rng = mulberry32(20261118);
const city = buildCity(scene);
const colliders = city.colliders;
const input = new Input(canvas);
const audio = new AudioEngine();
const hud = new HUD(document);
input.onFirstGesture = () => audio.ensure();

const player = new Player(scene, rng);
const traffic = new Traffic(scene, colliders);
const police = new Police(scene, traffic, colliders);
const missions = new Missions(scene);
const combat = new Combat(scene, camera, traffic, police);

// Game state, shared with the screenshot stager.
const G = {
  mode: 'title',
  player, traffic, police, missions, combat, audio, hud,
  cameraYaw: Math.PI,
  cameraPitch: 0.34,
  cameraDist: 10,
  autopilot: false,
  autopilotTarget: null,
  inCar: null,
  setInCar(car) {
    this.inCar = car;
    player.group.visible = car === null;
    if (car) {
      player.pos.copy(car.pos);
      player.heading = car.heading;
    }
  },
  takeCarAt(x, z, heading) {
    const group = makeCar(0xd84a4a);
    scene.add(group);
    const car = new Car(group, x, z, heading);
    car.kind = 'player';
    return car;
  },
};
window.__neonBay = G;
window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message)));

let cameraShake = 0;
let lastDamageAt = -10;
let breatherTimer = 0;
let breatherAction = null; // 'next' to start the following job, 'retry' to restart this one
let saveTimer = 0;
let elapsed = 0;

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayText = document.getElementById('overlay-text');
const btnNew = document.getElementById('btn-new');
const btnContinue = document.getElementById('btn-continue');
const btnResume = document.getElementById('btn-resume');

function showOverlay(title, text, showNew, showContinue, showResume) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  btnNew.style.display = showNew ? '' : 'none';
  btnContinue.style.display = showContinue ? '' : 'none';
  btnResume.style.display = showResume ? '' : 'none';
  overlay.style.display = 'flex';
}

function hideOverlay() {
  overlay.style.display = 'none';
}

function startGame(fromSave) {
  const save = fromSave ? loadGame() : null;
  if (save) {
    player.cash = save.cash || 0;
    player.health = save.health || 100;
    player.place(save.x, save.z, save.heading || 0);
    missions.index = save.missionIndex || 0;
    missions.completed = save.missionsCompleted || 0;
  } else {
    player.cash = 0;
    player.health = 100;
    player.place(0, 30, Math.PI);
    missions.index = 0;
    missions.completed = 0;
  }
  police.reset();
  traffic.spawnAll(player.pos.x, player.pos.z);
  G.setInCar(null);
  G.mode = 'playing';
  hideOverlay();
  audio.ensure();
  missions.start();
  doSave();
}

btnNew.addEventListener('click', () => startGame(false));
btnContinue.addEventListener('click', () => startGame(true));
btnResume.addEventListener('click', () => {
  G.mode = 'playing';
  hideOverlay();
  canvas.requestPointerLock();
});

function doSave() {
  saveGame({
    cash: player.cash,
    missionIndex: missions.index,
    missionsCompleted: missions.completed,
    pos: currentPos(),
    heading: currentHeading(),
    health: player.health,
  });
}

function currentPos() {
  return G.inCar ? G.inCar.pos : player.pos;
}

function currentHeading() {
  return G.inCar ? G.inCar.heading : player.heading;
}

function respawn(reason) {
  const lost = Math.floor(player.cash * (reason === 'busted' ? 0.15 : 0.2));
  player.cash = Math.max(0, player.cash - lost);
  player.health = 100;
  police.reset();
  G.setInCar(null);
  player.place(0, 30, Math.PI);
  G.cameraYaw = Math.PI;
  const place = reason === 'busted' ? 'the station' : 'Neon Bay General';
  showOverlay(
    reason === 'busted' ? 'BUSTED' : 'WASTED',
    `You wake up at ${place}. The Palms took $${lost} off you. Your car is gone.`,
    false, false, true,
  );
  G.mode = reason;
  doSave();
}

function updateCamera(dt) {
  const target = currentPos();
  const focus = new THREE.Vector3(target.x, (target.y || 0) + 1.8, target.z);
  // Ease the chase camera toward the car's heading while driving, unless
  // the mouse moved recently or the shot locked the camera (a rear view).
  if (G.inCar && !G.cameraLock && Math.abs(input.mouseDX) < 1) {
    let diff = G.inCar.heading - G.cameraYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    G.cameraYaw += diff * Math.min(1, dt * 1.4);
  }
  const mouse = input.takeMouse();
  G.cameraYaw -= mouse.dx * 0.0032;
  G.cameraPitch = Math.max(0.08, Math.min(0.9, G.cameraPitch + mouse.dy * 0.0022));
  const cp = Math.cos(G.cameraPitch);
  const sp = Math.sin(G.cameraPitch);
  const off = new THREE.Vector3(
    -Math.sin(G.cameraYaw) * cp,
    sp,
    -Math.cos(G.cameraYaw) * cp,
  ).multiplyScalar(G.cameraDist);
  const shake = cameraShake * 0.5;
  camera.position.set(
    focus.x + off.x + (Math.random() - 0.5) * shake,
    focus.y + off.y + 2.2 + (Math.random() - 0.5) * shake,
    focus.z + off.z + (Math.random() - 0.5) * shake,
  );
  const look = new THREE.Vector3(
    focus.x + Math.sin(G.cameraYaw) * 6,
    focus.y + 0.5,
    focus.z + Math.cos(G.cameraYaw) * 6,
  );
  camera.lookAt(look);
  // Keep the sun's shadow box near the player.
  const sun = scene.children.find((c) => c.isDirectionalLight);
  if (sun) {
    sun.position.set(target.x + 180, 260, target.z + 120);
    sun.target.position.set(target.x, 0, target.z);
    sun.target.updateMatrixWorld();
  }
}

function nearestTrafficCar(maxDist) {
  return traffic.nearestCar(currentPos(), maxDist);
}

function stepWorld(dt) {
  const axes = input.axes();
  const inCar = G.inCar;
  const pos = currentPos();

  // Missions and their timer.
  const event = missions.step(dt, pos, !!inCar, police.wantedCount());
  if (event === 'done') {
    player.cash += missions.lastReward;
    audio.sting();
    hud.setSubtitle(`Job complete: +$${missions.lastReward}.`);
    doSave();
    breatherTimer = 5;
    breatherAction = 'next';
  } else if (event === 'failed') {
    hud.setSubtitle('Job failed — Lena is not happy. Trying again.');
    breatherTimer = 4;
    breatherAction = 'retry';
  } else if (event === 'pickup') {
    const m = missions.current();
    police.addHeat(m && m.heatOnPickup ? m.heatOnPickup : 120);
    audio.pickup();
  }
  if (breatherTimer > 0) {
    breatherTimer -= dt;
    if (breatherTimer <= 0 && breatherAction) {
      const action = breatherAction;
      breatherAction = null;
      if (action === 'next' && missions.current()) missions.beginNext();
      else if (action === 'retry') missions.start();
    }
  }

  // Driving or walking.
  let speed = 0;
  if (inCar) {
    if (G.autopilot) {
      const cmd = autopilotDrive(inCar, dt, G.autopilotTarget, traffic.cars, G.autopilotHeading);
      inCar.drive(dt, cmd.throttle, cmd.steer, cmd.handbrake, colliders);
    } else {
      inCar.drive(dt, axes.forward, axes.right, input.down('Space'), colliders);
    }
    speed = inCar.speed;
    // Hit a pedestrian while driving: a crime, and the car shudders.
    for (const ped of traffic.peds) {
      if (ped.down) continue;
      const d = Math.hypot(ped.pos.x - inCar.pos.x, ped.pos.z - inCar.pos.z);
      if (d < 2.6 && Math.abs(inCar.speed) > 5) {
        traffic.knockDown(ped.pos, 3);
        police.addHeat(50);
        audio.thud();
        cameraShake = Math.min(1, cameraShake + 0.5);
        inCar.speed *= 0.7;
      }
    }
    // Collide with traffic cars.
    for (const car of traffic.cars) inCar.collideWith(car);
    for (const car of police.cars) inCar.collideWith(car);
    if (input.pressed('KeyE')) {
      // Get out beside the car.
      const rx = -Math.cos(inCar.heading);
      const rz = Math.sin(inCar.heading);
      player.place(inCar.pos.x + rx * 3.2, inCar.pos.z + rz * 3.2, inCar.heading);
      G.setInCar(null);
      audio.blip(440, 0.08);
    }
    if (input.pressed('KeyR')) {
      inCar.pos.y = 0;
      inCar.speed = 0;
    }
  } else {
    speed = player.step(dt, axes, G.cameraYaw, input.down('ShiftLeft') || input.down('ShiftRight'), input.pressed('Space'), colliders);
    // Steal the nearest traffic car.
    const near = nearestTrafficCar(4.5);
    if (near && input.pressed('KeyE')) {
      traffic.removeCar(near);
      // The driver stumbles out onto the sidewalk.
      traffic.addPed(near.pos.x, near.pos.z, false);
      G.setInCar(near);
      police.addHeat(60);
      audio.blip(660, 0.1);
      hud.setSubtitle('Car stolen — the cops will not like that.');
    }
    // A traffic car can run the player over.
    for (const car of traffic.cars) {
      const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
      if (d < 2.2 && Math.abs(car.speed) > 3) {
        if (player.damage(15)) { respawn('wasted'); return; }
        lastDamageAt = elapsed;
        cameraShake = Math.min(1, cameraShake + 0.6);
        audio.thud();
        player.pos.x += (player.pos.x - car.pos.x) * 0.4;
        player.pos.z += (player.pos.z - car.pos.z) * 0.4;
      }
    }
  }

  // Shooting: click (or F) fires from the camera, on foot or driving.
  if ((input.takeClick() || input.pressed('KeyF')) && G.mode === 'playing') {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const hit = combat.shoot(camera.position.clone(), dir, (heat) => police.addHeat(heat));
    if (hit) {
      audio.gunshot();
      cameraShake = Math.min(1, cameraShake + 0.25);
    }
  }
  combat.step(dt);

  // Traffic, pedestrians and police.
  traffic.step(dt, pos.x, pos.z, inCar);
  const busted = police.step(dt, pos, Math.abs(speed), !!inCar, player);
  if (busted) { respawn('busted'); return; }
  if (player.health <= 0) { respawn('wasted'); return; }

  // Health regens after a quiet stretch.
  if (elapsed - lastDamageAt > 5 && player.health < 100) player.heal(3 * dt);

  // Audio follows the car and the sirens.
  const carSpeed01 = inCar ? Math.min(1, Math.abs(inCar.speed) / 38) : 0;
  audio.engine(carSpeed01, !!inCar);
  audio.siren(police.cars.length > 0, dt);
  cameraShake = Math.max(0, cameraShake - dt * 1.8);

  // HUD.
  hud.setHealth(player.health);
  hud.setCash(player.cash);
  hud.setWanted(police.wantedCount());
  hud.setObjective(missions.objectiveText());
  hud.setSpeed(inCar ? inCar.speed * 2.6 : 0, !!inCar);
  hud.setSubtitle(missions.subtitle(dt));
  let prompt = '';
  if (!inCar && nearestTrafficCar(4.5)) prompt = 'Press E to steal the car';
  else if (inCar) prompt = 'E — get out    Space — handbrake    R — reset car';
  hud.setPrompt(prompt);
  hud.setCrosshair(true);
  hud.drawMinimap(pos, currentHeading(), traffic.cars, police.cars, missions.target, elapsed);

  city.update(dt, elapsed);
  missions.stepVisuals(dt, elapsed);
  saveTimer += dt;
  if (saveTimer > 20) { saveTimer = 0; doSave(); }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastNow) / 1000 || 0.016);
  lastNow = now;
  elapsed += dt;
  if (input.pressed('KeyP') && (G.mode === 'playing' || G.mode === 'paused')) {
    if (G.mode === 'playing') {
      G.mode = 'paused';
      showOverlay('PAUSED', 'Neon Bay is waiting. Click resume to keep playing.', false, false, true);
      doSave();
    } else {
      G.mode = 'playing';
      hideOverlay();
      canvas.requestPointerLock();
    }
  }
  if (input.pressed('KeyM')) audio.setMuted(!audio.muted);
  if (G.mode === 'playing') {
    stepWorld(dt);
    updateCamera(dt);
  }
  // Snapshot the keys once per frame, so pressed() edge-triggers work even
  // on frames where the world does not step (paused, title).
  input.endFrame();
  renderer.render(scene, camera);
}

let lastNow = performance.now();

// Title screen, or a staged screenshot scene.
const shotMode = parseShot();
// Pause when the pointer lock is lost while playing (Esc), except in shot
// mode, where no lock is ever taken.
document.addEventListener('pointerlockchange', () => {
  if (!shotMode && G.mode === 'playing' && document.pointerLockElement !== canvas) {
    G.mode = 'paused';
    showOverlay('PAUSED', 'Neon Bay is waiting. Click resume to keep playing.', false, false, true);
    doSave();
  }
});
if (shotMode) {
  overlay.style.display = 'none';
  stageShot(shotMode, G);
  // Let the staged world settle a few seconds before the first frame the
  // screenshot takes, so traffic and police are already in place.
  for (let i = 0; i < 180; i += 1) {
    const dt = 1 / 60;
    elapsed += dt;
    if (G.mode === 'playing') stepWorld(dt);
    updateCamera(dt);
  }
} else if (hasSave()) {
  showOverlay(
    'NEON BAY',
    'A sun-soaked open-world crime game. Steal cars, outrun the cops, run jobs for Lena and the Palms. WASD move/drive · mouse look · E steal/exit · click shoot · P pause.',
    true, true, false,
  );
} else {
  showOverlay(
    'NEON BAY',
    'A sun-soaked open-world crime game. Steal cars, outrun the cops, run jobs for Lena and the Palms. WASD move/drive · mouse look · E steal/exit · click shoot · P pause.',
    true, false, false,
  );
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

requestAnimationFrame(frame);
