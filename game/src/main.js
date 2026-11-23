// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game moves
// between title, play, paused, jobs, help, busted and wasted screens.
//
// ?seed=N fixes the city. ?shot=chase|drive|mission|start (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP, TUNE, WORLD, clamp, dist2 } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_BUSTED, EVENT_CRASH, EVENT_MISSION, EVENT_PICKUP, EVENT_WASTED,
  collideCircle, createCity, createState,
} from './world.js';
import {
  addWanted, collectPickups, punch, shootAt, spawnParked, spawnPeds,
  spawnTraffic, tryEnterCar, updateBullets, updateCops, updateParticles,
  updatePeds, updatePlayer, updateTraffic,
} from './entities.js';
import { cancelMission, missionList, startMission, updateMission } from './missions.js';
import {
  SCREEN_BUSTED, SCREEN_HELP, SCREEN_JOBS, SCREEN_PAUSED, SCREEN_PLAY,
  SCREEN_TITLE, SCREEN_WASTED, createRenderer,
} from './render.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_HELP, ACTION_JOBS, ACTION_PAUSE,
  ACTION_PUNCH, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { loadSave, saveGame } from './save.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;
const PLAYER_START = { x: 1460, y: 1010 };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
const city = createCity(random);
const state = createState(city, random, loadSave());
spawnParked(state, city, random);
spawnTraffic(state, city, random, 14);
spawnPeds(state, city, random, 22);
const renderer = createRenderer(canvas);
const audio = createAudio();

function followCamera() {
  const view = renderer.view;
  const maxX = Math.max(0, WORLD.w - view.w);
  const maxY = Math.max(0, WORLD.h - view.h);
  state.camera.x = clamp(state.player.x - view.w / 2, 0, maxX);
  state.camera.y = clamp(state.player.y - view.h / 2, 0, maxY);
}

function resetAfterDown() {
  const p = state.player;
  p.x = PLAYER_START.x;
  p.y = PLAYER_START.y;
  p.angle = -Math.PI / 2;
  p.onFoot = true;
  p.car = null;
  p.invuln = 1;
  state.hp = TUNE.playerHp;
  state.wanted = 0;
  state.stars = 0;
  state.bustedTimer = 0;
  state.cars = state.cars.filter((c) => c.kind !== 'cop');
  for (const kit of state.healthKits) kit.taken = false;
  cancelMission(state);
  followCamera();
}

function runShot(name) {
  const scene = stageShot(name, city, state, random);
  let painted = 0;
  function paint() {
    renderer.draw(state, city, scene.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  // Jobs menu: number keys take a job.
  window.addEventListener('keydown', (event) => {
    if (screen !== SCREEN_JOBS || !/^Digit[1-5]$/.test(event.code)) return;
    const index = Number(event.code.slice(5)) - 1;
    const list = missionList(state);
    const job = list[index];
    if (!job.available || job.done || state.mission.active) return;
    startMission(state, city, random, index);
    audio.resume();
    screen = SCREEN_PLAY;
    announce(`Job started: ${job.title}.`);
  });

  function startGame() {
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.resume();
    announce('Playing. Mara Voss is on the streets of Neon Harbor.');
  }

  function doBusted() {
    const fine = Math.min(state.money, 200);
    state.money -= fine;
    resetAfterDown();
    screen = SCREEN_BUSTED;
    audio.busted();
    audio.siren(false);
    audio.engine(false, 0);
    saveGame(state);
    announce(`Busted. Fined $${fine}.`);
  }

  function doWasted() {
    const bill = Math.min(state.money, 200);
    state.money -= bill;
    resetAfterDown();
    screen = SCREEN_WASTED;
    audio.wasted();
    audio.siren(false);
    audio.engine(false, 0);
    saveGame(state);
    announce(`Wasted. Hospital bill $${bill}.`);
  }

  function collideCars(dt) {
    const cars = state.cars;
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 42 * 42 || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (42 - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const rel = Math.abs(a.speed - b.speed);
        if (rel > 200 && (a.kind === 'player' || b.kind === 'player')) {
          state.events |= EVENT_CRASH;
          state.shake = Math.min(10, rel / 50);
          const playerCar = a.kind === 'player' ? a : b;
          playerCar.hp -= rel / 25;
          if (playerCar.hp <= 0 && state.player.car === playerCar) {
            state.player.onFoot = true;
            state.player.car = null;
            state.player.x = playerCar.x + 34;
            state.player.y = playerCar.y;
            playerCar.kind = 'parked';
            playerCar.driver = 'none';
            playerCar.speed = 0;
            playerCar.smoke = 1;
          }
        }
        a.speed *= 0.92;
        b.speed *= 0.92;
      }
    }
  }

  function runOverCheck(dt) {
    const p = state.player;
    if (!p.onFoot || p.invuln > 0) return;
    for (const car of state.cars) {
      if (Math.abs(car.speed) < 80) continue;
      if (dist2(p.x, p.y, car.x, car.y) < 32 * 32) {
        state.hp -= 20;
        p.invuln = 1;
        const away = Math.atan2(p.y - car.y, p.x - car.x);
        p.x += Math.cos(away) * 40;
        p.y += Math.sin(away) * 40;
        collideCircle(city, p, TUNE.playerRadius);
        state.events |= EVENT_CRASH;
        state.shake = 6;
        break;
      }
    }
  }

  function step(dt) {
    state.events = 0;
    // Shooting: mouse click aims at the world point under the cursor.
    if (input.takeMouseClick() && state.player.onFoot) {
      const mouse = input.mouse();
      shootAt(state, city, state.camera.x + mouse.x, state.camera.y + mouse.y);
    }
    updatePlayer(state, city, input, 0, dt);
    updateTraffic(state, city, dt);
    updatePeds(state, city, dt);
    updateCops(state, city, random, dt);
    updateBullets(state, city, dt);
    updateParticles(state, dt);
    updateMission(state, city, dt);
    // Wanted cools off; the beach hideout (mission 3) doubles the cooldown.
    if (state.wanted > 0) {
      const atHideout = state.mission.active && state.mission.index === 2
        && Math.hypot(state.player.x - 1600, state.player.y - 2280) < 140;
      addWanted(state, -TUNE.wantedDecay * (atHideout ? 2 : 1) * dt);
    }
    // Ammo trickles back.
    state.ammoTimer += dt;
    if (state.ammoTimer >= 1.5) {
      state.ammoTimer = 0;
      if (state.ammo < TUNE.pistolAmmo) state.ammo += 1;
    }
    collectPickups(state, city);
    collideCars(dt);
    runOverCheck(dt);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - 30 * dt);
    followCamera();
    state.time += dt;

    // Sound from what just happened.
    if (state.events & EVENT_CRASH) audio.crash();
    if (state.events & EVENT_PICKUP) audio.pickup();
    if (state.events & EVENT_MISSION) audio.mission();
    audio.siren(state.stars > 0);
    const p = state.player;
    audio.engine(!p.onFoot && !!p.car, p.car ? Math.abs(p.car.speed) / TUNE.carMaxSpeed : 0);

    if (state.events & EVENT_BUSTED) { doBusted(); return; }
    if (state.hp <= 0) { doWasted(); return; }
    if (state.events & (EVENT_MISSION | EVENT_PICKUP)) saveGame(state);
  }

  function attractStep(dt) {
    state.events = 0;
    updateTraffic(state, city, dt);
    updatePeds(state, city, dt);
    updateParticles(state, dt);
    // Slow drift over the city behind the title screen.
    state.camera.x = clamp(1600 + Math.sin(state.time * 0.03) * 500 - renderer.view.w / 2, 0, Math.max(0, WORLD.w - renderer.view.w));
    state.camera.y = clamp(1200 + Math.cos(state.time * 0.02) * 350 - renderer.view.h / 2, 0, Math.max(0, WORLD.h - renderer.view.h));
    state.time += dt;
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_ENTER && screen === SCREEN_PLAY) {
      tryEnterCar(state, city);
      audio.resume();
    }
    if (actions & ACTION_PUNCH && screen === SCREEN_PLAY) {
      punch(state, city);
      audio.punch();
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_BUSTED || screen === SCREEN_WASTED)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    } else if (actions & ACTION_JOBS && (screen === SCREEN_PLAY || screen === SCREEN_JOBS)) {
      screen = screen === SCREEN_JOBS ? SCREEN_PLAY : SCREEN_JOBS;
    } else if (actions & ACTION_HELP && (screen === SCREEN_PLAY || screen === SCREEN_HELP)) {
      screen = screen === SCREEN_HELP ? SCREEN_PLAY : SCREEN_HELP;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        attractStep(STEP);
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step(STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(state, city, screen);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Neon Harbor. Press Enter or click to start.');
  followCamera();
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
