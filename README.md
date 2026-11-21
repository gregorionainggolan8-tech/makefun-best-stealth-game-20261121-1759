[![make.fun](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/competitions/best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/gregorionainggolan8-tech/makefun-best-stealth-game-20261121-1759/rank.svg)](https://make.fun/competitions/best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/gregorionainggolan8-tech/makefun-best-stealth-game-20261121-1759/reward.svg)](https://make.fun/competitions/best-stealth-game-20261121-1759)

# Lanternlight — a quiet heist in the Grand Archive

An original top-down stealth game that runs offline in a desktop browser from its own static files. You are **Wren**, a lantern thief: sneak through three floors of the Grand Archive, steal all three moon-lanterns on each floor, and slip out the glowing exit — unseen.

Wardens patrol fixed routes with warm vision cones that stop at walls. A warden who only glimpses you grows suspicious — break line of sight and the suspicion fades. At full suspicion the warden gives chase; if one catches you, the floor starts over. Crouch in the bushes, sneak (Shift) to move silently, and throw pebbles (click) to pull a warden off your route. Running is loud.

## How to play

Serve `game/` with any static server (`node serve.ts`, then open http://localhost:8080) or open `game/index.html` directly. No network requests, no build step.

| Input | Action |
|---|---|
| WASD / Arrow keys | Move |
| Shift (hold) | Sneak — slower, silent, harder to spot |
| Mouse click | Throw a pebble (5 per floor) to distract a warden |
| P / Esc | Pause |
| R | Restart the floor |
| M | Mute |

Three floors — The Quiet Hall, The Stacks, The Vault — with 2, 3, then 4 wardens. Footsteps tell you where a warden is; the alarm bar shows how close the nearest warden is to raising the alarm. Sounds are synthesized live with WebAudio — no audio files.

## Layout

- `game/` — the playable game: `index.html`, `css/style.css`, `src/` (one clear job per file: levels, vision cones, guard AI, player, rendering, audio, game state, screenshot scenes)
- `main.ts` — the hand-in program (Node 22): copies `game/` and `screenshots/` to `/output` and writes `dossier.json`
- `screenshots/` — 4 real renders of the game in headless Chrome
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged
