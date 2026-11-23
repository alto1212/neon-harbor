// Neon Harbor — boot and the one loop: input every frame, the world in fixed 1/60 s
// steps, the renderer painting what is there. Screens: title, play, paused, missions,
// help and over. ?seed=N fixes the city; ?shot=chase|drive|mission|start stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.
import { STEP, TUNE, angleTo, clamp, dist2 } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import {
  ACTION_CONFIRM, ACTION_HORN, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH,
  createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  createCar, createPedestrians, createPlayer, createTraffic, damageCar, driveCar,
  moveOnFoot, nearestCar, updatePeds, updateTraffic,
} from './entities.js';
import { createCombat, fireBullet, spawnExplosion, spawnSmoke, spawnSparks, updateCombat } from './combat.js';
import { addHeat, clearWanted, createPolice, updatePolice } from './police.js';
import { beginMissionStep, createMissions, currentMission, missionMarker, startMission, updateMissions } from './missions.js';
import { createCamera, drawWorld, updateCamera } from './render.js';
import { SCREEN_HELP, SCREEN_MISSIONS, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, drawHud, drawScreen } from './hud.js';
import { hasSave, loadGame, saveGame } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const FIRE_INTERVAL = 0.22;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261123;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

const rng = createRandom(seed);
const world = createWorld(rng);
const input = createInput(canvas);
const audio = createAudio();

const g = {
  world, rng, input, audio,
  combat: createCombat(),
  police: createPolice(),
  missions: createMissions(),
  camera: createCamera(),
  player: createPlayer(world.landmarks.safehouse.x + 60, world.landmarks.safehouse.y - 40),
  traffic: [], peds: [], parked: [], allCars: [],
  time: 0, clock: 8 * 3600, screen: SCREEN_TITLE, menuIndex: 0,
  hasSave: hasSave(), overTitle: '', overText: '',
  messages: [], dialogue: [], missionMarker: null,
  canvasW: 0, canvasH: 0, shootT: 0, danger: null, dangerT: 0,
  stats: { carsStolen: 0, shotsFired: 0 },
  addMessage(text) {
    g.messages.push({ text, life: 4.5 });
    if (g.messages.length > 4) g.messages.shift();
  },
  addDialogue(who, text) {
    g.dialogue.push({ who, text, life: 7 });
    if (g.dialogue.length > 2) g.dialogue.shift();
  },
  saveProgress() {
    saveGame({
      missionIndex: g.missions.index, money: g.player.money,
      packages: g.missions.packages.map((p) => p.taken),
      stats: g.stats,
    });
  },
};

function rebuildAllCars() {
  g.allCars = [];
  for (const t of g.traffic) if (!t.car.dead && !t.stolen) g.allCars.push(t.car);
  for (const cop of g.police.cops) g.allCars.push(cop.car);
  for (const car of g.parked) if (!car.dead) g.allCars.push(car);
  if (g.player.inCar) g.allCars.push(g.player.inCar);
}

function parkCars() {
  const spots = [
    { x: 300, y: 2150, def: 'sedan' }, { x: 560, y: 480, def: 'sedan' },
    { x: 1200, y: 760, def: 'taxi' }, { x: 1900, y: 1330, def: 'sports' },
    { x: 2500, y: 1040, def: 'van' }, { x: 900, y: 1600, def: 'truck' },
    { x: 2100, y: 480, def: 'sedan' }, { x: 1500, y: 1900, def: 'sedan' },
  ];
  for (const s of spots) {
    const car = createCar(s.def, s.x, s.y, rng.next() * Math.PI * 2);
    g.parked.push(car);
  }
}

function pointInSolid(x, y) {
  if (x < 0 || y < 0 || x > 2920 || y > 2400) return true;
  for (const b of world.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

function hitTest(x, y, from) {
  if (pointInSolid(x, y)) return 'wall';
  for (const e of g.missions.enemies) {
    if (from !== 'enemy' && e.hp > 0 && dist2(x, y, e.x, e.y) < 15 * 15) return e;
  }
  if (from === 'player') {
    for (const p of g.peds) {
      if (p.downT <= 0 && dist2(x, y, p.x, p.y) < 15 * 15) return p;
    }
    for (const cop of g.police.cops) {
      if (dist2(x, y, cop.car.x, cop.car.y) < 26 * 26) return cop.car;
    }
  }
  if (from === 'enemy') {
    if (!g.player.inCar && dist2(x, y, g.player.x, g.player.y) < 15 * 15) return g.player;
    if (g.player.inCar && dist2(x, y, g.player.inCar.x, g.player.inCar.y) < 26 * 26) return g.player.inCar;
  }
  return null;
}

function applyBulletHit(ev) {
  const t = ev.target;
  if (t === g.player) {
    g.player.hp -= ev.damage;
    spawnSparks(g.combat, ev.x, ev.y, '#e5484d');
    if (g.player.hp <= 0) endRun('wasted');
    return;
  }
  if (t.kind === 'person') {
    t.hp -= ev.damage;
    spawnSparks(g.combat, ev.x, ev.y, '#e5484d');
    if (t.hp <= 0 && !t.gang) {
      t.downT = 3;
      t.hp = 1;
      addHeat(g.police, 1);
      g.addMessage('A bystander went down — the PD noticed.');
    }
    return;
  }
  if (t.kind === 'car') {
    if (damageCar(t, ev.damage)) {
      spawnExplosion(g.combat, t.x, t.y, true);
      audio.explosion();
      if (t === g.player.inCar) {
        g.player.inCar = null;
        g.player.hp -= 25;
        g.player.x = t.x + 40;
        g.player.y = t.y;
        if (g.player.hp <= 0) endRun('wasted');
      }
    }
    return;
  }
}

function endRun(kind) {
  if (kind === 'wasted') {
    g.overTitle = 'WASTED';
    g.overText = 'Mara went down in Neon Harbor. The hospital patched her up — for a fee.';
    g.player.money = Math.floor(g.player.money * 0.9);
    g.player.x = world.landmarks.hospital.x;
    g.player.y = world.landmarks.hospital.y + 60;
  } else {
    g.overTitle = 'BUSTED';
    g.overText = 'The Harbor PD took Mara in. Bail was not cheap.';
    g.player.money = Math.floor(g.player.money * 0.85);
    g.player.x = world.landmarks.policeStation.x;
    g.player.y = world.landmarks.policeStation.y + 60;
  }
  g.player.hp = g.player.maxHp;
  g.player.inCar = null;
  clearWanted(g.police);
  audio.fail();
  g.saveProgress();
  g.screen = SCREEN_OVER;
}

function enterOrExitCar() {
  const player = g.player;
  if (player.inCar) {
    const car = player.inCar;
    player.inCar = null;
    player.x = car.x - Math.sin(car.angle) * 34;
    player.y = car.y + Math.cos(car.angle) * 34;
    player.angle = car.angle;
    world.collideCircle(player, player.radius);
    audio.click();
    return;
  }
  const candidates = [];
  for (const t of g.traffic) if (!t.car.dead && !t.stolen) candidates.push({ car: t.car, traffic: t });
  for (const car of g.parked) if (!car.dead) candidates.push({ car, traffic: null });
  for (const cop of g.police.cops) candidates.push({ car: cop.car, traffic: null, police: true });
  const near = nearestCar(candidates.map((c) => c.car), player.x, player.y, 62);
  if (!near) return;
  const entry = candidates.find((c) => c.car === near);
  if (entry.traffic) entry.traffic.stolen = true;
  player.inCar = near;
  player.x = near.x; player.y = near.y;
  g.stats.carsStolen += 1;
  audio.click();
  // Stealing in front of a witness draws heat; a patrol car draws a lot.
  let witnessed = entry.police === true;
  if (!witnessed) {
    for (const p of g.peds) {
      if (dist2(p.x, p.y, player.x, player.y) < 220 * 220) { witnessed = true; break; }
    }
    if (!witnessed) {
      for (const cop of g.police.cops) {
        if (dist2(cop.car.x, cop.car.y, player.x, player.y) < 350 * 350) { witnessed = true; break; }
      }
    }
  }
  if (entry.police) {
    addHeat(g.police, 3);
    g.addMessage('You stole a patrol car! The whole PD is coming.');
  } else if (witnessed) {
    addHeat(g.police, 1);
    g.addMessage('Car stolen — someone saw you.');
  } else {
    g.addMessage(`Took the ${near.name}. Quiet… this time.`);
  }
}

function punch() {
  const player = g.player;
  if (player.inCar) return;
  audio.punch();
  let best = null, bestD = 48 * 48;
  const targets = [...g.peds, ...g.missions.enemies];
  for (const t of targets) {
    if (t.downT > 0 || t.hp <= 0) continue;
    const d = dist2(player.x, player.y, t.x, t.y);
    if (d < bestD) { bestD = d; best = t; }
  }
  if (!best) return;
  best.hp -= 12;
  spawnSparks(g.combat, best.x, best.y, '#ffd76a');
  if (best.hp <= 0 && !best.gang) {
    best.downT = 3;
    best.hp = 1;
    addHeat(g.police, 1);
  }
}

function shootAt(sx, sy) {
  const player = g.player;
  if (player.inCar || player.weapon !== 'pistol') return;
  if (g.shootT > 0) return;
  if (player.ammo <= 0) {
    g.addMessage('Out of ammo — the safehouse restocks you.');
    g.shootT = 0.3;
    return;
  }
  const wx = g.camera.x + (sx - g.canvasW / 2) / g.camera.zoom;
  const wy = g.camera.y + (sy - g.canvasH / 2) / g.camera.zoom;
  const angle = angleTo(player.x, player.y, wx, wy);
  player.angle = angle;
  fireBullet(g.combat, player.x + Math.cos(angle) * 20, player.y + Math.sin(angle) * 20, angle, 'player', 34);
  player.ammo -= 1;
  g.stats.shotsFired += 1;
  g.shootT = FIRE_INTERVAL;
  g.danger = { x: player.x, y: player.y, r: 280 };
  g.dangerT = 1;
  audio.shot();
}

// One fixed step of the living city, with no player input.
g.stepWorld = function stepWorld(dt) {
  g.time += dt;
  g.clock += dt * 60;
  g.missionMarker = missionMarker(g.missions, g);
  rebuildAllCars();
  updateTraffic(g.traffic, dt, world, rng, g.allCars);
  updatePeds(g.peds, dt, world, g.dangerT > 0 ? g.danger : null);
  if (g.dangerT > 0) g.dangerT -= dt;
  const result = updatePolice(g.police, dt, g);
  if (result.busted) endRun('busted');
  else if (result.wasted) endRun('wasted');
  for (const ev of updateCombat(g.combat, dt, world, hitTest)) applyBulletHit(ev);
  beginMissionStep(g.missions, g);
  const missionEvent = updateMissions(g.missions, dt, g);
  if (missionEvent === 'completed' && g.missions.index >= 5) g.addMessage('Story complete — Neon Harbor is yours.');
  // Safehouse restocks ammo and heals, slowly.
  const sh = world.landmarks.safehouse;
  if (dist2(g.player.x, g.player.y, sh.x, sh.y) < 90 * 90) {
    g.player.hp = Math.min(g.player.maxHp, g.player.hp + 6 * dt);
    if (g.player.ammo < 12) g.player.ammo = 12;
  }
  // Smoking wrecks puff.
  for (const car of g.allCars) {
    if (car.smoke > 0.3 && Math.random() < 0.3) spawnSmoke(g.combat, car.x, car.y - 6);
  }
  for (let i = g.messages.length - 1; i >= 0; i -= 1) {
    g.messages[i].life -= dt;
    if (g.messages[i].life <= 0) g.messages.splice(i, 1);
  }
  for (let i = g.dialogue.length - 1; i >= 0; i -= 1) {
    g.dialogue[i].life -= dt;
    if (g.dialogue[i].life <= 0) g.dialogue.splice(i, 1);
  }
  if (g.shootT > 0) g.shootT -= dt;
  const target = g.player.inCar || g.player;
  updateCamera(g.camera, target, !!g.player.inCar, dt, g.combat.shake);
};

function stepPlay(dt) {
  const actions = input.takeActions();
  if (actions & ACTION_MUTE) audio.setMuted(!audio.isMuted());
  if (actions & ACTION_PAUSE) { g.screen = SCREEN_PAUSED; return; }
  if (actions & ACTION_HORN) { g.screen = SCREEN_HELP; return; }
  if (actions & ACTION_INTERACT) enterOrExitCar();
  if (actions & ACTION_PUNCH) punch();
  const player = g.player;
  if (player.inCar) {
    driveCar(player.inCar, input.drive(), dt, world, g.allCars);
    player.x = player.inCar.x;
    player.y = player.inCar.y;
    player.angle = player.inCar.angle;
    audio.setEngine(Math.abs(player.inCar.speed) / TUNE.carMaxSpeed, true);
  } else {
    audio.setEngine(0, false);
    const walk = input.walk();
    moveOnFoot(player, walk, dt, world);
    // Aim with the mouse when the pistol is out.
    if (player.weapon === 'pistol') {
      const wx = g.camera.x + (input.mouse.x - g.canvasW / 2) / g.camera.zoom;
      const wy = g.camera.y + (input.mouse.y - g.canvasH / 2) / g.camera.zoom;
      if (Math.hypot(wx - player.x, wy - player.y) > 30) player.angle = angleTo(player.x, player.y, wx, wy);
    }
    if (input.mouse.down) shootAt(input.mouse.x, input.mouse.y);
  }
  // M opens the jobs screen (edge-triggered).
  if (input.keys.has('KeyM') && !g.mKeyDown) {
    g.mKeyDown = true;
    g.screen = SCREEN_MISSIONS;
  } else if (!input.keys.has('KeyM')) g.mKeyDown = false;
  g.stepWorld(dt);
}

function newGame() {
  g.player = createPlayer(world.landmarks.safehouse.x + 60, world.landmarks.safehouse.y - 40);
  g.player.money = 250;
  g.missions = createMissions();
  g.police = createPolice();
  g.combat = createCombat();
  g.messages = [];
  g.dialogue = [];
  clearWanted(g.police);
  g.screen = SCREEN_PLAY;
  audio.unlock();
  audio.startMusic();
  g.addDialogue('LENNOX', 'Mara. You\'re out, I\'m short a driver, and the city hasn\'t changed. First job\'s on the board — press M.');
  startMission(g.missions, g);
  g.addMessage('Job 1: First Wheels — steal a car.');
}

function continueGame() {
  const data = loadGame();
  if (!data) { newGame(); return; }
  g.player.money = data.money || 250;
  g.missions.index = clamp(data.missionIndex || 0, 0, 5);
  if (Array.isArray(data.packages)) {
    data.packages.forEach((taken, i) => { if (taken && g.missions.packages[i]) g.missions.packages[i].taken = true; });
  }
  if (data.stats) g.stats = data.stats;
  g.screen = SCREEN_PLAY;
  audio.unlock();
  audio.startMusic();
  g.addMessage('Welcome back to Neon Harbor.');
}

function runShot(name) {
  parkCars();
  g.traffic = createTraffic(world, rng, 16);
  g.peds = createPedestrians(world, rng, 26);
  const scene = stageShot(name, g);
  g.canvasW = canvas.width;
  g.canvasH = canvas.height;
  updateCamera(g.camera, g.player.inCar || g.player, !!g.player.inCar, 1, 0);
  let painted = 0;
  function paint() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#11141b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawWorld(ctx, g, canvas.width, canvas.height, g.time);
    drawHud(ctx, g, canvas.width, canvas.height);
    if (scene.screen !== SCREEN_PLAY) drawScreen(ctx, g, canvas.width, canvas.height, scene.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  parkCars();
  g.traffic = createTraffic(world, rng, 16);
  g.peds = createPedestrians(world, rng, 26);
  let accumulator = 0;
  let last = performance.now();
  let menuKeyDown = false;

  function announce(message) { status.textContent = message; }

  function frame(now) {
    requestAnimationFrame(frame);
    g.canvasW = canvas.width;
    g.canvasH = canvas.height;
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (g.screen === SCREEN_TITLE) {
      const actions = input.takeActions();
      const up = input.keys.has('KeyW') || input.keys.has('ArrowUp');
      const down = input.keys.has('KeyS') || input.keys.has('ArrowDown');
      if ((up || down) && !menuKeyDown) {
        menuKeyDown = true;
        const options = g.hasSave ? 3 : 2;
        g.menuIndex = (g.menuIndex + (down ? 1 : -1) + options) % options;
        audio.click();
      } else if (!up && !down) menuKeyDown = false;
      if (actions & ACTION_CONFIRM) {
        if (g.menuIndex === 0) newGame();
        else if (g.menuIndex === 1 && g.hasSave) continueGame();
        else if ((g.menuIndex === 1 && !g.hasSave) || g.menuIndex === 2) g.screen = SCREEN_HELP;
      }
      g.stepWorld(STEP);
    } else if (g.screen === SCREEN_PLAY) {
      while (accumulator >= STEP && g.screen === SCREEN_PLAY) {
        stepPlay(STEP);
        accumulator -= STEP;
      }
      if (g.screen === SCREEN_PLAY) accumulator = Math.min(accumulator, STEP);
    } else if (g.screen === SCREEN_PAUSED) {
      const actions = input.takeActions();
      if (actions & ACTION_PAUSE) g.screen = SCREEN_PLAY;
      else if (actions & ACTION_CONFIRM) g.screen = SCREEN_PLAY;
      accumulator = 0;
    } else if (g.screen === SCREEN_MISSIONS) {
      const actions = input.takeActions();
      if (input.keys.has('KeyM') && !g.mKeyDown) { g.mKeyDown = true; g.screen = SCREEN_PLAY; }
      else if (!input.keys.has('KeyM')) g.mKeyDown = false;
      if (actions & ACTION_CONFIRM) {
        if (!g.missions.active && currentMission(g.missions)) {
          startMission(g.missions, g);
          g.screen = SCREEN_PLAY;
        } else g.screen = SCREEN_PLAY;
      }
      accumulator = 0;
    } else if (g.screen === SCREEN_HELP) {
      const actions = input.takeActions();
      if ((actions & ACTION_HORN) || (actions & ACTION_PAUSE)) g.screen = SCREEN_TITLE;
      accumulator = 0;
    } else if (g.screen === SCREEN_OVER) {
      const actions = input.takeActions();
      if (actions & ACTION_CONFIRM) {
        g.screen = SCREEN_PLAY;
        g.player.hp = g.player.maxHp;
        g.saveProgress();
      }
      accumulator = 0;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#11141b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (g.screen === SCREEN_TITLE) {
      drawWorld(ctx, g, canvas.width, canvas.height, g.time);
      drawScreen(ctx, g, canvas.width, canvas.height, SCREEN_TITLE);
    } else {
      drawWorld(ctx, g, canvas.width, canvas.height, g.time);
      drawHud(ctx, g, canvas.width, canvas.height);
      if (g.screen !== SCREEN_PLAY) drawScreen(ctx, g, canvas.width, canvas.height, g.screen);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && g.screen === SCREEN_PLAY) g.screen = SCREEN_PAUSED;
  });

  announce('Neon Harbor. Press Enter or click to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
