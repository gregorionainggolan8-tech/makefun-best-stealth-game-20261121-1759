// vision.js — line of sight and vision cones.
// A warden sees the thief only when the thief is inside the cone's angle
// and range and no wall stands between them. The same raycast builds the
// cone polygon the renderer draws, so what the player sees is exactly what
// the rules use.

import { TILE, blocksSight } from './levels.js';

/** Smallest absolute difference between two angles, in radians. */
export function angleDifference(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/**
 * March along a ray from (x0, y0) toward angle, up to `range` pixels.
 * Returns the distance actually travelled before a wall is hit.
 */
export function raycastDistance(grid, x0, y0, angle, range) {
  const step = 6;
  const dx = Math.cos(angle) * step;
  const dy = Math.sin(angle) * step;
  let x = x0;
  let y = y0;
  let travelled = 0;
  while (travelled < range) {
    x += dx;
    y += dy;
    travelled += step;
    if (blocksSight(grid, Math.floor(x / TILE), Math.floor(y / TILE))) return travelled;
  }
  return range;
}

/** True when no wall stands between the two pixel points. */
export function hasLineOfSight(grid, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return true;
  return raycastDistance(grid, x0, y0, Math.atan2(dy, dx), distance) >= distance - 6;
}

/**
 * The guard's cone as a polygon of pixel points: one ray per slice, each
 * stopped by the first wall, so the drawn cone never leaks through walls.
 */
export function conePolygon(grid, x, y, facing, halfAngle, range, slices = 26) {
  const points = [{ x, y }];
  for (let i = 0; i <= slices; i += 1) {
    const angle = facing - halfAngle + (2 * halfAngle * i) / slices;
    const distance = raycastDistance(grid, x, y, angle, range);
    points.push({ x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance });
  }
  return points;
}

/**
 * True when the guard at (gx, gy) facing `facing` can see the point (px, py):
 * inside the cone's angle and range, with a clear line of sight.
 */
export function canSee(grid, gx, gy, facing, halfAngle, range, px, py) {
  const dx = px - gx;
  const dy = py - gy;
  const distance = Math.hypot(dx, dy);
  if (distance > range) return false;
  if (distance < 12) return true;
  if (angleDifference(Math.atan2(dy, dx), facing) > halfAngle) return false;
  return hasLineOfSight(grid, gx, gy, px, py);
}
