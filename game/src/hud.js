// The Neon Bay HUD: a DOM overlay (health, cash, wanted stars, objective,
// subtitle, prompt, speed, crosshair) plus a north-up canvas minimap. The
// DOM itself lives in index.html; this module reads it and draws the map.
import { BEACH_Z } from './city.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  return {
    hpFill: $('hp-fill'),
    hpLabel: $('hp-label'),
    cash: $('cash'),
    stars: $('stars'),
    objective: $('objective'),
    subtitle: $('subtitle'),
    prompt: $('prompt'),
    speed: $('speed'),
    crosshair: $('crosshair'),
    flash: $('damage-flash'),
    minimap: $('minimap'),
    mapCtx: $('minimap').getContext('2d'),
    title: $('title-screen'),
    pause: $('pause-screen'),
    end: $('end-screen'),
    endTitle: $('end-title'),
    endText: $('end-text'),
  };
}

function starRow(n) {
  let s = '';
  for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
  return s;
}

export function updateHud(G) {
  const hud = G.hud;
  const hp = Math.max(0, Math.round(G.player.health));
  hud.hpFill.style.width = `${hp}%`;
  hud.hpLabel.textContent = `HP ${hp}`;
  hud.hpFill.style.background = hp > 55 ? '#37c978' : hp > 25 ? '#e8b93b' : '#d23b2e';
  hud.cash.textContent = `$${Math.floor(G.player.cash)}`;
  hud.stars.textContent = starRow(G.wanted);
  hud.stars.style.color = G.wanted > 0 ? '#ffd24a' : '#b9c2d0';
  hud.objective.textContent = G.objectiveText || '';
  if (G.subtitleTimer > 0) {
    hud.subtitle.textContent = G.subtitle;
    hud.subtitle.style.opacity = '1';
  } else {
    hud.subtitle.style.opacity = '0';
  }
  hud.prompt.textContent = G.promptText || '';
  if (G.player.car) {
    hud.speed.textContent = `${Math.round(Math.abs(G.player.car.speed) * 3.2)} km/h`;
  } else {
    hud.speed.textContent = G.player.moving ? 'on foot' : '';
  }
  hud.crosshair.style.display = G.mode === 'playing' ? 'block' : 'none';
  if (G.hudFlash > 0) {
    hud.flash.style.opacity = String(Math.min(0.55, G.hudFlash));
  } else {
    hud.flash.style.opacity = '0';
  }
  drawMinimap(G);
}

// North-up map: the whole city fits in 180 px, beach along the bottom edge.
export function drawMinimap(G) {
  const ctx = G.hud.mapCtx;
  const S = 180;
  const W = 400; // world span shown: -185..215
  const toMap = (x, z) => [((x + 185) / W) * S, ((z + 185) / W) * S];
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#10141c';
  ctx.fillRect(0, 0, S, S);
  // Beach + sea at the south edge.
  const [, beachY] = toMap(0, 168);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(0, beachY, S, S - beachY);
  ctx.fillStyle = '#2a7fc4';
  ctx.fillRect(0, beachY + 12, S, S - beachY - 12);
  // Roads.
  ctx.strokeStyle = '#4a505c';
  ctx.lineWidth = 2;
  for (const c of G.city.roads) {
    const [x] = toMap(c, 0);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, S);
    ctx.stroke();
    const [, z] = toMap(0, c);
    ctx.beginPath();
    ctx.moveTo(0, z);
    ctx.lineTo(S, z);
    ctx.stroke();
  }
  // Plaza / Bay Tower.
  const [px, pz] = toMap(G.city.plaza.x, G.city.plaza.z);
  ctx.fillStyle = '#ffd24a';
  ctx.fillRect(px - 3, pz - 3, 6, 6);
  // Mission marker.
  if (G.marker && G.marker.group.visible) {
    const [mx, mz] = toMap(G.marker.group.position.x, G.marker.group.position.z);
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.moveTo(mx, mz - 5);
    ctx.lineTo(mx + 4, mz);
    ctx.lineTo(mx, mz + 5);
    ctx.lineTo(mx - 4, mz);
    ctx.closePath();
    ctx.fill();
  }
  // Traffic cars (white), cruisers (flashing red/blue), pedestrians (grey).
  ctx.fillStyle = '#d8d8d8';
  for (const car of G.trafficCars) {
    const [x, z] = toMap(car.x, car.z);
    ctx.fillRect(x - 1, z - 1, 2, 2);
  }
  const flashRed = Math.floor(G.time * 3) % 2 === 0;
  ctx.fillStyle = flashRed ? '#ff4040' : '#4080ff';
  for (const c of G.cruisers) {
    const [x, z] = toMap(c.x, c.z);
    ctx.fillRect(x - 2, z - 2, 4, 4);
  }
  ctx.fillStyle = '#8a8f9a';
  for (const ped of G.peds) {
    const [x, z] = toMap(ped.x, ped.z);
    ctx.fillRect(x - 0.5, z - 0.5, 1, 1);
  }
  // The player: a yellow arrow pointing along the heading.
  const [ux, uz] = toMap(G.player.x, G.player.z);
  const heading = G.player.car ? G.player.car.heading : G.player.heading;
  ctx.save();
  ctx.translate(ux, uz);
  // Map north is up; heading 0 faces -z, which is up on the map.
  ctx.rotate(-heading);
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(3.5, 4);
  ctx.lineTo(-3.5, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
