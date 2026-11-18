// Missions and the story of Neon Bay. Jax Marlow, a wheelman down on his
// luck, takes jobs from Lena Voss of the Palms crew. Three jobs in a row:
// a getaway, a package run under police heat, and losing the tail. Each has
// an objective marker (a beacon in the world and on the minimap), dialogue
// shown as subtitles, and a cash reward.
import * as THREE from 'three';

const DIALOGUE = {
  intro: [
    'LENA: Jax. You still owe the Palms, and I have work. Get in a car.',
    'LENA: First job is simple: drive to the docks. Do not keep me waiting.',
  ],
  m1done: [
    'LENA: Clean. You drive like you mean it.',
    'LENA: Next: a package in the alley off Coral Row. Bring it to the warehouse. Cops will notice.',
  ],
  m2done: [
    'LENA: Package delivered. The Palms remember who delivers.',
    'LENA: Last job: shake the tail, then come home to the hideout. No cops on our street.',
  ],
  m3done: [
    'LENA: You are one of us now, Jax. Neon Bay is yours.',
    'The Palms pay $500. Keep the car. Keep the city.',
  ],
};

// Mission targets are road points around the city.
export const MISSIONS = [
  {
    id: 'getaway',
    title: 'The Getaway',
    brief: 'Steal a car and drive to the docks marker.',
    reward: 150,
    timeLimit: 120,
    target: { x: 240, z: 240 },
    needsCar: true,
  },
  {
    id: 'package',
    title: 'Package Run',
    brief: 'Grab the package on foot, then drive it to the warehouse.',
    reward: 300,
    timeLimit: 180,
    target: { x: -180, z: 120 },
    pickup: { x: -120, z: -180 },
    heatOnPickup: 120,
  },
  {
    id: 'hideout',
    title: 'Lay Low',
    brief: 'Lose the cops, then reach the hideout.',
    reward: 500,
    timeLimit: 240,
    target: { x: 60, z: -240 },
    needsClear: true,
  },
];

export class Missions {
  constructor(scene) {
    this.scene = scene;
    this.index = 0;
    this.active = false;
    this.stage = 'none'; // none | go | pickup | deliver | clear | done
    this.timer = 0;
    this.lastReward = 0;
    this.customObjective = ''; // set to show a fixed line instead of the job text
    this.subtitles = [];
    this.subtitleTimer = 0;
    this.completed = 0;
    // The beacon: a glowing column and a floating diamond over the target.
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xffd23c, transparent: true, opacity: 0.35, depthWrite: false,
    });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true), beaconMat);
    this.beacon.visible = false;
    scene.add(this.beacon);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.4),
      new THREE.MeshBasicMaterial({ color: 0xffd23c }),
    );
    this.marker = diamond;
    diamond.visible = false;
    scene.add(diamond);
    this.target = null;
  }

  current() {
    return MISSIONS[this.index] || null;
  }

  say(lines) {
    this.subtitles.push(...lines);
    this.subtitleTimer = 0;
  }

  // The subtitle line showing now, if any.
  subtitle(dt) {
    if (this.subtitles.length === 0) return '';
    this.subtitleTimer += dt;
    if (this.subtitleTimer > 4.5) {
      this.subtitles.shift();
      this.subtitleTimer = 0;
      if (this.subtitles.length === 0) return '';
    }
    return this.subtitles[0];
  }

  start() {
    const m = this.current();
    if (!m) return;
    this.active = true;
    this.timer = m.timeLimit;
    if (m.pickup) {
      this.stage = 'pickup';
      this.target = m.pickup;
    } else {
      this.stage = 'go';
      this.target = m.target;
    }
    this.showMarker();
    if (this.index === 0 && !this._introSaid) {
      this._introSaid = true;
      this.say(DIALOGUE.intro);
    }
  }

  showMarker() {
    if (!this.target) return;
    this.beacon.visible = true;
    this.beacon.position.set(this.target.x, 30, this.target.z);
    this.marker.visible = true;
    this.marker.position.set(this.target.x, 12, this.target.z);
  }

  hideMarker() {
    this.beacon.visible = false;
    this.marker.visible = false;
  }

  // Advance the mission. `at` tells where the player is and what they are
  // doing; returns an event string for the main loop: '', 'done', 'failed'
  // or 'pickup'.
  step(dt, playerPos, inCar, wanted) {
    if (!this.active) return '';
    const m = this.current();
    this.timer -= dt;
    if (this.timer <= 0) {
      this.active = false;
      this.hideMarker();
      return 'failed';
    }
    if (this.stage === 'clear') {
      if (wanted === 0) {
        this.stage = 'go';
        this.target = m.target;
        this.showMarker();
      }
      return '';
    }
    if (!this.target) return '';
    const d = Math.hypot(playerPos.x - this.target.x, playerPos.z - this.target.z);
    if (d < 7) {
      if (this.stage === 'pickup') {
        this.stage = 'deliver';
        this.target = m.target;
        this.showMarker();
        return 'pickup';
      }
      if (this.stage === 'go' && m.needsCar && !inCar) return '';
      this.active = false;
      this.hideMarker();
      this.lastReward = m.reward;
      this.completed += 1;
      this.index += 1;
      const next = this.current();
      if (next) {
        if (next.id === 'package') this.say(DIALOGUE.m1done);
        if (next.id === 'hideout') this.say(DIALOGUE.m2done);
      } else {
        this.say(DIALOGUE.m3done);
      }
      return 'done';
    }
    if (this.stage === 'go' && m.needsClear && wanted > 0) {
      this.stage = 'clear';
      this.target = null;
      this.hideMarker();
    }
    return '';
  }

  // After a mission completes, the next one starts after a short breather.
  beginNext() {
    const m = this.current();
    if (!m) return;
    this.active = true;
    this.timer = m.timeLimit;
    if (m.pickup) {
      this.stage = 'pickup';
      this.target = m.pickup;
    } else if (m.needsClear) {
      this.stage = 'clear';
      this.target = null;
      this.hideMarker();
    } else {
      this.stage = 'go';
      this.target = m.target;
    }
    if (this.target) this.showMarker();
  }

  objectiveText() {
    if (this.customObjective) return this.customObjective;
    if (!this.active) {
      return this.current() ? 'Job complete — the next one starts in a moment.' : 'All jobs done. Neon Bay is yours — free roam.';
    }
    const m = this.current();
    const t = Math.max(0, Math.ceil(this.timer));
    if (this.stage === 'pickup') return `${m.title}: grab the package (${t}s)`;
    if (this.stage === 'deliver') return `${m.title}: drive the package to the warehouse (${t}s)`;
    if (this.stage === 'clear') return `${m.title}: lose the cops, then reach the hideout (${t}s)`;
    return `${m.title}: ${m.brief} (${t}s)`;
  }

  stepVisuals(dt, t) {
    if (this.marker.visible) {
      this.marker.rotation.y += dt * 2;
      this.marker.position.y = 12 + Math.sin(t * 2) * 0.8;
    }
  }
}
