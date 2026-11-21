// levels.js — the three hand-designed archive floors of "Lanternlight".
// Each map is 30 columns by 20 rows of one-character tiles:
//   # wall (blocks movement and sight)   . floor
//   B bush (hides the thief unless a warden is very close)
//   L moon-lantern (an objective to steal)   E exit door
//   P the thief's starting tile
// Guards are listed separately with their patrol waypoints in tile units;
// every waypoint must sit on a walkable tile and every lantern and the exit
// must be reachable from the start on foot.

export const TILE = 32;
export const COLS = 30;
export const ROWS = 20;

export const LEVELS = [
  {
    name: 'The Quiet Hall',
    intro: 'Three moon-lanterns hang in the hall. Take them all, then slip out the back door — unseen.',
    seed: 101,
    map: [
      '##############################',
      '#............#...............#',
      '#............#...............#',
      '#..P.........#......L........#',
      '#............#...............#',
      '#....####....#....####.......#',
      '#....####....#....####.......#',
      '#............................#',
      '#..B........######.........B.#',
      '#..B........######.........B.#',
      '#............................#',
      '#....####....#....####.......#',
      '#....####....#....####.......#',
      '#............................#',
      '#..L.........#......L........#',
      '#............#...............#',
      '#............#...............#',
      '#......B..........B..........#',
      '#..........................E.#',
      '##############################',
    ],
    guards: [
      { path: [[4, 7], [25, 7]], speed: 42, pause: 90 },
      { path: [[22, 2], [22, 17]], speed: 38, pause: 120 },
    ],
  },
  {
    name: 'The Stacks',
    intro: 'The shelves crowd the floor and a third warden walks them. Bushes are your friends — crouch in them.',
    seed: 202,
    map: [
      '##############################',
      '#..P.......#.......#.........#',
      '#..........#.......#....L....#',
      '#....B.....#...B...#.........#',
      '#..........#.......#.........#',
      '#####.######..#######.#####..#',
      '#............................#',
      '#..L........######.......B...#',
      '#...........######...........#',
      '#............................#',
      '#..####.....#.....####.......#',
      '#..####.....#.....####.......#',
      '#............................#',
      '#....B.....######....B...L...#',
      '#..........######............#',
      '#............................#',
      '#..####.....#.....####.......#',
      '#..####.....#.....####.....E.#',
      '#............................#',
      '##############################',
    ],
    guards: [
      { path: [[2, 6], [27, 6]], speed: 46, pause: 70 },
      { path: [[27, 1], [27, 18]], speed: 40, pause: 110 },
      { path: [[3, 15], [26, 15]], speed: 44, pause: 80 },
    ],
  },
  {
    name: 'The Vault',
    intro: 'Four wardens, little open floor, and the last lanterns of the archive. Patience wins this floor.',
    seed: 303,
    map: [
      '##############################',
      '#..P....#.......#.....#......#',
      '#.......#...B...#..B..#..L...#',
      '#.......#.......#.....#......#',
      '#..B....#.......#.....#......#',
      '####.####..#######.####.###..#',
      '#............................#',
      '#..L....#####.....####....B..#',
      '#.......#####.....####.......#',
      '#............................#',
      '######..#......#......######.#',
      '######..#......#......######.#',
      '#............................#',
      '#..B.....####....####....L...#',
      '#........####....####........#',
      '#............................#',
      '#...####....#.....####.......#',
      '#...####....#.....####....E..#',
      '#............................#',
      '##############################',
    ],
    guards: [
      { path: [[2, 6], [27, 6]], speed: 48, pause: 60 },
      { path: [[27, 9], [2, 9]], speed: 42, pause: 100 },
      { path: [[2, 12], [27, 12]], speed: 42, pause: 100 },
      { path: [[27, 15], [2, 15]], speed: 46, pause: 70 },
    ],
  },
];

/** Parse one level's map into a grid plus the points of interest. */
export function parseLevel(level) {
  const grid = level.map.map((row) => row.split(''));
  let start = null;
  let exit = null;
  const lanterns = [];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const tile = grid[y][x];
      if (tile === 'P') {
        start = { x, y };
        grid[y][x] = '.';
      } else if (tile === 'E') {
        exit = { x, y };
        grid[y][x] = '.';
      } else if (tile === 'L') {
        lanterns.push({ x, y, taken: false });
        grid[y][x] = '.';
      }
    }
  }
  return { grid, start, exit, lanterns };
}

/** True when tile (x, y) can be walked on (floor or bush). */
export function isWalkable(grid, x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
  return grid[y][x] !== '#';
}

/** True when tile (x, y) blocks sight. */
export function blocksSight(grid, x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return true;
  return grid[y][x] === '#';
}

/** True when the pixel point (px, py) is inside a bush tile. */
export function isInBush(grid, px, py) {
  const x = Math.floor(px / TILE);
  const y = Math.floor(py / TILE);
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
  return grid[y][x] === 'B';
}

/** Breadth-first walkable distance between two tiles, Infinity if cut off. */
export function tileDistance(grid, from, to) {
  if (!isWalkable(grid, to.x, to.y)) return Infinity;
  const seen = new Set([`${from.x},${from.y}`]);
  const queue = [{ x: from.x, y: from.y, d: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current.x === to.x && current.y === to.y) return current.d;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const key = `${nx},${ny}`;
      if (!seen.has(key) && isWalkable(grid, nx, ny)) {
        seen.add(key);
        queue.push({ x: nx, y: ny, d: current.d + 1 });
      }
    }
  }
  return Infinity;
}

/** Shortest walkable path between two tiles as a list of tiles (BFS). */
export function findPath(grid, from, to) {
  if (!isWalkable(grid, to.x, to.y)) return null;
  const cameFrom = new Map([[`${from.x},${from.y}`, null]]);
  const queue = [{ x: from.x, y: from.y }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current.x === to.x && current.y === to.y) {
      const path = [];
      let step = current;
      while (step) {
        path.unshift({ x: step.x, y: step.y });
        step = cameFrom.get(`${step.x},${step.y}`);
      }
      return path;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const key = `${nx},${ny}`;
      if (!cameFrom.has(key) && isWalkable(grid, nx, ny)) {
        cameFrom.set(key, current);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return null;
}
