// render.js — everything the eye sees, drawn on one 2D canvas.
// Stone floor, raised walls, bushes to crouch in, warm vision cones that
// stop at walls, a thief with a small pool of light, and a night darkness
// that only lanterns, the exit and the thief's own lamp push back — so the
// picture itself tells the player what is safe.

import { COLS, ROWS, TILE } from './levels.js';
import { mulberry32 } from './rng.js';
import { GUARD_HALF_ANGLE, GUARD_RANGE } from './guard.js';
import { conePolygon } from './vision.js';

const WIDTH = COLS * TILE;
const HEIGHT = ROWS * TILE;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.ctx = canvas.getContext('2d');
    this.darkness = document.createElement('canvas');
    this.darkness.width = WIDTH;
    this.darkness.height = HEIGHT;
    this.speckles = [];
    this.flames = [];
  }

  /** Precompute the floor's deterministic speckle and each lantern's flame. */
  prepareLevel(level, lanterns) {
    const random = mulberry32(level.seed);
    this.speckles = [];
    for (let i = 0; i < 260; i += 1) {
      this.speckles.push({
        x: random() * WIDTH,
        y: random() * HEIGHT,
        r: 0.8 + random() * 1.8,
        light: random() > 0.5,
      });
    }
    this.flames = lanterns.map(() => ({ phase: random() * Math.PI * 2, speed: 2.2 + random() * 1.4 }));
  }

  draw(world, time) {
    const { ctx } = this;
    const { grid, player, guards, lanterns, exit, exitOpen } = world;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    this.drawFloor(ctx, grid, time);
    this.drawExit(ctx, exit, exitOpen, time);
    this.drawLanterns(ctx, lanterns, time);
    this.drawPlayer(ctx, player, time);
    this.drawGuards(ctx, guards);
    this.drawPebbles(ctx, world.pebbles, time);
    this.drawDarkness(ctx, world, time);
    this.drawCones(ctx, grid, guards);
    this.drawMarkers(ctx, guards);
    this.drawVignette(ctx);
  }

  drawFloor(ctx, grid, time) {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const px = x * TILE;
        const py = y * TILE;
        const tile = grid[y][x];
        if (tile === '#') {
          ctx.fillStyle = '#414b68';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#525d7d';
          ctx.fillRect(px, py, TILE, 6);
          ctx.fillStyle = '#2b3247';
          ctx.fillRect(px, py + TILE - 4, TILE, 4);
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
        } else if (tile === 'B') {
          ctx.fillStyle = '#20291f';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#2e4a2c';
          for (let i = 0; i < 5; i += 1) {
            const ox = 5 + ((i * 13 + x * 7 + y * 3) % 22);
            const oy = 5 + ((i * 17 + x * 5 + y * 11) % 22);
            ctx.beginPath();
            ctx.arc(px + ox, py + oy, 5.5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#55763f';
          ctx.beginPath();
          ctx.arc(px + 16, py + 14, 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = (x + y) % 2 === 0 ? '#2a3247' : '#272e42';
          ctx.fillRect(px, py, TILE, TILE);
        }
      }
    }
    for (const s of this.speckles) {
      ctx.fillStyle = s.light ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.16)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    void time;
  }

  drawExit(ctx, exit, open, time) {
    const cx = exit.x * TILE + TILE / 2;
    const cy = exit.y * TILE + TILE / 2;
    const pulse = 0.75 + Math.sin(time * 2.4) * 0.25;
    const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 46);
    if (open) {
      glow.addColorStop(0, `rgba(110, 255, 150, ${0.55 * pulse})`);
      glow.addColorStop(1, 'rgba(110, 255, 150, 0)');
    } else {
      glow.addColorStop(0, 'rgba(120, 130, 150, 0.25)');
      glow.addColorStop(1, 'rgba(120, 130, 150, 0)');
    }
    ctx.fillStyle = glow;
    ctx.fillRect(cx - 46, cy - 46, 92, 92);
    ctx.fillStyle = open ? '#1f7a44' : '#3a4152';
    ctx.fillRect(cx - 13, cy - 15, 26, 30);
    ctx.fillStyle = open ? '#7dffab' : '#5a6274';
    ctx.fillRect(cx - 9, cy - 11, 18, 22);
    ctx.fillStyle = open ? '#0d3d20' : '#2c3242';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(open ? '➤' : '✕', cx, cy + 1);
    ctx.fillStyle = open ? '#b8ffcf' : '#8a93a6';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('EXIT', cx, cy + 26);
  }

  drawLanterns(ctx, lanterns, time) {
    lanterns.forEach((lantern, i) => {
      if (lantern.taken) return;
      const cx = lantern.x * TILE + TILE / 2;
      const cy = lantern.y * TILE + TILE / 2;
      const flame = this.flames[i] ?? { phase: 0, speed: 2.5 };
      const flicker = 0.8 + Math.sin(time * flame.speed + flame.phase) * 0.2;
      const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 44);
      glow.addColorStop(0, `rgba(255, 196, 92, ${0.6 * flicker})`);
      glow.addColorStop(1, 'rgba(255, 196, 92, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - 44, cy - 44, 88, 88);
      ctx.fillStyle = '#8a6a2a';
      ctx.fillRect(cx - 1, cy + 4, 2, 8);
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath();
      ctx.arc(cx, cy - 2, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      ctx.arc(cx, cy - 3, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawPlayer(ctx, player, time) {
    const bob = player.moving ? Math.sin(time * (player.sneaking ? 7 : 11)) * 1.5 : 0;
    const cx = player.x;
    const cy = player.y + bob;
    const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 52);
    glow.addColorStop(0, 'rgba(94, 234, 212, 0.30)');
    glow.addColorStop(1, 'rgba(94, 234, 212, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - 52, cy - 52, 104, 104);
    // Hooded cloak: a teal circle with a darker hood and a lamp dot.
    ctx.fillStyle = '#0f766e';
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#14b8a6';
    ctx.beginPath();
    ctx.arc(cx, cy - 2, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b3f3a';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(player.facing) * 4, cy + Math.sin(player.facing) * 4 - 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(player.facing) * 9, cy + Math.sin(player.facing) * 9, 2.2, 0, Math.PI * 2);
    ctx.fill();
    if (player.sneaking) {
      ctx.strokeStyle = 'rgba(94, 234, 212, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 15, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawGuards(ctx, guards) {
    for (const guard of guards) {
      const alerted = guard.state === 'alert';
      ctx.fillStyle = alerted ? '#dc2626' : '#d97706';
      ctx.beginPath();
      ctx.arc(guard.x, guard.y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = alerted ? '#fca5a5' : '#fbbf24';
      ctx.beginPath();
      ctx.arc(guard.x, guard.y - 1, 8.5, 0, Math.PI * 2);
      ctx.fill();
      // The warden's own lamp, pointing where it looks.
      ctx.fillStyle = '#fff7cc';
      ctx.beginPath();
      ctx.arc(guard.x + Math.cos(guard.facing) * 10, guard.y + Math.sin(guard.facing) * 10, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(guard.x, guard.y, 13, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawPebbles(ctx, pebbles, time) {
    for (const pebble of pebbles) {
      const progress = 1 - pebble.flight / 0.35;
      const x = pebble.fromX + (pebble.x - pebble.fromX) * progress;
      const y = pebble.fromY + (pebble.y - pebble.fromY) * progress - Math.sin(progress * Math.PI) * 18;
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (pebble.flight <= 0) {
        const ring = 1 - pebble.ringAge / 0.6;
        if (ring > 0) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 * ring})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pebble.x, pebble.y, (1 - ring) * 46 + 6, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    void time;
  }

  drawDarkness(ctx, world, time) {
    const dark = this.darkness.getContext('2d');
    dark.clearRect(0, 0, WIDTH, HEIGHT);
    dark.fillStyle = 'rgba(5, 8, 16, 0.48)';
    dark.fillRect(0, 0, WIDTH, HEIGHT);
    dark.globalCompositeOperation = 'destination-out';
    const punch = (x, y, radius, strength) => {
      const glow = dark.createRadialGradient(x, y, 4, x, y, radius);
      glow.addColorStop(0, `rgba(0,0,0,${strength})`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      dark.fillStyle = glow;
      dark.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };
    punch(world.player.x, world.player.y, 150, 0.95);
    for (const lantern of world.lanterns) {
      if (lantern.taken) continue;
      punch(lantern.x * TILE + TILE / 2, lantern.y * TILE + TILE / 2, 95, 0.85);
    }
    punch(world.exit.x * TILE + TILE / 2, world.exit.y * TILE + TILE / 2, 105, 0.8);
    for (const guard of world.guards) {
      punch(guard.x, guard.y, 72, 0.55);
    }
    dark.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.darkness, 0, 0);
    void time;
  }

  drawCones(ctx, grid, guards) {
    for (const guard of guards) {
      const polygon = conePolygon(grid, guard.x, guard.y, guard.facing, GUARD_HALF_ANGLE, GUARD_RANGE);
      ctx.fillStyle = guard.coneColor;
      ctx.beginPath();
      ctx.moveTo(polygon[0].x, polygon[0].y);
      for (let i = 1; i < polygon.length; i += 1) ctx.lineTo(polygon[i].x, polygon[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = guard.state === 'alert' ? 'rgba(255, 120, 120, 0.5)' : 'rgba(255, 220, 130, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  drawMarkers(ctx, guards) {
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const guard of guards) {
      const label = guard.alertLabel;
      if (!label) continue;
      ctx.fillStyle = guard.state === 'alert' ? '#ff5a5a' : '#ffb020';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeText(label, guard.x, guard.y - 24);
      ctx.fillText(label, guard.x, guard.y - 24);
    }
  }

  drawVignette(ctx) {
    const gradient = ctx.createRadialGradient(
      WIDTH / 2, HEIGHT / 2, HEIGHT * 0.42,
      WIDTH / 2, HEIGHT / 2, HEIGHT * 0.85,
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}
