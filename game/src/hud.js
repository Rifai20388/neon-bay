// The HUD for Neon Bay: health, cash, wanted stars, the mission objective,
// speed, subtitles and a canvas minimap (roads, the player, cars, police and
// the mission marker, north-up). All DOM lives in index.html; this updates it.
import { ROADS } from './city.js';

export class HUD {
  constructor(doc) {
    this.doc = doc;
    this.healthBar = doc.getElementById('health-fill');
    this.healthText = doc.getElementById('health-text');
    this.cashText = doc.getElementById('cash');
    this.starsEl = doc.getElementById('stars');
    this.objectiveEl = doc.getElementById('objective');
    this.speedEl = doc.getElementById('speed');
    this.subtitleEl = doc.getElementById('subtitle');
    this.promptEl = doc.getElementById('prompt');
    this.minimap = doc.getElementById('minimap');
    this.mini = this.minimap.getContext('2d');
    this.crosshair = doc.getElementById('crosshair');
    this._lastStars = -1;
  }

  setCrosshair(visible) {
    this.crosshair.style.display = visible ? 'block' : 'none';
  }

  setHealth(hp) {
    const pct = Math.max(0, Math.round(hp));
    this.healthBar.style.width = `${pct}%`;
    this.healthBar.style.background = pct > 50 ? '#58d68d' : pct > 25 ? '#f5b041' : '#e74c3c';
    this.healthText.textContent = `HP ${pct}`;
  }

  setCash(cash) {
    this.cashText.textContent = `$${Math.floor(cash).toLocaleString('en-US')}`;
  }

  setWanted(stars) {
    if (stars === this._lastStars) return;
    this._lastStars = stars;
    let s = '';
    for (let i = 0; i < 5; i += 1) s += i < stars ? '★' : '☆';
    this.starsEl.textContent = s;
    this.starsEl.style.opacity = stars > 0 ? '1' : '0.45';
  }

  setObjective(text) {
    if (this.objectiveEl.textContent !== text) this.objectiveEl.textContent = text;
  }

  setSpeed(kmh, inCar) {
    this.speedEl.textContent = inCar ? `${Math.round(Math.abs(kmh))} km/h` : '';
  }

  setSubtitle(text) {
    if (this.subtitleEl.textContent !== text) this.subtitleEl.textContent = text;
  }

  setPrompt(text) {
    if (this.promptEl.textContent !== text) this.promptEl.textContent = text;
  }

  // North-up minimap: the whole city fits in the 180px canvas.
  drawMinimap(playerPos, playerHeading, cars, policeCars, target, time) {
    const g = this.mini;
    const S = this.minimap.width;
    const scale = S / 640;
    const toX = (x) => (x + 320) * scale;
    const toY = (z) => (z + 320) * scale;
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(16, 22, 34, 0.82)';
    g.fillRect(0, 0, S, S);
    // Beach and sea at the bottom (south).
    g.fillStyle = '#e8d29a';
    g.fillRect(0, toY(268), S, toY(320) - toY(268));
    g.fillStyle = '#2a7fae';
    g.fillRect(0, toY(320), S, S - toY(320));
    // Roads.
    g.strokeStyle = '#5a5f6a';
    g.lineWidth = 3;
    for (const r of ROADS) {
      g.beginPath(); g.moveTo(toX(-300), toY(r)); g.lineTo(toX(300), toY(r)); g.stroke();
      g.beginPath(); g.moveTo(toX(r), toY(-300)); g.lineTo(toX(r), toY(300)); g.stroke();
    }
    // Mission target: a pulsing yellow diamond.
    if (target) {
      const pulse = 5 + Math.sin(time * 5) * 2;
      g.fillStyle = '#ffd23c';
      g.beginPath();
      g.moveTo(toX(target.x), toY(target.z) - pulse);
      g.lineTo(toX(target.x) + pulse, toY(target.z));
      g.lineTo(toX(target.x), toY(target.z) + pulse);
      g.lineTo(toX(target.x) - pulse, toY(target.z));
      g.closePath(); g.fill();
    }
    // Traffic as white dots, police as flashing red/blue.
    g.fillStyle = '#dddddd';
    for (const c of cars) {
      g.fillRect(toX(c.pos.x) - 1.5, toY(c.pos.z) - 1.5, 3, 3);
    }
    const flash = Math.floor(time * 4) % 2 === 0;
    g.fillStyle = flash ? '#ff3333' : '#3388ff';
    for (const c of policeCars) {
      g.beginPath();
      g.arc(toX(c.pos.x), toY(c.pos.z), 3.5, 0, Math.PI * 2);
      g.fill();
    }
    // The player: a yellow arrow pointing along the heading.
    const px = toX(playerPos.x); const py = toY(playerPos.z);
    g.save();
    g.translate(px, py);
    // The arrow is drawn pointing up (north); rotating by PI - heading
    // points it along the world forward (sin h, cos h) on the canvas.
    g.rotate(Math.PI - playerHeading);
    g.fillStyle = '#ffd23c';
    g.beginPath();
    g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(-5, 6);
    g.closePath(); g.fill();
    g.restore();
  }
}
