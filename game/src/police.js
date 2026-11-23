// The wanted level and the Harbor PD that answers it.
// Heat rises with crimes and cools when the player lies low; stars set how many
// patrol cars hunt the player, and a patrol car parked on an on-foot player arrests them.
import { TUNE, angleTo, clamp, dist2 } from './config.js';
import { CAR_DEFS, createCar, damageCar, driveCar } from './entities.js';
import { spawnExplosion } from './combat.js';

function starsFor(heat) {
  if (heat < 1) return 0;
  if (heat < 3) return 1;
  if (heat < 6) return 2;
  if (heat < 10) return 3;
  if (heat < 15) return 4;
  return 5;
}

function copsForStars(stars) { return [0, 1, 2, 3, 4, 6][stars]; }

export function createPolice() {
  return { heat: 0, wanted: 0, crimeT: 0, cops: [], spawnT: 0, arrestT: 0 };
}

export function addHeat(police, amount) {
  police.heat = Math.min(20, police.heat + amount);
  police.crimeT = 6;
  const stars = starsFor(police.heat);
  if (stars > police.wanted) police.wanted = stars;
}

export function clearWanted(police) {
  police.heat = 0;
  police.wanted = 0;
  police.crimeT = 0;
  police.arrestT = 0;
  for (const cop of police.cops) cop.car.dead = true;
  police.cops = [];
}

export function updatePolice(police, dt, g) {
  const player = g.player;
  police.wanted = starsFor(police.heat);
  if (police.crimeT > 0) police.crimeT -= dt;
  // Cool off when quiet and no patrol car is close.
  if (police.crimeT <= 0 && police.heat > 0) {
    let near = false;
    for (const cop of police.cops) {
      if (dist2(cop.car.x, cop.car.y, player.x, player.y) < 260 * 260) { near = true; break; }
    }
    if (!near) police.heat = Math.max(0, police.heat - dt / TUNE.wantedDecay);
  }

  const want = copsForStars(police.wanted);
  police.spawnT -= dt;
  if (police.cops.length < want && police.spawnT <= 0) {
    police.spawnT = TUNE.copSpawnInterval;
    // Spawn on a road 350-600 away from the player, off the screen edge if possible.
    let x = player.x, y = player.y, ok = false;
    for (let tries = 0; tries < 12 && !ok; tries += 1) {
      const p = g.world.randomRoadPoint();
      const d = Math.sqrt(dist2(p.x, p.y, player.x, player.y));
      if (d > 380 && d < 700) { x = p.x; y = p.y; ok = true; }
    }
    if (ok) {
      const car = createCar('police', x, y, angleTo(x, y, player.x, player.y));
      police.cops.push({ car, state: 'chase', stuckT: 0 });
      g.audio.setSiren(true);
    }
  }
  if (police.wanted === 0 && police.cops.length === 0) g.audio.setSiren(false);

  let busted = false;
  let wasted = false;
  for (let i = police.cops.length - 1; i >= 0; i -= 1) {
    const cop = police.cops[i];
    const car = cop.car;
    if (car.dead) {
      spawnExplosion(g.combat, car.x, car.y, false);
      g.audio.explosion();
      police.cops.splice(i, 1);
      continue;
    }
    const target = player.inCar || player;
    const d = Math.sqrt(dist2(car.x, car.y, target.x, target.y));
    // Chase: aim ahead of a moving target, ram it.
    const lead = 0.35;
    const tx = target.x + Math.cos(target.angle || 0) * (target.speed || 0) * lead;
    const ty = target.y + Math.sin(target.angle || 0) * (target.speed || 0) * lead;
    const desired = angleTo(car.x, car.y, tx, ty);
    let diff = desired - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = clamp(diff * 2.4, -1, 1);
    driveCar(car, { throttle: 1, steer, brake: false }, dt, g.world, g.allCars);
    if (d > 900) { police.cops.splice(i, 1); continue; }
    // Ramming the player's car damages it; touching an on-foot player starts an arrest.
    if (player.inCar) {
      const pd = Math.sqrt(dist2(car.x, car.y, player.inCar.x, player.inCar.y));
      if (pd < (car.len + player.inCar.len) / 2) {
        if (damageCar(player.inCar, 6 * dt * 10)) {
          spawnExplosion(g.combat, player.inCar.x, player.inCar.y, true);
          g.audio.explosion();
          player.inCar = null;
          player.hp -= 25;
          if (player.hp <= 0) wasted = true;
        }
      }
    } else if (d < 46) {
      police.arrestT += dt;
      if (police.arrestT > 1.2) busted = true;
    } else {
      police.arrestT = Math.max(0, police.arrestT - dt);
    }
  }
  return { busted, wasted };
}
