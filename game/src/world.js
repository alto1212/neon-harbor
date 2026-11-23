// The city itself: a generated grid of avenues and streets, blocks of
// buildings, parks, a beachfront promenade and the ocean, plus the game
// state that lives on it. No drawing and no browser here, only data and
// the rules that move it.
import {
  AVENUES, BEACH_Y, BLOCK_H, BLOCK_W, DISTRICTS, MONEY, PALETTE,
  ROAD_W, STEP, STREETS, TUNE, WATER_Y, WORLD, clamp, dist2, pushCircleOutOfRect,
} from './config.js';

export const EVENT_SHOOT = 1;
export const EVENT_HIT = 2;
export const EVENT_PICKUP = 4;
export const EVENT_MISSION = 8;
export const EVENT_BUSTED = 16;
export const EVENT_WASTED = 32;
export const EVENT_CRASH = 64;
export const EVENT_STEAL = 128;

const ROOFS = [PALETTE.roofA, PALETTE.roofB, PALETTE.roofC, PALETTE.roofD, PALETTE.roofE];
const CAR_COLORS = ['#d94f3d', '#3d7dd9', '#e8e4da', '#2f2f38', '#d9a03d', '#5d8a4a', '#8a5fd0', '#c96f4a'];

function blockRect(ai, si) {
  return {
    x: AVENUES[ai] + ROAD_W / 2,
    y: STREETS[si] + ROAD_W / 2,
    w: AVENUES[ai + 1] - AVENUES[ai] - ROAD_W,
    h: STREETS[si + 1] - STREETS[si] - ROAD_W,
  };
}

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d.name;
  }
  return y >= BEACH_Y ? 'Beach' : 'Harbor';
}

export function isOnRoad(x, y) {
  if (y >= BEACH_Y) return false;
  for (const ax of AVENUES) if (Math.abs(x - ax) <= ROAD_W / 2) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) <= ROAD_W / 2) return true;
  return false;
}

export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const ax of AVENUES) {
    const d = Math.abs(x - ax);
    if (d < bestD && y < BEACH_Y) { bestD = d; best = { x: ax, y: clamp(y, 40, BEACH_Y - 40) }; }
  }
  for (const sy of STREETS) {
    const d = Math.abs(y - sy);
    if (d < bestD) { bestD = d; best = { x: clamp(x, 40, WORLD.w - 40), y: sy }; }
  }
  return best;
}

export function randomRoadPoint(random) {
  if (random() < 0.5) {
    const ax = AVENUES[Math.floor(random() * AVENUES.length)];
    return { x: ax, y: 60 + random() * (BEACH_Y - 120) };
  }
  const sy = STREETS[Math.floor(random() * STREETS.length)];
  return { x: 60 + random() * (WORLD.w - 120), y: sy };
}

export function createCity(random) {
  const buildings = [];
  const trees = [];
  const parks = [];
  const parkedSpots = [];

  // 56 blocks; a few become parks, a few become parking lots, the rest hold
  // one or two buildings each.
  for (let ai = 0; ai < AVENUES.length - 1; ai += 1) {
    for (let si = 0; si < STREETS.length - 1; si += 1) {
      const block = blockRect(ai, si);
      const roll = random();
      if (roll < 0.1) {
        parks.push({ x: block.x, y: block.y, w: block.w, h: block.h });
        for (let t = 0; t < 7; t += 1) {
          trees.push({ x: block.x + 20 + random() * (block.w - 40), y: block.y + 20 + random() * (block.h - 40), r: 9 + random() * 5 });
        }
        continue;
      }
      if (roll < 0.18) {
        for (let p = 0; p < 3; p += 1) {
          parkedSpots.push({ x: block.x + 40 + random() * (block.w - 80), y: block.y + 40 + random() * (block.h - 80), angle: random() < 0.5 ? 0 : Math.PI / 2 });
        }
        continue;
      }
      const two = random() < 0.45;
      const count = two ? 2 : 1;
      for (let b = 0; b < count; b += 1) {
        const bw = two ? (block.w - 24) / 2 : block.w - 28;
        const bh = two ? block.h - 28 : block.h - 28;
        const bx = block.x + 14 + (two ? b * (bw + 24) : 0);
        const by = block.y + 14;
        buildings.push({
          x: bx, y: by, w: bw, h: bh,
          roof: ROOFS[Math.floor(random() * ROOFS.length)],
          district: districtAt(bx + bw / 2, by + bh / 2),
        });
      }
      // A tree or two on the block's sidewalk corners.
      if (random() < 0.6) {
        trees.push({ x: block.x + 8, y: block.y + 8, r: 8 + random() * 4 });
      }
    }
  }
  // Palms along the beachfront promenade.
  for (let x = 120; x < WORLD.w - 60; x += 130) {
    trees.push({ x: x + (random() - 0.5) * 40, y: BEACH_Y - 26 - random() * 20, r: 10 + random() * 4 });
  }
  // Parked cars along a few roads too.
  for (let i = 0; i < 10; i += 1) {
    const p = randomRoadPoint(random);
    parkedSpots.push({ x: p.x + (random() < 0.5 ? -26 : 26), y: p.y, angle: 0 });
  }

  // 8 hidden cash stashes: parks, alleys and the beach.
  const stashes = [];
  for (let i = 0; i < 8; i += 1) {
    if (i < 3 && parks.length > 0) {
      const park = parks[i % parks.length];
      stashes.push({ x: park.x + 30 + random() * (park.w - 60), y: park.y + 30 + random() * (park.h - 60), taken: false });
    } else if (i < 6) {
      const block = blockRect(Math.floor(random() * (AVENUES.length - 1)), Math.floor(random() * (STREETS.length - 1)));
      stashes.push({ x: block.x + block.w / 2, y: block.y + block.h - 8, taken: false });
    } else {
      stashes.push({ x: 200 + random() * (WORLD.w - 400), y: BEACH_Y + 30 + random() * 50, taken: false });
    }
  }
  // 6 health kits on sidewalk corners near intersections.
  const healthKits = [];
  for (let i = 0; i < 6; i += 1) {
    const ax = AVENUES[1 + Math.floor(random() * (AVENUES.length - 2))];
    const sy = STREETS[Math.floor(random() * STREETS.length)];
    healthKits.push({ x: ax + 46, y: sy + 46, taken: false });
  }

  return { buildings, trees, parks, parkedSpots, stashes, healthKits };
}

// Push a circle out of every building and the map edges (and the water);
// returns true when anything blocked it.
export function collideCircle(city, c, r) {
  let hit = false;
  for (const b of city.buildings) {
    if (pushCircleOutOfRect(c, r, b)) hit = true;
  }
  if (c.x < r) { c.x = r; hit = true; }
  if (c.x > WORLD.w - r) { c.x = WORLD.w - r; hit = true; }
  if (c.y < r) { c.y = r; hit = true; }
  if (c.y > WATER_Y - r) { c.y = WATER_Y - r; hit = true; }
  return hit;
}

export function createState(city, random, save) {
  const state = {
    time: 0,
    money: save ? save.money : 0,
    hp: TUNE.playerHp,
    ammo: TUNE.pistolAmmo,
    ammoTimer: 0,
    wanted: 0,
    stars: 0,
    copTimer: 0,
    bustedTimer: 0,
    channelTimer: 0,
    events: 0,
    camera: { x: 0, y: 0 },
    shake: 0,
    player: {
      x: 1460, y: 1010, angle: -Math.PI / 2, onFoot: true, car: null,
      speed: 0, invuln: 0, punchTimer: 0, punchAngle: 0,
    },
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    stashes: city.stashes,
    healthKits: city.healthKits,
    mission: { index: -1, active: false, stage: 0, waypoint: null, timer: 0, text: '', targetCar: null },
    completed: save ? save.completed.slice() : [false, false, false, false, false],
    stats: { stolen: 0, shots: 0, earned: 0 },
  };
  if (save && save.stashes) {
    for (let i = 0; i < state.stashes.length && i < save.stashes.length; i += 1) {
      state.stashes[i].taken = !!save.stashes[i];
    }
  }
  return state;
}

export function randomCarColor(random) {
  return CAR_COLORS[Math.floor(random() * CAR_COLORS.length)];
}

export function makeCar(random, x, y, angle, kind) {
  return {
    id: Math.floor(random() * 1e9),
    x, y, angle, speed: 0,
    color: kind === 'cop' ? '#20242e' : randomCarColor(random),
    kind, // 'parked' | 'traffic' | 'cop' | 'player' | 'mission'
    driver: kind === 'traffic' ? 'ai' : 'none',
    hp: kind === 'cop' ? 120 : 100,
    route: null, routeIndex: 0, stuck: 0,
    smoke: 0, sirenPhase: random() * Math.PI * 2,
  };
}

export { MONEY, STEP };
export function distTo(a, b) { return Math.sqrt(dist2(a.x, a.y, b.x, b.y)); }
