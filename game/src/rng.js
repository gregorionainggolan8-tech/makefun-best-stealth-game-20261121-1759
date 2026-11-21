// rng.js — a tiny deterministic random-number generator (mulberry32).
// The game never calls Math.random in its logic, so a fixed seed always
// replays the same world: the same lantern flicker, the same speckle, the
// same screenshot.

/** Make a seeded generator that returns a float in [0, 1). */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick an integer in [min, max] from a seeded generator. */
export function randomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}
