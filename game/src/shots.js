// shots.js — the screenshot scenes behind ?shot=title|play|alert|win.
// Each scene plays the real game forward from a fresh floor with a fixed
// scripted pilot, so the frame is a moment of real play and the same scene
// always renders the same frame. No state is staged by hand.

import { TILE, findPath } from './levels.js';
import { canSee } from './vision.js';
import { GUARD_HALF_ANGLE, GUARD_RANGE } from './guard.js';

const STEP = 1 / 60;

/** Is tile (x, y) inside any warden's vision cone right now? */
function tileInCone(game, x, y) {
  const cx = x * TILE + TILE / 2;
  const cy = y * TILE + TILE / 2;
  return game.guards.some((guard) => canSee(
    game.grid, guard.x, guard.y, guard.facing, GUARD_HALF_ANGLE, GUARD_RANGE, cx, cy,
  ));
}

/** A path that avoids lit tiles when one exists, else the plain shortest. */
function safePath(game, from, to, forceDirect = false) {
  const direct = findPath(game.grid, from, to);
  if (!direct || forceDirect) return direct;
  const blocked = new Set();
  for (let y = 0; y < 20; y += 1) {
    for (let x = 0; x < 30; x += 1) {
      if (tileInCone(game, x, y)) blocked.add(`${x},${y}`);
    }
  }
  if (!direct.slice(1).some((tile) => blocked.has(`${tile.x},${tile.y}`))) return direct;
  // Breadth-first search that treats lit tiles as walls.
  const grid = game.grid.map((row, y) => row.map((tile, x) => (blocked.has(`${x},${y}`) ? '#' : tile)));
  return findPath(grid, from, to) ?? direct;
}

/** The nearest remaining lantern, else the exit. */
function nearestGoal(game) {
  const from = { x: Math.floor(game.player.x / TILE), y: Math.floor(game.player.y / TILE) };
  const remaining = game.lanterns.filter((lantern) => !lantern.taken);
  if (remaining.length > 0) {
    let best = null;
    let bestDistance = Infinity;
    for (const lantern of remaining) {
      const path = findPath(game.grid, from, lantern);
      if (path && path.length < bestDistance) {
        best = lantern;
        bestDistance = path.length;
      }
    }
    if (best) return { x: best.x, y: best.y };
  }
  return { x: game.exit.x, y: game.exit.y };
}

/** Is the committed goal still uncollected (a lantern) or the exit? */
function goalStillOpen(game, goal) {
  const lantern = game.lanterns.find((item) => item.x === goal.x && item.y === goal.y);
  return !lantern || !lantern.taken;
}

/**
 * One tick of the autopilot: steer toward the goal along a committed path.
 * The pilot commits to one goal and one route until the goal is taken or
 * the route is walked — recomputing either every few steps makes the thief
 * turn back each time a patrol's cone sweeps across the route. When the
 * next step is lit and a warden is near, it waits in the dark until the
 * cone moves on; patience beats a chase.
 */
function autopilotInput(game, mode, memory) {
  const input = { up: false, down: false, left: false, right: false, sneak: mode === 'cautious' };
  if (game.state !== 'playing') return input;
  const from = { x: Math.floor(game.player.x / TILE), y: Math.floor(game.player.y / TILE) };
  const goalChanged = !memory.goal || !goalStillOpen(game, memory.goal);
  if (goalChanged || !memory.path || memory.path.length === 0) {
    memory.goal = nearestGoal(game);
    memory.path = mode === 'cautious'
      ? safePath(game, from, memory.goal, memory.forceDirect)
      : findPath(game.grid, from, memory.goal);
    memory.forceDirect = false;
    memory.waited = 0;
    if (memory.path) memory.path.shift();
  }
  const next = memory.path?.[0];
  if (!next) return input;
  if (next.x === from.x && next.y === from.y) {
    memory.path.shift();
    return input;
  }
  // Stuck detector: barely moved for a while — drop the plan and walk the
  // direct route once instead of waiting on a route that never clears.
  const moved = Math.hypot(game.player.x - memory.lastX, game.player.y - memory.lastY);
  memory.stuckTicks = moved < 6 ? memory.stuckTicks + 1 : 0;
  memory.lastX = game.player.x;
  memory.lastY = game.player.y;
  if (memory.stuckTicks > 150) {
    memory.path = null;
    memory.forceDirect = true;
    memory.stuckTicks = 0;
    return input;
  }
  const cx = next.x * TILE + TILE / 2;
  const cy = next.y * TILE + TILE / 2;
  const dx = cx - game.player.x;
  const dy = cy - game.player.y;
  if (mode === 'cautious') {
    const nearGuard = game.guards.some(
      (guard) => Math.hypot(guard.x - game.player.x, guard.y - game.player.y) < 130,
    );
    // Wait out a lit step while a warden is near — but never wait standing
    // in the light itself; then moving on is safer than standing still.
    if (tileInCone(game, next.x, next.y) && nearGuard && !tileInCone(game, from.x, from.y)) {
      memory.waited += 1;
      if (memory.waited < 600) return input;
    }
    memory.waited = 0;
  }
  // Steer on both axes at once: moving on one axis first strands the thief
  // against a wall corner when the other axis would clear it.
  if (Math.abs(dx) > 6) input[dx > 0 ? 'right' : 'left'] = true;
  if (Math.abs(dy) > 6) input[dy > 0 ? 'down' : 'up'] = true;
  return input;
}

/** Run the game forward `ticks` times with the autopilot driving. */
function runPilot(game, mode, ticks, stopWhen) {
  const memory = {
    goal: null, path: null, waited: 0,
    lastX: game.player.x, lastY: game.player.y, stuckTicks: 0, forceDirect: false,
  };
  for (let tick = 0; tick < ticks; tick += 1) {
    if (stopWhen && stopWhen(game, tick)) break;
    const input = autopilotInput(game, mode, memory);
    game.update(STEP, input);
    if (game.state !== 'playing') break;
  }
}

/** Build one screenshot scene, then freeze it for the camera. */
export function applyShot(game, name) {
  if (name === 'title') {
    game.state = 'title';
    game.showTitle();
    game.render();
    return;
  }
  game.startGame();
  game.sound.muted = true;
  if (name === 'play') {
    // Fourteen seconds of careful sneaking: mid-floor, cones in view.
    runPilot(game, 'cautious', 14 * 60);
  } else if (name === 'alert') {
    // Walk straight into a warden's lamp until it grows suspicious.
    runPilot(game, 'bold', 10 * 60, (g) => g.maxSuspicion >= 55);
  } else if (name === 'win') {
    // Patient the whole way: steal all three lanterns and reach the exit.
    runPilot(game, 'cautious', 300 * 60);
  }
  game.render();
  game.updateHud();
}
