// Combat: bullets, fists, explosions and the particles they leave behind.
// Nothing here knows about the player or the police; it works on positions and targets.
import { TUNE, clamp } from './config.js';

export function createCombat() {
  return { bullets: [], particles: [], flashes: [], shake: 0 };
}

export function fireBullet(combat, x, y, angle, from, damage) {
  combat.bullets.push({
    x, y, vx: Math.cos(angle) * 900, vy: Math.sin(angle) * 900,
    life: TUNE.pistolRange / 900, from, damage: damage || TUNE.pistolDamage,
  });
  combat.flashes.push({ x, y, angle, life: 0.06, max: 0.06 });
}

export function spawnExplosion(combat, x, y, big) {
  combat.particles.push({ kind: 'boom', x, y, life: big ? 0.9 : 0.5, max: big ? 0.9 : 0.5, r: big ? 46 : 26 });
  for (let i = 0; i < (big ? 26 : 12); i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * (big ? 260 : 140);
    combat.particles.push({
      kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.4 + Math.random() * 0.5, max: 0.9, r: 2 + Math.random() * 3,
      color: ['#ffb347', '#ff7847', '#ffd76a', '#8a8f98'][i % 4],
    });
  }
  combat.shake = Math.max(combat.shake, big ? 14 : 7);
}

export function spawnSparks(combat, x, y, color) {
  for (let i = 0; i < 6; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = 40 + Math.random() * 120;
    combat.particles.push({
      kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.25 + Math.random() * 0.3, max: 0.55, r: 1.5 + Math.random() * 2, color: color || '#ffd76a',
    });
  }
}

export function spawnSmoke(combat, x, y) {
  combat.particles.push({ kind: 'smoke', x, y, life: 1.1, max: 1.1, r: 6 });
}

// Move bullets and particles; `hitTest(x, y, from)` answers what a bullet struck:
// 'wall', a target object, or null. Returns the events the frame produced.
export function updateCombat(combat, dt, world, hitTest) {
  const events = [];
  for (let i = combat.bullets.length - 1; i >= 0; i -= 1) {
    const b = combat.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead) {
      const hit = hitTest(b.x, b.y, b.from);
      if (hit === 'wall') {
        spawnSparks(combat, b.x, b.y, '#c9cdd4');
        dead = true;
      } else if (hit) {
        events.push({ type: 'bulletHit', target: hit, damage: b.damage, x: b.x, y: b.y });
        dead = true;
      }
    }
    if (dead) combat.bullets.splice(i, 1);
  }
  for (let i = combat.particles.length - 1; i >= 0; i -= 1) {
    const p = combat.particles[i];
    p.life -= dt;
    if (p.life <= 0) { combat.particles.splice(i, 1); continue; }
    if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
    if (p.kind === 'smoke') p.r += 14 * dt;
  }
  for (let i = combat.flashes.length - 1; i >= 0; i -= 1) {
    combat.flashes[i].life -= dt;
    if (combat.flashes[i].life <= 0) combat.flashes.splice(i, 1);
  }
  combat.shake = Math.max(0, combat.shake - 40 * dt);
  return events;
}

export function combatCleared(combat) {
  return combat.bullets.length === 0 && combat.particles.length === 0;
}
