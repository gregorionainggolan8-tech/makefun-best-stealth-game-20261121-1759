// game.js — Lanternlight's state machine: title, playing, paused, caught,
// level clear and the final escape. It owns the level, the thief, the
// wardens, the pebbles in the air, the timer and the HUD, and it is the
// `world` the guards and the player talk to.

import { LEVELS, TILE, parseLevel, isInBush } from './levels.js';
import { Guard, GUARD_RADIUS } from './guard.js';
import { Player, NOISE_RADIUS_WALK, PEBBLE_NOISE_RADIUS } from './player.js';
import { Renderer } from './render.js';
import { SoundBank } from './audio.js';

const STEP = 1 / 60;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.sound = new SoundBank();
    this.state = 'title';
    this.levelIndex = 0;
    this.totalTime = 0;
    this.alertsTriggered = 0;
    this.lanternsStolen = 0;
    this.pebbles = [];
    this.guardSteps = new Map();
    this.noiseCooldown = 0;
    this.time = 0;
    this.loadLevel(0);
    this.showTitle();
  }

  get grid() {
    return this.level.grid;
  }

  get player() {
    return this.playerEntity;
  }

  get guards() {
    return this.guardEntities;
  }

  get lanterns() {
    return this.level.lanterns;
  }

  get exit() {
    return this.level.exit;
  }

  get exitOpen() {
    return this.lanterns.every((lantern) => lantern.taken);
  }

  get playerInBush() {
    return isInBush(this.grid, this.playerEntity.x, this.playerEntity.y);
  }

  get maxSuspicion() {
    return Math.max(0, ...this.guardEntities.map((guard) => guard.suspicion));
  }

  loadLevel(index) {
    this.levelIndex = index;
    const def = LEVELS[index];
    this.level = parseLevel(def);
    this.playerEntity = new Player(this.level.start);
    this.guardEntities = def.guards.map((guardDef) => new Guard(guardDef));
    this.pebbles = [];
    this.guardSteps = new Map();
    this.renderer.prepareLevel(def, this.level.lanterns);
    this.updateHud();
  }

  startGame() {
    this.totalTime = 0;
    this.alertsTriggered = 0;
    this.lanternsStolen = 0;
    this.loadLevel(0);
    this.state = 'playing';
    this.hideOverlay();
    this.sound.ensure();
    this.sound.click();
  }

  nextLevel() {
    this.loadLevel(this.levelIndex + 1);
    this.state = 'playing';
    this.hideOverlay();
    this.sound.click();
  }

  restartLevel() {
    this.loadLevel(this.levelIndex);
    this.state = 'playing';
    this.hideOverlay();
    this.sound.click();
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.showPaused();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.hideOverlay();
    }
  }

  /** The primary action for the overlay on screen: Enter or a click. */
  primaryAction() {
    if (this.state === 'title') this.startGame();
    else if (this.state === 'levelClear') this.nextLevel();
    else if (this.state === 'caught') this.restartLevel();
    else if (this.state === 'won') this.startGame();
    else if (this.state === 'paused') this.togglePause();
  }

  /** One fixed tick of play. `input` is the held-keys object. */
  update(dt, input) {
    if (this.state !== 'playing') return;
    this.time += dt;
    this.totalTime += dt;
    this.playerEntity.update(dt, input, this);
    this.updateGuardSteps(dt);
    this.updateNoise(dt);
    this.updatePebbles(dt);
    this.updatePickups();
    this.updateHud();
  }

  updateGuardSteps(dt) {
    for (const guard of this.guardEntities) {
      const before = { x: guard.x, y: guard.y };
      guard.update(dt, this);
      const moved = Math.hypot(guard.x - before.x, guard.y - before.y);
      const walked = (this.guardSteps.get(guard) ?? 0) + moved;
      if (walked > 20) {
        this.guardSteps.set(guard, 0);
        const distance = Math.hypot(guard.x - this.playerEntity.x, guard.y - this.playerEntity.y);
        this.sound.footstep(true, distance);
      } else {
        this.guardSteps.set(guard, walked);
      }
    }
  }

  updateNoise(dt) {
    this.noiseCooldown -= dt;
    const player = this.playerEntity;
    if (!player.moving || player.sneaking || this.noiseCooldown > 0) return;
    this.noiseCooldown = 0.25;
    for (const guard of this.guardEntities) {
      const distance = Math.hypot(guard.x - player.x, guard.y - player.y);
      if (distance < NOISE_RADIUS_WALK) guard.hearNoise(player.x, player.y);
    }
  }

  updatePebbles(dt) {
    for (const pebble of this.pebbles) {
      if (pebble.flight > 0) {
        pebble.flight -= dt;
        if (pebble.flight <= 0) {
          pebble.ringAge = 0;
          for (const guard of this.guardEntities) {
            const distance = Math.hypot(guard.x - pebble.x, guard.y - pebble.y);
            if (distance < PEBBLE_NOISE_RADIUS) guard.hearNoise(pebble.x, pebble.y);
          }
        }
      } else if (pebble.ringAge < 0.6) {
        pebble.ringAge += dt;
      }
    }
    this.pebbles = this.pebbles.filter((pebble) => pebble.ringAge < 0.6);
  }

  updatePickups() {
    const player = this.playerEntity;
    for (const lantern of this.lanterns) {
      if (lantern.taken) continue;
      const cx = lantern.x * TILE + TILE / 2;
      const cy = lantern.y * TILE + TILE / 2;
      if (Math.hypot(player.x - cx, player.y - cy) < 22) {
        lantern.taken = true;
        this.lanternsStolen += 1;
        this.sound.lantern();
      }
    }
    if (this.exitOpen) {
      const cx = this.exit.x * TILE + TILE / 2;
      const cy = this.exit.y * TILE + TILE / 2;
      if (Math.hypot(player.x - cx, player.y - cy) < 18) this.completeLevel();
    }
  }

  completeLevel() {
    this.sound.levelClear();
    if (this.levelIndex + 1 >= LEVELS.length) {
      this.state = 'won';
      this.showWon();
    } else {
      this.state = 'levelClear';
      this.showLevelClear();
    }
  }

  /** A warden's suspicion just hit the top: the alarm is up. */
  onAlert() {
    this.alertsTriggered += 1;
    this.sound.alert();
    this.updateHud();
  }

  /** A warden laid a hand on the thief. */
  onCaught() {
    if (this.state !== 'playing') return;
    this.state = 'caught';
    this.sound.caught();
    this.showCaught();
  }

  /** The thief's own footstep: soft, and only when walking upright. */
  onFootstep() {
    this.sound.footstep(false, 220);
  }

  /** Throw a pebble at canvas pixel (x, y). */
  clickAt(x, y) {
    if (this.state !== 'playing') return;
    const landing = this.playerEntity.throwPebble(x, y);
    if (!landing) return;
    this.sound.pebble();
    this.pebbles.push({
      fromX: this.playerEntity.x,
      fromY: this.playerEntity.y,
      x: landing.x,
      y: landing.y,
      flight: landing.flight,
      ringAge: 0,
    });
    this.updateHud();
  }

  render() {
    this.renderer.draw(this, this.time);
  }

  // ---- HUD and overlays (plain DOM, so the text stays crisp) ----

  $(id) {
    return document.getElementById(id);
  }

  formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const rest = Math.floor(seconds % 60);
    return `${minutes}:${String(rest).padStart(2, '0')}`;
  }

  updateHud() {
    const level = LEVELS[this.levelIndex];
    this.$('hud-level').textContent = `Level ${this.levelIndex + 1} / ${LEVELS.length} — ${level.name}`;
    const taken = this.lanterns.filter((lantern) => lantern.taken).length;
    this.$('hud-lanterns').textContent = `Lanterns ${'●'.repeat(taken)}${'○'.repeat(this.lanterns.length - taken)}`;
    this.$('hud-pebbles').textContent = `Pebbles ${this.playerEntity.pebbles}`;
    const suspicion = Math.round(this.maxSuspicion);
    const bar = this.$('hud-suspicion');
    bar.style.width = `${suspicion}%`;
    bar.className = suspicion >= 100 ? 'bar alert' : suspicion >= 25 ? 'bar wary' : 'bar calm';
    const status = this.$('hud-status');
    if (this.guards.some((guard) => guard.state === 'alert')) {
      status.textContent = 'ALERT — run, hide, break line of sight!';
      status.className = 'status alert';
    } else if (suspicion >= 25) {
      status.textContent = 'Suspicious — a warden saw something…';
      status.className = 'status wary';
    } else {
      status.textContent = 'Unseen';
      status.className = 'status calm';
    }
    this.$('hud-time').textContent = this.formatTime(this.totalTime);
    this.$('hud-objective').textContent = this.exitOpen
      ? 'All lanterns stolen — reach the glowing EXIT!'
      : 'Steal the moon-lanterns, then reach the EXIT unseen.';
  }

  setOverlay(html) {
    const overlay = this.$('overlay');
    overlay.innerHTML = html;
    overlay.classList.remove('hidden');
  }

  hideOverlay() {
    this.$('overlay').classList.add('hidden');
  }

  showTitle() {
    this.setOverlay(`
      <h1>LANTERNLIGHT</h1>
      <p class="tagline">A quiet heist in the Grand Archive</p>
      <p>You are <b>Wren</b>, a lantern thief. The Grand Archive keeps three
      moon-lanterns on every floor, watched by wardens with lamps and sharp eyes.
      Steal all three, then slip out the glowing exit — unseen.</p>
      <p class="controls">WASD / Arrows — move &nbsp;·&nbsp; Shift — sneak (slow, silent, harder to spot)<br>
      Click — throw a pebble to distract a warden &nbsp;·&nbsp; P — pause &nbsp;·&nbsp; M — mute &nbsp;·&nbsp; R — restart</p>
      <p class="hint">Crouch in the bushes. A warden who only glimpses you grows suspicious —
      break line of sight and the suspicion fades. Running is loud.</p>
      <p class="action">Press Enter or click to begin</p>`);
  }

  showPaused() {
    this.setOverlay(`
      <h1>PAUSED</h1>
      <p class="tagline">The archive holds its breath.</p>
      <p class="action">Press P or click to keep sneaking</p>`);
  }

  showLevelClear() {
    const next = LEVELS[this.levelIndex + 1];
    this.setOverlay(`
      <h1>FLOOR CLEARED</h1>
      <p class="tagline">${LEVELS[this.levelIndex].name} — slipped past every warden</p>
      <p>Time ${this.formatTime(this.totalTime)} · Lanterns stolen ${this.lanternsStolen} ·
      Alarms raised ${this.alertsTriggered}</p>
      <p>Next floor: <b>${next.name}</b> — ${next.intro}</p>
      <p class="action">Press Enter or click for the next floor</p>`);
  }

  showCaught() {
    this.setOverlay(`
      <h1>CAUGHT!</h1>
      <p class="tagline">A warden's lamp found you in the dark.</p>
      <p>${LEVELS[this.levelIndex].name} · Time ${this.formatTime(this.totalTime)} ·
      Lanterns stolen ${this.lanternsStolen}</p>
      <p class="hint">Tip: wait for a patrol to turn away, sneak through its cone,
      and throw a pebble to pull a warden off your route.</p>
      <p class="action">Press R or click to try the floor again</p>`);
  }

  showWon() {
    this.setOverlay(`
      <h1>THE QUIET ESCAPE</h1>
      <p class="tagline">Every moon-lantern is yours. Dawn finds the archive empty.</p>
      <p>All ${LEVELS.length} floors cleared in ${this.formatTime(this.totalTime)} ·
      ${this.lanternsStolen} lanterns stolen · Alarms raised ${this.alertsTriggered}</p>
      <p class="action">Press Enter or click to steal again</p>`);
  }
}

export { STEP };
