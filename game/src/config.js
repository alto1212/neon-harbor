// Neon Harbor — tuning, palette and small math helpers.
// Original game: a sun-soaked coastal city, its own streets, cars and story.
export const STEP = 1 / 60;
export const WORLD = { w: 3200, h: 2400 };
export const ROAD_W = 72;
export const BLOCK_W = 248;
export const BLOCK_H = 208;

// Grid of avenues (x) and streets (y): road centre lines across the city.
export const AVENUES = [180, 500, 820, 1140, 1460, 1780, 2100, 2420, 2740];
export const STREETS = [170, 450, 730, 1010, 1290, 1570, 1850, 2130];

export const PALETTE = {
  asphalt: '#3d4149', asphaltDark: '#34383f', lane: '#d8c56a', curb: '#cbb98d',
  sidewalk: '#b3a284', grass: '#7fae62', parkDark: '#6f9c55', sand: '#e3cd9a',
  water: '#2e7f9e', waterDeep: '#256b87', roofA: '#c96f4a', roofB: '#4f8f8a',
  roofC: '#d9b36c', roofD: '#8a6f9e', roofE: '#5d7ea6', buildingEdge: '#2c2f36',
  wall: '#e8dcc3', glass: '#9fc6d8', tree: '#4e8a4a', treeDark: '#3d7040',
};

export const TUNE = {
  walkSpeed: 170, runSpeed: 265, playerRadius: 13, playerHp: 100,
  carAccel: 420, carBrake: 700, carReverse: 220, carMaxSpeed: 560,
  carTurn: 2.6, carGrip: 3.2, trafficSpeed: 150, copSpeed: 610,
  pistolDamage: 34, pistolRange: 420, pistolAmmo: 12, fistDamage: 12,
  wantedDecay: 9, copSpawnInterval: 2.2, maxCops: 6,
};

export const MONEY = { mission: [600, 900, 1400, 2200, 3500], package: 150, taxiFare: 120 };

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
export function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
// Push a circle out of an axis-aligned rect; returns true when it overlapped.
export function pushCircleOutOfRect(c, r, rect) {
  const nx = clamp(c.x, rect.x, rect.x + rect.w);
  const ny = clamp(c.y, rect.y, rect.y + rect.h);
  const dx = c.x - nx, dy = c.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    c.x = nx + (dx / d) * r;
    c.y = ny + (dy / d) * r;
  } else {
    // Centre inside the rect: push out along the smallest penetration.
    const left = c.x - rect.x, right = rect.x + rect.w - c.x;
    const top = c.y - rect.y, bottom = rect.y + rect.h - c.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) c.x = rect.x - r;
    else if (m === right) c.x = rect.x + rect.w + r;
    else if (m === top) c.y = rect.y - r;
    else c.y = rect.y + rect.h + r;
  }
  return true;
}
export function formatMoney(n) { return '$' + Math.floor(n).toLocaleString('en-US'); }
export function formatClock(seconds) {
  const h = Math.floor(seconds / 3600) % 24;
  const m = Math.floor(seconds / 60) % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
