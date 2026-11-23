// Neon Harbor itself: a grid city on a bay, built once from a seed.
// Avenues run north-south, streets east-west; the east edge is beach and ocean,
// the south-east is the docks, downtown sits in the middle.
import { AVENUES, PALETTE, ROAD_W, STREETS, WORLD, pushCircleOutOfRect } from './config.js';

const ROOF_COLORS = [PALETTE.roofA, PALETTE.roofB, PALETTE.roofC, PALETTE.roofD, PALETTE.roofE];

function districtAt(x, y) {
  if (x > 2500 && y < 800) return 'Marina';
  if (y > 1750) return 'Docks';
  if (x >= 1000 && x <= 2200 && y >= 600 && y <= 1650) return 'Downtown';
  if (x < 700) return 'Old Town';
  if (y < 400) return 'Northside';
  return 'Midtown';
}

export function createWorld(rng) {
  const buildings = [];
  const parks = [];
  const trees = [];
  const parkingLots = [];
  const intersections = [];
  for (const x of AVENUES) for (const y of STREETS) intersections.push({ x, y });

  // Blocks between neighbouring roads.
  for (let ai = 0; ai < AVENUES.length - 1; ai += 1) {
    for (let si = 0; si < STREETS.length - 1; si += 1) {
      const x0 = AVENUES[ai] + ROAD_W / 2 + 12;
      const x1 = AVENUES[ai + 1] - ROAD_W / 2 - 12;
      const y0 = STREETS[si] + ROAD_W / 2 + 12;
      const y1 = STREETS[si + 1] - ROAD_W / 2 - 12;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const district = districtAt(cx, cy);
      const roll = rng.next();
      if (roll < 0.14) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, district });
        const count = Math.floor(rng.range(4, 9));
        for (let t = 0; t < count; t += 1) {
          trees.push({ x: rng.range(x0 + 14, x1 - 14), y: rng.range(y0 + 14, y1 - 14), r: rng.range(7, 12) });
        }
        continue;
      }
      if (roll < 0.24) { parkingLots.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, district }); continue; }
      const tall = district === 'Downtown';
      const n = tall ? 1 : rng.int(1, 3);
      for (let b = 0; b < n; b += 1) {
        const bw = tall ? (x1 - x0) * rng.range(0.62, 0.85) : ((x1 - x0) / n) * rng.range(0.6, 0.85);
        const bh = tall ? (y1 - y0) * rng.range(0.6, 0.8) : (y1 - y0) * rng.range(0.55, 0.85);
        const bx = n === 1 ? cx - bw / 2 : x0 + ((x1 - x0) / n) * b + ((x1 - x0) / n - bw) / 2;
        const by = y0 + (y1 - y0 - bh) / 2 + rng.range(-8, 8);
        buildings.push({
          x: bx, y: by, w: bw, h: bh,
          color: rng.pick(ROOF_COLORS),
          height: tall ? rng.int(26, 60) : rng.int(8, 22),
          district, roof: rng.int(0, 3),
        });
      }
    }
  }

  // Landmarks: named places the story and the minimap use.
  const landmarks = {
    safehouse: { x: 250, y: 2190, label: 'Safehouse' },
    bank: { x: 1460, y: 1010, label: 'Harbor Bank' },
    paintShop: { x: 820, y: 1850, label: 'Neon Paint' },
    hospital: { x: 560, y: 250, label: 'St. Anselm Hospital' },
    policeStation: { x: 1780, y: 730, label: 'Harbor PD' },
    docks: { x: 2560, y: 2220, label: 'Cargo Docks' },
    marina: { x: 2790, y: 420, label: 'Marina' },
    nightclub: { x: 1140, y: 1290, label: 'Club Mirage' },
  };

  function isRoad(x, y) {
    if (x < 0 || y < 0 || x > WORLD.w || y > WORLD.h) return false;
    for (const ax of AVENUES) if (Math.abs(x - ax) <= ROAD_W / 2) return true;
    for (const sy of STREETS) if (Math.abs(y - sy) <= ROAD_W / 2) return true;
    return false;
  }

  function inWater(x, y) { return x > 2920; }
  function onSand(x, y) { return x > 2830 && x <= 2920; }

  function collideCircle(c, r) {
    let hit = false;
    for (const b of buildings) {
      if (c.x + r < b.x || c.x - r > b.x + b.w || c.y + r < b.y || c.y - r > b.y + b.h) continue;
      if (pushCircleOutOfRect(c, r, b)) hit = true;
    }
    // World edge and the ocean are solid.
    if (c.x - r < 0) { c.x = r; hit = true; }
    if (c.y - r < 0) { c.y = r; hit = true; }
    if (c.x + r > 2920) { c.x = 2920 - r; hit = true; }
    if (c.y + r > WORLD.h) { c.y = WORLD.h - r; hit = true; }
    return hit;
  }

  function nearestIntersection(x, y) {
    let best = intersections[0], bestD = Infinity;
    for (const p of intersections) {
      const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  function randomRoadPoint() {
    if (rng.chance(0.5)) {
      return { x: rng.pick(AVENUES) + rng.range(-16, 16), y: rng.range(120, WORLD.h - 120) };
    }
    return { x: rng.range(120, 2820), y: rng.pick(STREETS) + rng.range(-16, 16) };
  }

  // Manhattan route between intersections, random axis order, as a waypoint list.
  function route(from, to) {
    const ai0 = AVENUES.indexOf(from.x), si0 = STREETS.indexOf(from.y);
    const ai1 = AVENUES.indexOf(to.x), si1 = STREETS.indexOf(to.y);
    const points = [];
    let ai = ai0, si = si0;
    const xFirst = rng.chance(0.5);
    const walkX = () => { while (ai !== ai1) { ai += ai1 > ai ? 1 : -1; points.push({ x: AVENUES[ai], y: STREETS[si] }); } };
    const walkY = () => { while (si !== si1) { si += si1 > si ? 1 : -1; points.push({ x: AVENUES[ai], y: STREETS[si] }); } };
    if (xFirst) { walkX(); walkY(); } else { walkY(); walkX(); }
    return points;
  }

  return {
    buildings, parks, trees, parkingLots, intersections, landmarks,
    isRoad, inWater, onSand, collideCircle, nearestIntersection, randomRoadPoint, route, districtAt,
    bounds: { ...WORLD },
  };
}
