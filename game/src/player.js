// player.js — Wren, the lantern thief.
// Walks with WASD or the arrow keys, sneaks while Shift is held (slower,
// quieter, harder to spot), and throws a pebble with a mouse click to pull
// a warden away from a route. Walking upright is noisy; sneaking is silent.

import { TILE, isWalkable } from './levels.js';

export const PLAYER_RADIUS = 11;
export const PLAYER_WALK_SPEED = 132;
export const PLAYER_SNEAK_SPEED = 72;
export const NOISE_RADIUS_WALK = 78;
export const PEBBLE_RANGE = 240;
export const PEBBLE_NOISE_RADIUS = 135;

export class Player {
  constructor(start) {
    this.x = start.x * TILE + TILE / 2;
    this.y = start.y * TILE + TILE / 2;
    this.sneaking = false;
    this.moving = false;
    this.facing = -Math.PI / 2;
    this.pebbles = 5;
    this.stepPhase = 0;
    this.lastStepAt = 0;
  }

  /** One fixed tick: read the held keys and move, colliding with walls. */
  update(dt, input, world) {
    let mx = 0;
    let my = 0;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    if (input.up) my -= 1;
    if (input.down) my += 1;
    this.sneaking = input.sneak;
    this.moving = mx !== 0 || my !== 0;
    if (!this.moving) return;
    const length = Math.hypot(mx, my);
    const speed = this.sneaking ? PLAYER_SNEAK_SPEED : PLAYER_WALK_SPEED;
    const vx = (mx / length) * speed * dt;
    const vy = (my / length) * speed * dt;
    this.facing = Math.atan2(my, mx);
    if (this.canStandAt(world.grid, this.x + vx, this.y)) this.x += vx;
    if (this.canStandAt(world.grid, this.x, this.y + vy)) this.y += vy;
    this.stepPhase += speed * dt;
    // A footstep sounds every half tile of walking, only when upright.
    if (!this.sneaking && this.stepPhase - this.lastStepAt > TILE / 2) {
      this.lastStepAt = this.stepPhase;
      world.onFootstep(this);
    }
  }

  canStandAt(grid, x, y) {
    const r = PLAYER_RADIUS - 2;
    return (
      isWalkable(grid, Math.floor((x - r) / TILE), Math.floor((y - r) / TILE))
      && isWalkable(grid, Math.floor((x + r) / TILE), Math.floor((y - r) / TILE))
      && isWalkable(grid, Math.floor((x - r) / TILE), Math.floor((y + r) / TILE))
      && isWalkable(grid, Math.floor((x + r) / TILE), Math.floor((y + r) / TILE))
    );
  }

  /** Throw a pebble at a pixel point; returns the landing point or null. */
  throwPebble(targetX, targetY) {
    if (this.pebbles <= 0) return null;
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const distance = Math.hypot(dx, dy);
    if (distance > PEBBLE_RANGE) {
      const scale = PEBBLE_RANGE / distance;
      targetX = this.x + dx * scale;
      targetY = this.y + dy * scale;
    }
    this.pebbles -= 1;
    return { x: targetX, y: targetY, flight: 0.35 };
  }
}
