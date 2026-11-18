// Jax Marlow on foot: a simple capsule character with swinging legs, a
// third-person orbit camera, run and jump. Movement is camera-relative so
// the mouse always steers where Jax runs.
import * as THREE from 'three';
import { clamp, pushCircleOutOfBox } from './util.js';

export function makePlayerMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a077 });
  const shirt = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a3242 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.7, 4, 8), shirt);
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), skin);
  head.position.y = 1.95;
  head.castShadow = true;
  group.add(head);

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.31, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshLambertMaterial({ color: 0x2a1c10 }),
  );
  hair.position.y = 2.0;
  group.add(hair);

  const legGeo = new THREE.BoxGeometry(0.22, 0.75, 0.26);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.2, 0.38, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.2, 0.38, 0);
  legR.castShadow = true;
  group.add(legR);

  const armGeo = new THREE.BoxGeometry(0.18, 0.7, 0.2);
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.position.set(-0.58, 1.2, 0);
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.position.set(0.58, 1.2, 0);
  group.add(armR);

  return { group, legL, legR, armL, armR };
}

export function makePlayer(x, z, heading) {
  const parts = makePlayerMesh();
  parts.group.position.set(x, 0, z);
  parts.group.rotation.y = heading;
  return {
    parts,
    mesh: parts.group,
    x,
    z,
    y: 0,
    vy: 0,
    heading,
    walkPhase: 0,
    moving: false,
    camYaw: heading,
    camPitch: 0.32,
  };
}

export function stepPlayer(player, keys, camYaw, dt, colliders, groundY) {
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const speed = run ? 6.4 : 3.6;
  let ix = 0;
  let iz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  const moving = ix !== 0 || iz !== 0;
  player.moving = moving;

  if (moving) {
    const len = Math.hypot(ix, iz);
    ix /= len;
    iz /= len;
    // Camera-relative: forward is where the camera looks.
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    const wx = ix * cos - iz * sin;
    const wz = ix * sin + iz * cos;
    player.x += wx * speed * dt;
    player.z += wz * speed * dt;
    player.heading = Math.atan2(wx, -wz);
    player.walkPhase += dt * speed * 1.9;
  }

  // Jump + gravity (ground is flat at y = groundY).
  if ((keys.has('Space')) && player.y <= groundY + 0.01) {
    player.vy = 7.5;
  }
  player.vy -= 22 * dt;
  player.y += player.vy * dt;
  if (player.y < groundY) {
    player.y = groundY;
    player.vy = 0;
  }

  // Buildings push the player out.
  const out = { x: player.x, z: player.z };
  for (const box of colliders) {
    if (Math.abs(player.x - (box.minX + box.maxX) / 2) > 30 || Math.abs(player.z - (box.minZ + box.maxZ) / 2) > 30) {
      continue;
    }
    if (pushCircleOutOfBox(player.x, player.z, 0.7, box, out)) {
      player.x = out.x;
      player.z = out.z;
    }
  }
  player.x = clamp(player.x, -185, 185);
  player.z = clamp(player.z, -185, 215);

  player.mesh.position.set(player.x, player.y, player.z);
  player.mesh.rotation.y = player.heading;
  const swing = moving ? Math.sin(player.walkPhase) * 0.55 : 0;
  player.parts.legL.rotation.x = swing;
  player.parts.legR.rotation.x = -swing;
  player.parts.armL.rotation.x = -swing * 0.7;
  player.parts.armR.rotation.x = swing * 0.7;
}
