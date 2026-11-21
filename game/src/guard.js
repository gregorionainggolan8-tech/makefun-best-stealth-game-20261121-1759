// guard.js — a warden: patrols a fixed route, grows suspicious when it
// glimpses the thief, gives chase when sure, and calms down again when the
// trail goes cold. Suspicion rises gradually and falls when the thief is
// out of sight, so a near miss is a scare, not an instant loss.

import { TILE, findPath, isWalkable } from './levels.js';
import { angleDifference, canSee } from './vision.js';

export const GUARD_HALF_ANGLE = 0.61; // ~35 degrees each side of facing
export const GUARD_RANGE = 185;
export const GUARD_RADIUS = 13;
export const SUSPICIOUS_AT = 25;
export const ALERT_AT = 100;

export const GuardState = {
  PATROL: 'patrol',
  PAUSE: 'pause',
  SUSPICIOUS: 'suspicious',
  ALERT: 'alert',
  SEARCH: 'search',
  INVESTIGATE: 'investigate',
};

/** How fast suspicion grows per second when the thief is seen. */
function suspicionGain(distance, sneaking, moving) {
  const closeness = 1.7 - distance / GUARD_RANGE; // 0.7 far away, 1.7 point blank
  let gain = 52 * closeness;
  if (sneaking) gain *= 0.45;
  if (moving) gain *= 1.15;
  return gain;
}

/** Turn `current` toward `target` by at most `maxTurn` radians. */
function turnToward(current, target, maxTurn) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxTurn) return target;
  return current + Math.sign(diff) * maxTurn;
}

export class Guard {
  constructor(def) {
    this.path = def.path.map(([x, y]) => ({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 }));
    this.x = this.path[0].x;
    this.y = this.path[0].y;
    this.waypoint = 1 % this.path.length;
    this.facing = 0;
    this.speed = def.speed;
    this.pauseTicks = def.pause;
    this.pauseLeft = 0;
    this.state = GuardState.PATROL;
    this.suspicion = 0;
    this.lastSeen = null;
    this.lostSightFor = 0;
    this.searchLeft = 0;
    this.investigateTarget = null;
    this.chasePath = [];
    this.chaseReplan = 0;
    this.scanPhase = 0;
  }

  /** Where the guard is looking right now, in tile-free pixel space. */
  get lookX() {
    return this.x + Math.cos(this.facing) * 20;
  }

  get lookY() {
    return this.y + Math.sin(this.facing) * 20;
  }

  /** Step the guard one fixed tick (dt seconds). `world` carries grid + thief. */
  update(dt, world) {
    const { grid, player } = world;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distance = Math.hypot(dx, dy);
    const hiddenByBush = world.playerInBush && distance > 48;
    const seen = !hiddenByBush
      && canSee(grid, this.x, this.y, this.facing, GUARD_HALF_ANGLE, GUARD_RANGE, player.x, player.y);

    if (seen) {
      this.suspicion = Math.min(ALERT_AT, this.suspicion + suspicionGain(distance, player.sneaking, player.moving) * dt);
      this.lastSeen = { x: player.x, y: player.y };
      this.lostSightFor = 0;
    } else {
      this.lostSightFor += dt;
      if (this.state !== GuardState.ALERT) {
        this.suspicion = Math.max(0, this.suspicion - 16 * dt);
      }
    }

    if (this.suspicion >= ALERT_AT && this.state !== GuardState.ALERT) {
      this.state = GuardState.ALERT;
      this.chasePath = [];
      this.chaseReplan = 0;
      world.onAlert(this);
    }

    switch (this.state) {
      case GuardState.PATROL:
      case GuardState.PAUSE:
        this.updatePatrol(dt, world, seen, dx, dy);
        break;
      case GuardState.SUSPICIOUS:
        this.updateSuspicious(dt, world, seen, dx, dy);
        break;
      case GuardState.ALERT:
        this.updateAlert(dt, world, seen);
        break;
      case GuardState.SEARCH:
        this.updateSearch(dt, world);
        break;
      case GuardState.INVESTIGATE:
        this.updateInvestigate(dt, world);
        break;
      default:
        break;
    }
  }

  updatePatrol(dt, world, seen, dx, dy) {
    if (seen && this.suspicion >= SUSPICIOUS_AT) {
      this.state = GuardState.SUSPICIOUS;
      return;
    }
    if (this.pauseLeft > 0) {
      this.pauseLeft -= 1;
      // Scan the room while waiting at a waypoint.
      this.scanPhase += dt;
      this.facing += Math.sin(this.scanPhase * 1.4) * 0.9 * dt;
      if (this.pauseLeft <= 0) this.state = GuardState.PATROL;
      return;
    }
    const target = this.path[this.waypoint];
    const arrived = this.moveToward(target, this.speed * dt, world.grid);
    this.facing = turnToward(this.facing, Math.atan2(target.y - this.y, target.x - this.x), 5 * dt);
    if (arrived) {
      this.waypoint = (this.waypoint + 1) % this.path.length;
      this.pauseLeft = this.pauseTicks;
      this.state = GuardState.PAUSE;
    }
  }

  updateSuspicious(dt, world, seen, dx, dy) {
    // Stop, stare at the glimpse, and decide. A thief who stays hidden
    // watches suspicion drain away; one who lingers gets chased.
    this.facing = turnToward(this.facing, Math.atan2(dy, dx), 3.2 * dt);
    if (!seen && this.suspicion < SUSPICIOUS_AT) {
      this.state = GuardState.PATROL;
    }
  }

  updateAlert(dt, world, seen) {
    const { grid, player } = world;
    if (!seen && this.lostSightFor > 3) {
      this.state = GuardState.SEARCH;
      this.searchLeft = 150;
      return;
    }
    this.chaseReplan -= dt;
    if (this.chaseReplan <= 0) {
      this.chaseReplan = 0.5;
      const from = { x: Math.floor(this.x / TILE), y: Math.floor(this.y / TILE) };
      const to = { x: Math.floor(player.x / TILE), y: Math.floor(player.y / TILE) };
      this.chasePath = findPath(grid, from, to) ?? [];
      this.chasePath.shift();
    }
    const next = this.chasePath[0];
    if (next) {
      const target = { x: next.x * TILE + TILE / 2, y: next.y * TILE + TILE / 2 };
      const arrived = this.moveToward(target, this.speed * 1.45 * dt, grid);
      this.facing = turnToward(this.facing, Math.atan2(target.y - this.y, target.x - this.x), 6 * dt);
      if (arrived) this.chasePath.shift();
    } else {
      this.facing = turnToward(this.facing, Math.atan2(player.y - this.y, player.x - this.x), 6 * dt);
    }
    if (Math.hypot(player.x - this.x, player.y - this.y) < GUARD_RADIUS + 11) {
      world.onCaught(this);
    }
  }

  updateSearch(dt, world) {
    // Walk to the last place the thief was seen, look around, give up.
    const target = this.lastSeen ?? { x: this.x, y: this.y };
    if (this.searchLeft > 120) {
      const arrived = this.moveToward(target, this.speed * 1.1 * dt, world.grid);
      this.facing = turnToward(this.facing, Math.atan2(target.y - this.y, target.x - this.x), 5 * dt);
      if (arrived) this.searchLeft = 120;
    } else if (this.searchLeft > 0) {
      this.searchLeft -= 1;
      this.facing += 1.8 * dt;
    } else {
      this.suspicion = 40;
      this.state = GuardState.PATROL;
      this.pauseLeft = 0;
    }
  }

  updateInvestigate(dt, world) {
    const target = this.investigateTarget;
    if (!target) {
      this.state = GuardState.PATROL;
      return;
    }
    const arrived = this.moveToward(target, this.speed * 1.1 * dt, world.grid);
    this.facing = turnToward(this.facing, Math.atan2(target.y - this.y, target.x - this.x), 5 * dt);
    if (arrived) {
      this.investigateTarget = null;
      this.state = GuardState.SEARCH;
      this.searchLeft = 90;
      this.lastSeen = { x: target.x, y: target.y };
    }
  }

  /** A noise at (x, y) pulls a calm guard over to look. */
  hearNoise(x, y) {
    if (this.state === GuardState.ALERT) return;
    this.investigateTarget = { x, y };
    this.state = GuardState.INVESTIGATE;
  }

  /** Walk toward a pixel point without crossing walls; true when arrived. */
  moveToward(target, step, grid) {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= step) {
      if (this.canStandAt(grid, target.x, target.y)) {
        this.x = target.x;
        this.y = target.y;
      }
      return true;
    }
    const nx = this.x + (dx / distance) * step;
    const ny = this.y + (dy / distance) * step;
    if (this.canStandAt(grid, nx, this.y)) this.x = nx;
    if (this.canStandAt(grid, this.x, ny)) this.y = ny;
    return false;
  }

  canStandAt(grid, x, y) {
    const r = GUARD_RADIUS - 2;
    return (
      isWalkable(grid, Math.floor((x - r) / TILE), Math.floor((y - r) / TILE))
      && isWalkable(grid, Math.floor((x + r) / TILE), Math.floor((y - r) / TILE))
      && isWalkable(grid, Math.floor((x - r) / TILE), Math.floor((y + r) / TILE))
      && isWalkable(grid, Math.floor((x + r) / TILE), Math.floor((y + r) / TILE))
    );
  }

  /** One-word label for the HUD and the marker above the guard. */
  get alertLabel() {
    if (this.state === GuardState.ALERT) return '!';
    if (this.suspicion >= SUSPICIOUS_AT) return '?';
    return '';
  }

  get coneColor() {
    if (this.state === GuardState.ALERT) return 'rgba(255, 74, 74, 0.20)';
    if (this.suspicion >= SUSPICIOUS_AT) return 'rgba(255, 166, 66, 0.18)';
    return 'rgba(255, 214, 106, 0.15)';
  }
}
