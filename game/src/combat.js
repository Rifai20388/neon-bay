// Combat for Neon Bay: a pistol with a hitscan shot, a tracer line and a
// muzzle flash. Shooting a pedestrian or a police car is a crime; three hits
// disable a police car. No ammo counter: the pistol never runs dry.
import * as THREE from 'three';

export class Combat {
  constructor(scene, camera, traffic, police) {
    this.scene = scene;
    this.camera = camera;
    this.traffic = traffic;
    this.police = police;
    this.cooldown = 0;
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 });
    this.tracer = null;
    this.tracerLife = 0;
    this.flash = new THREE.PointLight(0xffe9a0, 0, 18);
    this.flash.position.set(0, 0, 0);
    scene.add(this.flash);
    this.shotsFired = 0;
  }

  step(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.tracer) {
      this.tracerLife -= dt;
      this.tracerMat.opacity = Math.max(0, this.tracerLife / 0.08);
      if (this.tracerLife <= 0) {
        this.scene.remove(this.tracer);
        this.tracer.geometry.dispose();
        this.tracer = null;
      }
    }
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 60);
  }

  // Fire from the camera toward the crosshair. Returns 'ped', 'police',
  // 'car', 'building' or '' (nothing hit).
  shoot(origin, direction, onCrime) {
    if (this.cooldown > 0) return '';
    this.cooldown = 0.28;
    this.shotsFired += 1;
    // Targets: pedestrians (as spheres), police cars and traffic cars.
    const targets = [];
    for (const ped of this.traffic.peds) {
      if (!ped.down) targets.push({ obj: ped, kind: 'ped', point: ped.pos });
    }
    for (const car of this.police.cars) {
      targets.push({ obj: car, kind: 'police', point: car.pos });
    }
    for (const car of this.traffic.cars) {
      targets.push({ obj: car, kind: 'car', point: car.pos });
    }
    let hitKind = '';
    let hitPoint = origin.clone().add(direction.clone().multiplyScalar(90));
    let bestD = 90;
    for (const t of targets) {
      const toTarget = new THREE.Vector3().subVectors(t.point, origin);
      const along = toTarget.dot(direction);
      if (along < 1 || along > bestD) continue;
      const closest = origin.clone().add(direction.clone().multiplyScalar(along));
      const d = closest.distanceTo(new THREE.Vector3(t.point.x, 1.2, t.point.z));
      const radius = t.kind === 'ped' ? 1.1 : 2.6;
      if (d < radius) {
        bestD = along;
        hitKind = t.kind;
        hitPoint = closest;
        if (t.kind === 'ped') {
          this.traffic.knockDown(t.point, 3);
          onCrime(60);
        } else if (t.kind === 'police') {
          t.obj.health -= 34;
          onCrime(40);
        } else {
          onCrime(15);
        }
      }
    }
    // Tracer from the muzzle to the hit point.
    const muzzle = origin.clone().add(direction.clone().multiplyScalar(1.2));
    muzzle.y -= 0.15;
    const geo = new THREE.BufferGeometry().setFromPoints([muzzle, hitPoint]);
    if (this.tracer) {
      this.scene.remove(this.tracer);
      this.tracer.geometry.dispose();
    }
    this.tracer = new THREE.Line(geo, this.tracerMat);
    this.tracerMat.opacity = 0.9;
    this.tracerLife = 0.08;
    this.scene.add(this.tracer);
    this.flash.position.copy(muzzle);
    this.flash.intensity = 14;
    return hitKind;
  }
}
