// The story of Neon Harbor: Mara Voss, getaway driver for the Harbor Crew,
// five jobs for her fixer Lennox, and Viktor Kade's syndicate closing in.
// Missions are step machines: reach a marker, pick something up, survive, escape.
import { MONEY, angleTo, dist2 } from './config.js';
import { createPerson } from './entities.js';
import { addHeat } from './police.js';
import { fireBullet } from './combat.js';

export const MISSIONS = [
  {
    id: 1, title: 'First Wheels',
    brief: 'Lennox needs a driver with a car. Any car. Take one and bring it to Neon Paint.',
    steps: [
      { type: 'steal', text: 'Steal a car (walk up to one and press E)' },
      { type: 'goto', at: 'paintShop', text: 'Drive to Neon Paint' },
    ],
  },
  {
    id: 2, title: 'The Pickup',
    brief: 'Lennox is waiting at Club Mirage. Pick him up and get him to the safehouse. The PD is watching the club tonight.',
    steps: [
      { type: 'goto', at: 'nightclub', text: 'Drive to Club Mirage' },
      { type: 'wait', text: 'Wait for Lennox (stay at the marker)' },
      { type: 'goto', at: 'safehouse', text: 'Drive Lennox to the safehouse' },
    ],
  },
  {
    id: 3, title: 'Harbor Run',
    brief: 'A package is waiting at the marina. Bring it to the cargo docks in 150 seconds. Kade\'s men will try to stop you.',
    steps: [
      { type: 'goto', at: 'marina', text: 'Pick up the package at the marina', heat: 2 },
      { type: 'deliver', at: 'docks', time: 150, text: 'Deliver the package to the cargo docks' },
    ],
  },
  {
    id: 4, title: 'The Bank Job',
    brief: 'Harbor Bank, midday. Walk in, hold the vault, and get out. The syndicate posted guards inside.',
    steps: [
      { type: 'goto', at: 'bank', text: 'Get to Harbor Bank (on foot is quieter)' },
      { type: 'hold', at: 'bank', time: 4, text: 'Hold the vault — stay at the marker', heat: 6 },
      { type: 'goto', at: 'safehouse', text: 'Escape to the safehouse' },
    ],
  },
  {
    id: 5, title: 'The Last Score',
    brief: 'Kade knows. Meet Lennox at the club, then outrun the whole Harbor PD to the marina boat.',
    steps: [
      { type: 'goto', at: 'nightclub', text: 'Meet Lennox at Club Mirage', heat: 10 },
      { type: 'survive', time: 90, text: 'Survive the chase — 90 seconds' },
      { type: 'goto', at: 'marina', text: 'Reach the marina boat' },
    ],
  },
];

const PACKAGE_SPOTS = [
  { x: 300, y: 500 }, { x: 1000, y: 200 }, { x: 2300, y: 400 }, { x: 2750, y: 1200 },
  { x: 400, y: 1700 }, { x: 1500, y: 2000 }, { x: 2400, y: 1900 }, { x: 900, y: 1100 },
];
const HEALTH_SPOTS = [
  { x: 560, y: 250 }, { x: 1300, y: 500 }, { x: 2200, y: 1500 }, { x: 700, y: 2100 },
];

export function createMissions() {
  return {
    index: 0, active: false, step: 0, timer: 0, holdT: 0, waitT: 0, guardsSpawned: false,
    enemies: [], packages: PACKAGE_SPOTS.map((p) => ({ ...p, taken: false })),
    healthKits: HEALTH_SPOTS.map((p) => ({ ...p, taken: false, respawn: 0 })),
    dialogue: [], objective: 'Free roam — press M for missions',
  };
}

export function currentMission(m) { return m.index < MISSIONS.length ? MISSIONS[m.index] : null; }

export function startMission(m, g) {
  const def = currentMission(m);
  if (!def) return false;
  m.active = true;
  m.step = 0;
  m.timer = 0;
  m.holdT = 0;
  m.waitT = 0;
  m.guardsSpawned = false;
  m.enemies = [];
  m.objective = def.steps[0].text;
  g.addDialogue('LENNOX', def.brief);
  g.audio.mission();
  return true;
}

function markerPos(m, g, step) {
  if (!step || !step.at) return null;
  const lm = g.world.landmarks[step.at];
  return lm ? { x: lm.x, y: lm.y, label: lm.label } : null;
}

export function missionMarker(m, g) {
  if (!m.active) return null;
  const def = currentMission(m);
  if (!def) return null;
  return markerPos(m, g, def.steps[m.step]);
}

function completeStep(m, g) {
  const def = currentMission(m);
  const done = def.steps[m.step];
  m.step += 1;
  m.holdT = 0;
  m.waitT = 0;
  if (done.heat) addHeat(g.police, done.heat);
  if (m.step >= def.steps.length) {
    const reward = MONEY.mission[m.index];
    g.player.money += reward;
    g.addMessage(`Job done: ${def.title} — ${'$' + reward}`);
    g.addDialogue('LENNOX', m.index >= MISSIONS.length - 1
      ? 'That\'s the last of it, Mara. Neon Harbor is yours now. Drive safe.'
      : 'Clean work, Mara. Come back when you want the next one.');
    g.audio.mission();
    g.saveProgress();
    m.active = false;
    m.index += 1;
    m.objective = m.index < MISSIONS.length ? 'Next job: ' + MISSIONS[m.index].title + ' (press M)' : 'Story complete — free roam';
    return 'completed';
  }
  const next = def.steps[m.step];
  m.objective = next.text;
  return 'step';
}

function spawnBankGuards(m, g) {
  const bank = g.world.landmarks.bank;
  for (let i = 0; i < 3; i += 1) {
    const guard = createPerson(bank.x + (i - 1) * 70, bank.y + 60, { hp: 60, armed: true, gang: true });
    guard.shirt = '#3a3f4a';
    m.enemies.push(guard);
  }
  g.addDialogue('GUARD', 'Kade owns this bank. You picked the wrong vault.');
}

export function updateMissions(m, dt, g) {
  // Hidden cash packages and health kits, in free roam and in missions alike.
  const px = g.player.x, py = g.player.y;
  for (const pkg of m.packages) {
    if (!pkg.taken && dist2(px, py, pkg.x, pkg.y) < 34 * 34) {
      pkg.taken = true;
      g.player.money += MONEY.package;
      g.addMessage(`Found a stash: +$${MONEY.package}`);
      g.audio.pickup();
    }
  }
  for (const kit of m.healthKits) {
    if (kit.taken) {
      kit.respawn -= dt;
      if (kit.respawn <= 0) kit.taken = false;
      continue;
    }
    if (dist2(px, py, kit.x, kit.y) < 34 * 34 && g.player.hp < g.player.maxHp) {
      kit.taken = true;
      kit.respawn = 60;
      g.player.hp = Math.min(g.player.maxHp, g.player.hp + 50);
      g.addMessage('First aid kit: +50 health');
      g.audio.pickup();
    }
  }

  // Enemy guards shoot at the player when close.
  for (let i = m.enemies.length - 1; i >= 0; i -= 1) {
    const e = m.enemies[i];
    if (e.hp <= 0) { m.enemies.splice(i, 1); continue; }
    const d = Math.sqrt(dist2(e.x, e.y, px, py));
    if (d < 380) {
      e.angle = angleTo(e.x, e.y, px, py);
      e.shootT = (e.shootT || 0) - dt;
      if (e.shootT <= 0) {
        e.shootT = 1.3;
        fireBullet(g.combat, e.x, e.y, e.angle + (Math.random() - 0.5) * 0.2, 'enemy', 12);
        g.audio.shot();
      }
      // Step toward the player, slowly.
      e.x += Math.cos(e.angle) * 26 * dt;
      e.y += Math.sin(e.angle) * 26 * dt;
    }
  }

  if (!m.active) return null;
  const def = currentMission(m);
  if (!def) return null;
  const step = def.steps[m.step];
  const marker = markerPos(m, g, step);
  const d = marker ? Math.sqrt(dist2(px, py, marker.x, marker.y)) : Infinity;

  if (step.type === 'steal') {
    if (g.player.inCar) return completeStep(m, g);
    return null;
  }
  if (step.type === 'goto' || step.type === 'deliver') {
    if (step.time !== undefined) {
      m.timer += dt;
      if (m.timer > step.time) {
        m.active = false;
        g.addDialogue('LENNOX', 'Too slow, Mara. The job is dead. Come back and we try again.');
        g.audio.fail();
        return 'failed';
      }
    }
    if (d < 60) {
      if (step.type === 'deliver') g.addMessage('Package delivered.');
      return completeStep(m, g);
    }
    return null;
  }
  if (step.type === 'wait') {
    if (d < 70) {
      m.waitT += dt;
      if (m.waitT > 2.5) {
        g.addDialogue('LENNOX', 'In the car, Mara. Drive — and don\'t stop for anyone.');
        return completeStep(m, g);
      }
    } else m.waitT = 0;
    return null;
  }
  if (step.type === 'hold') {
    if (d < 70 && !g.player.inCar) {
      m.holdT += dt;
      if (m.holdT > step.time) {
        g.addMessage('Vault emptied. Run!');
        return completeStep(m, g);
      }
    } else m.holdT = 0;
    return null;
  }
  if (step.type === 'survive') {
    m.timer += dt;
    if (m.timer > step.time) return completeStep(m, g);
    return null;
  }
  return null;
}

export function beginMissionStep(m, g) {
  const def = currentMission(m);
  if (!def || !m.active) return;
  const step = def.steps[m.step];
  if (step.type === 'hold' && !m.guardsSpawned) {
    m.guardsSpawned = true;
    spawnBankGuards(m, g);
  }
}
