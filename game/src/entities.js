// People and cars: the player on foot, drivable cars with arcade physics,
// traffic that follows the road grid, and pedestrians on the sidewalks.
import { ROAD_W, TUNE, angleLerp, angleTo, clamp, dist2 } from './config.js';

export const CAR_DEFS = {
  sedan: { name: 'Sedan', len: 46, wid: 22, maxSpeed: 430, accel: 380, turn: 2.5, colors: ['#c94f4f', '#4f7ec9', '#c9a44f', '#7a7f8a', '#5da87a'] },
  taxi: { name: 'Taxi', len: 46, wid: 22, maxSpeed: 440, accel: 390, turn: 2.5, colors: ['#e8b93c'] },
  truck: { name: 'Truck', len: 64, wid: 26, maxSpeed: 320, accel: 260, turn: 1.9, colors: ['#8a6f4d', '#5d7ea6', '#9aa0a8'] },
  sports: { name: 'Sports', len: 46, wid: 21, maxSpeed: 640, accel: 540, turn: 3.0, colors: ['#e84a7a', '#39c0d8', '#f2f2f2', '#ff8c42'] },
  police: { name: 'Patrol', len: 48, wid: 22, maxSpeed: 660, accel: 560, turn: 2.9, colors: ['#22262e'] },
  van: { name: 'Van', len: 54, wid: 24, maxSpeed: 360, accel: 300, turn: 2.1, colors: ['#b8b0a0', '#7a8a99'] },
};

const PED_SHIRTS = ['#e86a6a', '#6a9ae8', '#e8c96a', '#7ac98a', '#c96ac9', '#e8e8e8', '#6ad8c9', '#f08c4a'];

export function createCar(defName, x, y, angle, color) {
  const def = CAR_DEFS[defName];
  return {
    kind: 'car', def: defName, name: def.name,
    x, y, angle, speed: 0, hp: 100, maxHp: 100,
    color: color || def.colors[0], len: def.len, wid: def.wid,
    smoke: 0, dead: false, siren: defName === 'police',
  };
}

export function createPerson(x, y, opts) {
  const o = opts || {};
  return {
    kind: 'person', x, y, angle: o.angle || 0, hp: o.hp || 100, maxHp: o.hp || 100,
    speed: 0, shirt: o.shirt || PED_SHIRTS[Math.floor(Math.random() * PED_SHIRTS.length)],
    state: 'walk', target: null, fleeT: 0, downT: 0, armed: !!o.armed, gang: !!o.gang,
    radius: 12,
  };
}

export function createPlayer(x, y) {
  return {
    kind: 'player', x, y, angle: -Math.PI / 2, hp: 100, maxHp: 100,
    money: 250, weapon: 'fists', ammo: 0, inCar: null, invuln: 0,
    radius: 13, runT: 0,
  };
}

// --- car physics: arcade, top-down ---
export function driveCar(car, drive, dt, world, others) {
  const def = CAR_DEFS[car.def];
  if (drive.throttle > 0) car.speed += def.accel * dt;
  else if (drive.throttle < 0) {
    car.speed -= (car.speed > 30 ? TUNE.carBrake : TUNE.carReverse) * dt;
  } else {
    car.speed -= car.speed * 1.1 * dt;
    if (Math.abs(car.speed) < 4) car.speed = 0;
  }
  car.speed = clamp(car.speed, -def.maxSpeed * 0.45, def.maxSpeed);
  const steerAuthority = clamp(Math.abs(car.speed) / 160, 0, 1) * Math.sign(car.speed || 1);
  car.angle += drive.steer * def.turn * steerAuthority * dt;
  if (drive.brake) car.speed *= Math.max(0, 1 - 4 * dt);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  car.x = nx; car.y = ny;
  // Buildings: two circles (nose and tail) so long cars cannot clip corners.
  const fx = car.x + Math.cos(car.angle) * car.len * 0.28;
  const fy = car.y + Math.sin(car.angle) * car.len * 0.28;
  const bx = car.x - Math.cos(car.angle) * car.len * 0.28;
  const by = car.y - Math.sin(car.angle) * car.len * 0.28;
  const front = { x: fx, y: fy }, back = { x: bx, y: by };
  const hitF = world.collideCircle(front, car.wid * 0.55);
  const hitB = world.collideCircle(back, car.wid * 0.55);
  if (hitF || hitB) {
    const impact = Math.abs(car.speed);
    car.x = (front.x + back.x) / 2;
    car.y = (front.y + back.y) / 2;
    if (impact > 220) damageCar(car, impact * 0.06);
    car.speed *= 0.45;
  }
  // Other cars: soft push-apart circles.
  for (const other of others) {
    if (other === car || other.dead) continue;
    const d2 = dist2(car.x, car.y, other.x, other.y);
    const min = (car.len + other.len) / 2 - 6;
    if (d2 < min * min && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const ux = (car.x - other.x) / d, uy = (car.y - other.y) / d;
      car.x += ux * push; car.y += uy * push;
      other.x -= ux * push; other.y -= uy * push;
      const rel = Math.abs(car.speed - other.speed);
      if (rel > 160) { damageCar(car, rel * 0.03); damageCar(other, rel * 0.03); }
      car.speed *= 0.85; other.speed *= 0.85;
    }
  }
  if (car.hp < 35) car.smoke = Math.min(1, car.smoke + dt * 0.5);
  else car.smoke = Math.max(0, car.smoke - dt);
  return car;
}

export function damageCar(car, amount) {
  if (car.dead) return false;
  car.hp -= amount;
  if (car.hp <= 0) { car.hp = 0; car.dead = true; return true; }
  return false;
}

export function nearestCar(cars, x, y, maxDist) {
  let best = null, bestD = maxDist * maxDist;
  for (const car of cars) {
    if (car.dead) continue;
    const d = dist2(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

// --- traffic: cars that follow the road grid ---
export function createTraffic(world, rng, count) {
  const list = [];
  const defs = ['sedan', 'sedan', 'taxi', 'van', 'truck', 'sports'];
  for (let i = 0; i < count; i += 1) {
    const p = world.randomRoadPoint();
    const car = createCar(rng.pick(defs), p.x, p.y, rng.next() * Math.PI * 2);
    car.speed = TUNE.trafficSpeed * rng.range(0.7, 1);
    list.push({ car, waypoints: [], target: null, wait: rng.range(0, 2) });
  }
  return list;
}

export function updateTraffic(list, dt, world, rng, allCars) {
  for (const t of list) {
    const car = t.car;
    if (car.dead) continue;
    if (t.wait > 0) { t.wait -= dt; car.speed *= 0.9; continue; }
    if (!t.target) {
      const from = world.nearestIntersection(car.x, car.y);
      const to = world.randomRoadPoint();
      const dest = world.nearestIntersection(to.x, to.y);
      t.waypoints = world.route(from, dest);
      t.target = t.waypoints.shift() || null;
      if (!t.target) { t.wait = 1; continue; }
    }
    const desired = angleTo(car.x, car.y, t.target.x, t.target.y);
    let diff = desired - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = clamp(diff * 2.2, -1, 1);
    // Slow for a car ahead.
    let ahead = false;
    for (const other of allCars) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x, dy = other.y - car.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 64 && Math.abs(angleTo(car.x, car.y, other.x, other.y) - car.angle) < 0.6) { ahead = true; break; }
    }
    const targetSpeed = ahead ? 0 : TUNE.trafficSpeed;
    driveCar(car, { throttle: car.speed < targetSpeed ? 1 : 0, steer, brake: ahead }, dt, world, allCars);
    if (dist2(car.x, car.y, t.target.x, t.target.y) < 40 * 40) t.target = t.waypoints.shift() || null;
  }
}

// --- pedestrians: wander the sidewalks, flee danger ---
export function createPedestrians(world, rng, count) {
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const p = world.randomRoadPoint();
    const person = createPerson(p.x + rng.range(-30, 30), p.y + rng.range(-30, 30), {});
    person.speed = rng.range(28, 52);
    person.target = world.randomRoadPoint();
    list.push(person);
  }
  return list;
}

export function updatePeds(list, dt, world, danger) {
  for (const p of list) {
    if (p.downT > 0) { p.downT -= dt; continue; }
    if (danger) {
      const d2 = dist2(p.x, p.y, danger.x, danger.y);
      if (d2 < danger.r * danger.r) {
        p.state = 'flee';
        p.fleeT = 2;
        p.angle = angleTo(danger.x, danger.y, p.x, p.y);
      }
    }
    if (p.state === 'flee') {
      p.fleeT -= dt;
      p.x += Math.cos(p.angle) * 150 * dt;
      p.y += Math.sin(p.angle) * 150 * dt;
      world.collideCircle(p, p.radius);
      if (p.fleeT <= 0) p.state = 'walk';
      continue;
    }
    if (!p.target || dist2(p.x, p.y, p.target.x, p.target.y) < 30 * 30) {
      p.target = world.randomRoadPoint();
    }
    const a = angleTo(p.x, p.y, p.target.x, p.target.y);
    p.angle = angleLerp(p.angle, a, Math.min(1, 6 * dt));
    p.x += Math.cos(p.angle) * p.speed * dt;
    p.y += Math.sin(p.angle) * p.speed * dt;
    world.collideCircle(p, p.radius);
  }
}

// On-foot movement for the player.
export function moveOnFoot(player, walk, dt, world) {
  const speed = walk.run ? TUNE.runSpeed : TUNE.walkSpeed;
  const len = Math.hypot(walk.x, walk.y);
  if (len > 0.01) {
    const nx = walk.x / len, ny = walk.y / len;
    player.x += nx * speed * dt;
    player.y += ny * speed * dt;
    player.angle = Math.atan2(ny, nx);
    player.runT += dt;
  }
  world.collideCircle(player, player.radius);
}
