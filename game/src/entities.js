// Everything that moves: the player on foot and behind the wheel, traffic
// that follows the roads, pedestrians on the sidewalks, Harbor PD pursuit,
// bullets and particles. Pure simulation, no drawing.
import {
  AVENUES, MONEY, STREETS, TUNE, WORLD, angleDiff, angleLerp, angleTo,
  clamp, dist2, pushCircleOutOfRect,
} from './config.js';
import {
  EVENT_BUSTED, EVENT_CRASH, EVENT_PICKUP, EVENT_SHOOT, EVENT_STEAL,
  collideCircle, districtAt, isOnRoad, makeCar, nearestRoadPoint,
  randomCarColor, randomRoadPoint,
} from './world.js';

const CAR_R = 20;
const PED_R = 10;

export function addWanted(state, points) {
  state.wanted = clamp(state.wanted + points, 0, 100);
  state.stars = state.wanted <= 0 ? 0 : Math.min(5, Math.ceil(state.wanted / 20));
}

function randomSidewalkPoint(city, random) {
  // A point just off a road: on the sidewalk ring around a block.
  const ax = AVENUES[Math.floor(random() * AVENUES.length)];
  const sy = STREETS[Math.floor(random() * STREETS.length)];
  if (random() < 0.5) return { x: ax + (random() < 0.5 ? -52 : 52), y: clamp(sy + (random() - 0.5) * 200, 40, 2200) };
  return { x: clamp(ax + (random() - 0.5) * 200, 40, WORLD.w - 40), y: sy + (random() < 0.5 ? -52 : 52) };
}

export function spawnParked(state, city, random) {
  for (const spot of city.parkedSpots) {
    if (random() < 0.55) state.cars.push(makeCar(random, spot.x, spot.y, spot.angle, 'parked'));
  }
}

function randomRoute(random) {
  let ai = Math.floor(random() * AVENUES.length);
  let si = Math.floor(random() * STREETS.length);
  const route = [{ x: AVENUES[ai], y: STREETS[si] }];
  for (let i = 0; i < 6; i += 1) {
    if (random() < 0.5) ai = clamp(ai + (random() < 0.5 ? -1 : 1), 0, AVENUES.length - 1);
    else si = clamp(si + (random() < 0.5 ? -1 : 1), 0, STREETS.length - 1);
    route.push({ x: AVENUES[ai], y: STREETS[si] });
  }
  return route;
}

export function spawnTraffic(state, city, random, count) {
  for (let i = 0; i < count; i += 1) {
    const route = randomRoute(random);
    const start = route[0];
    const car = makeCar(random, start.x, start.y, 0, 'traffic');
    car.route = route;
    car.routeIndex = 1;
    car.speed = TUNE.trafficSpeed * (0.8 + random() * 0.4);
    state.cars.push(car);
  }
}

export function spawnPeds(state, city, random, count) {
  const colors = ['#e8b4b8', '#a8c8e8', '#d8e8a8', '#e8d8a8', '#c8a8e8', '#e8e8e8'];
  for (let i = 0; i < count; i += 1) {
    const p = randomSidewalkPoint(city, random);
    state.peds.push({
      x: p.x, y: p.y, angle: random() * Math.PI * 2, speed: 55 + random() * 25,
      target: randomSidewalkPoint(city, random), state: 'walk', fleeTimer: 0,
      hp: 20, color: colors[Math.floor(random() * colors.length)],
    });
  }
}

export function spawnCopCar(state, city, random) {
  const p = state.player;
  // Spawn on a road just outside the camera view, so sirens arrive visibly.
  let point = randomRoadPoint(random);
  let guard = 0;
  while (Math.sqrt(dist2(point.x, point.y, p.x, p.y)) < 700 && guard < 12) {
    point = randomRoadPoint(random);
    guard += 1;
  }
  const car = makeCar(random, point.x, point.y, angleTo(point.x, point.y, p.x, p.y), 'cop');
  car.speed = TUNE.copSpeed * 0.7;
  state.cars.push(car);
  return car;
}

function damageCar(state, car, amount) {
  car.hp -= amount;
  if (car.hp <= 0) {
    car.hp = 0;
    car.smoke = 1;
    if (car.kind === 'cop') car.speed = 0;
    if (car.kind === 'player' && state.player.car === car) {
      // Wrecked under the player: they have to get out on foot.
      state.player.onFoot = true;
      state.player.car = null;
      state.player.x = car.x + 34;
      state.player.y = car.y;
      car.kind = 'parked';
      car.driver = 'none';
    }
  }
}

function burst(state, x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.6);
    state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.3, maxLife: 0.7, color, size: 2 + Math.random() * 3 });
  }
}

export function tryEnterCar(state, city) {
  const p = state.player;
  if (!p.onFoot) {
    // Get out: step to the side of the car and leave it parked.
    const car = p.car;
    if (!car) return;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    p.angle = car.angle;
    p.onFoot = true;
    p.car = null;
    car.kind = 'parked';
    car.driver = 'none';
    car.speed = 0;
    collideCircle(city, p, TUNE.playerRadius);
    return;
  }
  let best = null;
  let bestD = 64 * 64;
  for (const car of state.cars) {
    if (car.kind === 'cop' || car.hp <= 0) continue;
    const d = dist2(p.x, p.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return;
  if (best.kind === 'traffic') {
    // Steal it: the driver flees on foot, and the law notices.
    const driver = { x: best.x + 30, y: best.y, angle: 0, speed: 180, target: randomSidewalkPoint(city, Math.random), state: 'flee', fleeTimer: 3, hp: 20, color: '#e8b4b8' };
    state.peds.push(driver);
    addWanted(state, 10);
    state.stats.stolen += 1;
    state.events |= EVENT_STEAL;
  }
  best.kind = 'player';
  best.driver = 'player';
  p.onFoot = false;
  p.car = best;
  p.x = best.x;
  p.y = best.y;
}

export function updatePlayer(state, city, input, actions, dt) {
  const p = state.player;
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
  if (p.punchTimer > 0) p.punchTimer = Math.max(0, p.punchTimer - dt);

  if (p.onFoot) {
    const mx = input.moveX();
    const my = input.moveY();
    const len = Math.hypot(mx, my);
    const speed = input.run() ? TUNE.runSpeed : TUNE.walkSpeed;
    if (len > 0) {
      p.x += (mx / len) * speed * dt;
      p.y += (my / len) * speed * dt;
      p.angle = Math.atan2(my, mx);
    }
    collideCircle(city, p, TUNE.playerRadius);
    // Bumping into a car shoves the player around it.
    for (const car of state.cars) {
      pushCircleOutOfRect(p, TUNE.playerRadius, { x: car.x - 22, y: car.y - 14, w: 44, h: 28 });
    }
    return;
  }

  // Driving.
  const car = p.car;
  if (!car) { p.onFoot = true; return; }
  const steer = (input.right() ? 1 : 0) - (input.left() ? 1 : 0);
  if (input.up()) car.speed += TUNE.carAccel * dt;
  else if (input.down()) {
    car.speed -= (car.speed > 0 ? TUNE.carBrake : TUNE.carAccel * 0.5) * dt;
    if (car.speed < -TUNE.carReverse) car.speed = -TUNE.carReverse;
  } else {
    car.speed -= car.speed * 0.7 * dt;
    if (Math.abs(car.speed) < 4) car.speed = 0;
  }
  if (input.brake()) car.speed -= car.speed * 3.2 * dt;
  if (car.speed > TUNE.carMaxSpeed) car.speed = TUNE.carMaxSpeed;
  const speedFactor = clamp(Math.abs(car.speed) / 220, 0, 1);
  car.angle += steer * TUNE.carTurn * speedFactor * dt * (car.speed < 0 ? -1 : 1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  car.x = nx;
  car.y = ny;
  const before = { x: car.x, y: car.y };
  if (collideCircle(city, car, CAR_R)) {
    const impact = Math.abs(car.speed);
    // Slide along the wall instead of grinding into it: turn the car
    // toward the direction the collision pushed it.
    const nx = car.x - before.x;
    const ny = car.y - before.y;
    if (nx !== 0 || ny !== 0) {
      const pushAngle = Math.atan2(ny, nx);
      car.angle = angleLerp(car.angle, pushAngle, 0.4);
    }
    if (impact > 220) {
      state.events |= EVENT_CRASH;
      burst(state, before.x, before.y, '#f2c94c', 8, 160);
      state.shake = Math.min(10, impact / 60);
    }
    car.speed *= 0.6;
  }
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
}

function carAhead(state, car, range) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let best = null;
  let bestD = range * range;
  for (const other of state.cars) {
    if (other === car || other.speed === 0 && other.kind === 'parked') continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    if (along < 0 || along > range) continue;
    const across = Math.abs(dx * -fy + dy * fx);
    if (across > 30) continue;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = other; }
  }
  return best;
}

export function updateTraffic(state, city, dt) {
  for (const car of state.cars) {
    if (car.kind !== 'traffic' || car.hp <= 0) continue;
    const target = car.route[car.routeIndex];
    if (!target) continue;
    // Lane offset: keep right.
    const dx = target.x - car.x;
    const dy = target.y - car.y;
    const movingAlongX = Math.abs(dx) > Math.abs(dy);
    const tx = target.x + (movingAlongX ? 0 : 14);
    const ty = target.y + (movingAlongX ? 14 : 0);
    const want = angleTo(car.x, car.y, tx, ty);
    car.angle = angleLerp(car.angle, want, Math.min(1, 3.5 * dt));
    const ahead = carAhead(state, car, 90);
    const desired = ahead ? Math.min(TUNE.trafficSpeed, ahead.speed) : TUNE.trafficSpeed;
    car.speed += clamp(desired - car.speed, -500 * dt, 260 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    collideCircle(city, car, CAR_R);
    if (Math.hypot(target.x - car.x, target.y - car.y) < 34) {
      car.routeIndex += 1;
      if (car.routeIndex >= car.route.length) {
        car.route = randomRoute(Math.random);
        car.routeIndex = 1;
      }
    }
  }
}

export function updatePeds(state, city, dt) {
  const p = state.player;
  for (let i = state.peds.length - 1; i >= 0; i -= 1) {
    const ped = state.peds[i];
    if (ped.hp <= 0) {
      state.peds.splice(i, 1);
      continue;
    }
    if (ped.fleeTimer > 0) ped.fleeTimer -= dt;
    // Flee from gunfire, fast cars and the player when they are violent.
    const threatNear = state.events & EVENT_SHOOT;
    const carNear = state.cars.some((c) => Math.abs(c.speed) > 120 && dist2(ped.x, ped.y, c.x, c.y) < 90 * 90);
    if ((threatNear && dist2(ped.x, ped.y, p.x, p.y) < 420 * 420) || carNear) {
      ped.state = 'flee';
      ped.fleeTimer = 2;
    }
    let tx;
    let ty;
    let speed = ped.speed;
    if (ped.state === 'flee' && ped.fleeTimer > 0) {
      const away = angleTo(p.x, ped.x, p.y, ped.y);
      tx = ped.x + Math.cos(away) * 200;
      ty = ped.y + Math.sin(away) * 200;
      speed = 210;
    } else {
      ped.state = 'walk';
      tx = ped.target.x;
      ty = ped.target.y;
      if (Math.hypot(tx - ped.x, ty - ped.y) < 24) {
        ped.target = randomSidewalkPoint(city, Math.random);
        continue;
      }
    }
    const want = angleTo(ped.x, ped.y, tx, ty);
    ped.angle = angleLerp(ped.angle, want, Math.min(1, 6 * dt));
    ped.x += Math.cos(ped.angle) * speed * dt;
    ped.y += Math.sin(ped.angle) * speed * dt;
    collideCircle(city, ped, PED_R);
  }
}

export function updateCops(state, city, random, dt) {
  const p = state.player;
  // Spawn more pursuit while wanted.
  state.copTimer -= dt;
  const copCount = state.cars.filter((c) => c.kind === 'cop' && c.hp > 0).length;
  if (state.stars > 0 && copCount < Math.min(state.stars + 1, TUNE.maxCops) && state.copTimer <= 0) {
    spawnCopCar(state, city, random);
    state.copTimer = TUNE.copSpawnInterval;
  }
  let anyNear = false;
  for (const cop of state.cars) {
    if (cop.kind !== 'cop') continue;
    if (cop.hp <= 0) {
      cop.smoke = Math.min(1, cop.smoke + dt);
      continue;
    }
    // Pursuit: aim slightly ahead of the player.
    const lead = p.onFoot ? 0 : 0.35;
    const tx = p.x + (p.car ? Math.cos(p.angle) * p.car.speed * lead : 0);
    const ty = p.y + (p.car ? Math.sin(p.angle) * p.car.speed * lead : 0);
    const want = angleTo(cop.x, cop.y, tx, ty);
    const turn = angleDiff(cop.angle, want);
    cop.angle += clamp(turn, -2.8 * dt, 2.8 * dt);
    const dist = Math.hypot(tx - cop.x, ty - cop.y);
    const desired = dist > 420 ? TUNE.copSpeed : TUNE.copSpeed * 0.75;
    cop.speed += clamp(desired - cop.speed, -600 * dt, 420 * dt);
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    if (collideCircle(city, cop, CAR_R)) cop.speed *= 0.6;
    cop.sirenPhase += dt * 6;
    // Ram the player's car.
    if (!p.onFoot && p.car) {
      const d = dist2(cop.x, cop.y, p.car.x, p.car.y);
      if (d < 44 * 44) {
        const push = angleTo(cop.x, cop.y, p.car.x, p.car.y);
        p.car.x += Math.cos(push) * 60 * dt;
        p.car.y += Math.sin(push) * 60 * dt;
        p.car.hp = (p.car.hp ?? 100) - 14 * dt;
        if (Math.abs(cop.speed) > 300) state.events |= EVENT_CRASH;
        if (p.car.hp <= 0) damageCar(state, p.car, 1);
      }
    }
    if (dist < 500) anyNear = true;
    // Busted: a cop sitting on the player on foot.
    if (p.onFoot) {
      const d = Math.hypot(cop.x - p.x, cop.y - p.y);
      if (d < 40) {
        state.bustedTimer += dt;
        if (state.bustedTimer >= TUNE.bustedTime) state.events |= EVENT_BUSTED;
      }
    }
  }
  if (state.stars === 0) state.bustedTimer = 0;
  // Cops give up once the heat is off and they are far away.
  if (state.stars === 0) {
    for (let i = state.cars.length - 1; i >= 0; i -= 1) {
      const cop = state.cars[i];
      if (cop.kind === 'cop' && Math.hypot(cop.x - p.x, cop.y - p.y) > 1300) state.cars.splice(i, 1);
    }
  }
  return anyNear;
}

export function shootAt(state, city, tx, ty) {
  const p = state.player;
  if (state.ammo <= 0 || p.punchTimer > 0) return;
  state.ammo -= 1;
  state.stats.shots += 1;
  const angle = angleTo(p.x, p.y, tx, ty);
  const speed = 900;
  state.bullets.push({
    x: p.x + Math.cos(angle) * 20, y: p.y + Math.sin(angle) * 20,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    life: TUNE.pistolRange / speed, damage: TUNE.pistolDamage, fromPlayer: true,
  });
  state.events |= EVENT_SHOOT;
  addWanted(state, 2);
}

export function punch(state, city) {
  const p = state.player;
  if (!p.onFoot || p.punchTimer > 0) return;
  p.punchTimer = 0.35;
  p.punchAngle = p.angle;
  // Anything in the arc in front of the player takes a hit.
  for (const ped of state.peds) {
    const d = Math.hypot(ped.x - p.x, ped.y - p.y);
    if (d > TUNE.fistRange + PED_R) continue;
    if (Math.abs(angleDiff(p.angle, angleTo(p.x, p.y, ped.x, ped.y))) > TUNE.fistArc) continue;
    ped.hp -= TUNE.fistDamage;
    const a = angleTo(p.x, p.y, ped.x, ped.y);
    ped.x += Math.cos(a) * 26;
    ped.y += Math.sin(a) * 26;
    burst(state, ped.x, ped.y, '#c0392b', 6, 120);
    addWanted(state, 6);
  }
  for (const car of state.cars) {
    if (car.kind === 'cop') continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < TUNE.fistRange + CAR_R && Math.abs(angleDiff(p.angle, angleTo(p.x, p.y, car.x, car.y))) <= TUNE.fistArc) {
      damageCar(state, car, TUNE.fistDamage);
      burst(state, car.x, car.y, '#f2c94c', 5, 100);
    }
  }
  state.events |= EVENT_SHOOT;
}

export function updateBullets(state, city, dt) {
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    // Buildings stop bullets.
    for (const building of city.buildings) {
      if (b.x > building.x && b.x < building.x + building.w && b.y > building.y && b.y < building.y + building.h) {
        burst(state, b.x, b.y, '#d8c56a', 4, 90);
        dead = true;
        break;
      }
    }
    if (!dead) {
      for (const ped of state.peds) {
        if (ped.hp > 0 && dist2(b.x, b.y, ped.x, ped.y) < (PED_R + 4) * (PED_R + 4)) {
          ped.hp -= b.damage;
          burst(state, b.x, b.y, '#c0392b', 8, 140);
          addWanted(state, 8);
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      for (const car of state.cars) {
        if (car.kind === 'player') continue;
        if (dist2(b.x, b.y, car.x, car.y) < CAR_R * CAR_R) {
          damageCar(state, car, b.damage);
          burst(state, b.x, b.y, '#f2c94c', 6, 120);
          if (car.kind === 'cop') addWanted(state, 6);
          else if (car.kind === 'traffic') addWanted(state, 4);
          dead = true;
          break;
        }
      }
    }
    if (dead) state.bullets.splice(i, 1);
  }
}

export function updateParticles(state, dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const pt = state.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 1 - 2 * dt;
    pt.vy *= 1 - 2 * dt;
    pt.life -= dt;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }
}

export function collectPickups(state, city) {
  const p = state.player;
  if (!p.onFoot) return;
  for (const stash of state.stashes) {
    if (!stash.taken && dist2(p.x, p.y, stash.x, stash.y) < 28 * 28) {
      stash.taken = true;
      state.money += MONEY.stash;
      state.stats.earned += MONEY.stash;
      state.events |= EVENT_PICKUP;
      burst(state, stash.x, stash.y, '#2ecc71', 10, 120);
    }
  }
  for (const kit of state.healthKits) {
    if (!kit.taken && state.hp < TUNE.playerHp && dist2(p.x, p.y, kit.x, kit.y) < 28 * 28) {
      kit.taken = true;
      state.hp = Math.min(TUNE.playerHp, state.hp + TUNE.healthKitHeal);
      state.events |= EVENT_PICKUP;
      burst(state, kit.x, kit.y, '#e8e4da', 8, 100);
    }
  }
}
