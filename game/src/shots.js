// The screenshot scenes behind ?shot=chase|drive|mission|start. Each one
// plays the real rules forward from a fresh city for a fixed number of
// steps, steered by a simple autopilot, so the frame is what a short game
// really looks like and the same seed always gives the same frame.
import { STEP, TUNE, WORLD, angleDiff, angleTo, clamp } from './config.js';
import { createState, makeCar } from './world.js';
import {
  collectPickups, addWanted, spawnParked, spawnPeds, spawnTraffic,
  updateBullets, updateCops, updateParticles, updatePeds, updatePlayer,
  updateTraffic,
} from './entities.js';
import { startMission, updateMission } from './missions.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const VIEW_W = 1280;
const VIEW_H = 800;

function resetRun(state, city, random) {
  const fresh = createState(city, random, null);
  for (const key of Object.keys(fresh)) state[key] = fresh[key];
  state.cars = [];
  state.peds = [];
  state.bullets = [];
  state.particles = [];
  for (const stash of state.stashes) stash.taken = false;
  for (const kit of state.healthKits) kit.taken = false;
  spawnParked(state, city, random);
  spawnTraffic(state, city, random, 14);
  spawnPeds(state, city, random, 22);
}

function followCamera(state) {
  state.camera.x = clamp(state.player.x - VIEW_W / 2, 0, WORLD.w - VIEW_W);
  state.camera.y = clamp(state.player.y - VIEW_H / 2, 0, WORLD.h - VIEW_H);
}

function simStep(state, city, input, dt, random) {
  state.events = 0;
  updatePlayer(state, city, input, 0, dt);
  updateTraffic(state, city, dt);
  updatePeds(state, city, dt);
  updateCops(state, city, random, dt);
  updateBullets(state, city, dt);
  updateParticles(state, dt);
  updateMission(state, city, dt);
  if (state.wanted > 0) addWanted(state, -TUNE.wantedDecay * dt);
  collectPickups(state, city);
  followCamera(state);
  state.time += dt;
}

// An input object the autopilot fills in each step.
function autoInput() {
  const input = {
    _mx: 0, _my: 0, _up: false, _down: false, _left: false, _right: false, _brake: false,
    moveX() { return this._mx; },
    moveY() { return this._my; },
    up() { return this._up; },
    down() { return this._down; },
    left() { return this._left; },
    right() { return this._right; },
    run() { return false; },
    brake() { return this._brake; },
    mouse() { return { x: 0, y: 0, down: false }; },
    takeMouseClick() { return false; },
    takeActions() { return 0; },
  };
  return input;
}

function driveToward(state, input, tx, ty) {
  const car = state.player.car;
  if (!car) return;
  const want = angleTo(car.x, car.y, tx, ty);
  const diff = angleDiff(car.angle, want);
  const dist = Math.hypot(tx - car.x, ty - car.y);
  // Cruise fast on the straight, slow for the corner — and never stall
  // short of a waypoint: keep some throttle until the speed is up.
  const desired = dist > 200 ? 420 : 150;
  input._up = car.speed < desired;
  input._brake = dist < 110 && Math.abs(diff) > 0.6 && car.speed > 150;
  input._left = diff < -0.08;
  input._right = diff > 0.08;
}

function walkToward(state, input, tx, ty) {
  const p = state.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const len = Math.hypot(dx, dy) || 1;
  input._mx = dx / len;
  input._my = dy / len;
}

function putPlayerInCar(state, x, y, angle) {
  const car = makeCar(Math.random, x, y, angle, 'player');
  car.driver = 'player';
  state.cars.push(car);
  const p = state.player;
  p.onFoot = false;
  p.car = car;
  p.x = x;
  p.y = y;
  p.angle = angle;
  followCamera(state);
}

/**
 * Set the city and state to the named scene and return the screen to draw.
 * Any unknown name is the title scene.
 */
export function stageShot(name, city, state, random) {
  resetRun(state, city, random);
  const input = autoInput();

  if (name === 'chase') {
    // Four-star chase downtown: Mara in a car, three Harbor PD units behind.
    putPlayerInCar(state, 1780, 1010, 0);
    addWanted(state, 80);
    for (let i = 0; i < 3; i += 1) {
      const cop = makeCar(random, 1780 - 120 - i * 90, 1010 + (i - 1) * 44, 0, 'cop');
      cop.speed = 420;
      state.cars.push(cop);
    }
    const route = [{ x: 2420, y: 1010 }, { x: 2420, y: 1570 }, { x: 1780, y: 1570 }, { x: 1780, y: 1010 }];
    let leg = 0;
    for (let i = 0; i < 8 / STEP; i += 1) {
      const target = route[leg];
      if (Math.hypot(target.x - state.player.x, target.y - state.player.y) < 90) leg = (leg + 1) % route.length;
      driveToward(state, input, route[leg].x, route[leg].y);
      simStep(state, city, input, STEP, random);
    }
    return { screen: SCREEN_PLAY };
  }

  if (name === 'drive') {
    // A quiet cruise down the Marina avenue toward the beach.
    putPlayerInCar(state, 1460, 1570, Math.PI / 2);
    const route = [{ x: 1460, y: 2130 }, { x: 1780, y: 2130 }, { x: 1780, y: 1850 }];
    let leg = 0;
    for (let i = 0; i < 6 / STEP; i += 1) {
      const target = route[leg];
      if (Math.hypot(target.x - state.player.x, target.y - state.player.y) < 90) leg = Math.min(leg + 1, route.length - 1);
      driveToward(state, input, route[leg].x, route[leg].y);
      simStep(state, city, input, STEP, random);
    }
    return { screen: SCREEN_PLAY };
  }

  if (name === 'mission') {
    // Hot Cargo: Mara on foot at the Docks, walking in to grab the package.
    startMission(state, city, random, 1);
    state.player.x = 1960;
    state.player.y = 450;
    state.player.onFoot = true;
    followCamera(state);
    for (let i = 0; i < 3 / STEP; i += 1) {
      walkToward(state, input, 2420, 450);
      simStep(state, city, input, STEP, random);
    }
    return { screen: SCREEN_PLAY };
  }

  // Title: the city alive behind the start screen.
  for (let i = 0; i < 5 / STEP; i += 1) simStep(state, city, input, STEP, random);
  return { screen: SCREEN_TITLE };
}
