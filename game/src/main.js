// main.js — Lanternlight's bootstrap: keyboard and mouse input, the fixed
// timestep loop, and the ?shot= scenes the screenshots are taken from.
// In shot mode the game is driven forward by its autopilot and frozen on
// one frame, so a screenshot is a deterministic render of real play.

import { Game, STEP } from './game.js';
import { applyShot } from './shots.js';

const game = new Game(document.getElementById('game-canvas'));
window.__game = game;

const input = { up: false, down: false, left: false, right: false, sneak: false };

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ShiftLeft: 'sneak', ShiftRight: 'sneak',
};

window.addEventListener('keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
    event.preventDefault();
  }
  const mapped = KEYMAP[event.code];
  if (mapped) {
    input[mapped] = true;
    game.sound.ensure();
    return;
  }
  if (event.code === 'Enter' || event.code === 'Space') {
    game.sound.ensure();
    game.primaryAction();
  } else if (event.code === 'KeyR') {
    game.restartLevel();
  } else if (event.code === 'KeyP' || event.code === 'Escape') {
    game.togglePause();
  } else if (event.code === 'KeyM') {
    const muted = game.sound.toggleMute();
    document.getElementById('hud-mute').textContent = muted ? 'Sound off (M)' : 'Sound on (M)';
  }
});

window.addEventListener('keyup', (event) => {
  const mapped = KEYMAP[event.code];
  if (mapped) input[mapped] = false;
});

window.addEventListener('blur', () => {
  input.up = input.down = input.left = input.right = input.sneak = false;
});

game.canvas.addEventListener('mousedown', (event) => {
  const rect = game.canvas.getBoundingClientRect();
  const scaleX = game.canvas.width / rect.width;
  const scaleY = game.canvas.height / rect.height;
  game.sound.ensure();
  game.clickAt((event.clientX - rect.left) * scaleX, (event.clientY - rect.top) * scaleY);
});

document.getElementById('overlay').addEventListener('click', () => {
  game.sound.ensure();
  game.primaryAction();
});

document.getElementById('hud-mute').addEventListener('click', () => {
  game.sound.ensure();
  const muted = game.sound.toggleMute();
  document.getElementById('hud-mute').textContent = muted ? 'Sound off (M)' : 'Sound on (M)';
});

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot) {
  applyShot(game, shot);
} else {
  let last = performance.now();
  let accumulator = 0;
  const frame = (now) => {
    const elapsed = Math.min(0.1, (now - last) / 1000);
    last = now;
    accumulator += elapsed;
    while (accumulator >= STEP) {
      game.update(STEP, input);
      accumulator -= STEP;
    }
    game.render();
    requestAnimationFrame(frame);
  };
  game.render();
  requestAnimationFrame(frame);
}
