// Small math helpers shared by every Neon Bay system. Nothing here knows
// about the scene; it is pure arithmetic so it is easy to test by hand.
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest signed turn from angle `from` to angle `to`, in radians.
export function angleDiff(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function angleLerp(from, to, t) {
  return from + angleDiff(from, to) * t;
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Push a circle (x, z, radius) out of an axis-aligned box. Returns true when
// a push happened and writes the corrected position into `out`.
export function pushCircleOutOfBox(x, z, r, box, out) {
  const cx = clamp(x, box.minX, box.maxX);
  const cz = clamp(z, box.minZ, box.maxZ);
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    out.x = cx + (dx / d) * r;
    out.z = cz + (dz / d) * r;
  } else {
    // Centre is inside the box: shove out along the smallest penetration.
    const left = x - box.minX;
    const right = box.maxX - x;
    const top = z - box.minZ;
    const bottom = box.maxZ - z;
    const m = Math.min(left, right, top, bottom);
    out.x = x;
    out.z = z;
    if (m === left) out.x = box.minX - r;
    else if (m === right) out.x = box.maxX + r;
    else if (m === top) out.z = box.minZ - r;
    else out.z = box.maxZ + r;
  }
  return true;
}

// Heading (radians, 0 = facing -z / north) of a direction vector.
export function headingOf(dx, dz) {
  return Math.atan2(dx, -dz);
}
