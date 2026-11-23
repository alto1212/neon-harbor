// The screenshot scenes behind ?shot=chase|drive|mission|start. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot, so the frame is what a short game really looks like and the same seed
// always gives nearly the same frame.
import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './hud.js';
import { addHeat } from './police.js';
import { startMission } from './missions.js';
import { createCar, driveCar } from './entities.js';
import { angleTo, clamp } from './config.js';

// Steer a car along a route of waypoints, like traffic does.
function autopilotDrive(g, car, route, dt) {
  if (!route.target) {
    const from = g.world.nearestIntersection(car.x, car.y);
    const dest = g.world.randomRoadPoint();
    const to = g.world.nearestIntersection(dest.x, dest.y);
    route.points = g.world.route(from, to);
    route.target = route.points.shift() || null;
  }
  if (!route.target) return;
  const desired = angleTo(car.x, car.y, route.target.x, route.target.y);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  driveCar(car, { throttle: 1, steer: clamp(diff * 2.2, -1, 1), brake: false }, dt, g.world, g.allCars);
  const dx = route.target.x - car.x, dy = route.target.y - car.y;
  if (dx * dx + dy * dy < 50 * 50) route.target = route.points.shift() || null;
}

export function stageShot(name, g) {
  const S = name === 'drive' ? 'drive' : name === 'mission' ? 'mission' : name === 'chase' ? 'chase' : 'start';
  if (S === 'start') {
    // Title screen over a living downtown: traffic and pedestrians move.
    g.player.x = 1460; g.player.y = 1010;
    g.camera.x = 1460; g.camera.y = 1010; g.camera.zoom = 0.9;
    for (let i = 0; i < 8 / STEP; i += 1) g.stepWorld(STEP, null);
    return { screen: SCREEN_TITLE };
  }
  if (S === 'drive') {
    // Mara driving her sports car through downtown, traffic around her.
    const car = createCar('sports', 1140, 730, 0, '#e84a7a');
    g.player.inCar = car;
    g.player.x = car.x; g.player.y = car.y;
    g.allCars.push(car);
    const route = { points: [], target: null };
    for (let i = 0; i < 11 / STEP; i += 1) {
      autopilotDrive(g, car, route, STEP);
      g.player.x = car.x; g.player.y = car.y; g.player.angle = car.angle;
      g.stepWorld(STEP, null);
    }
    return { screen: SCREEN_PLAY };
  }
  if (S === 'chase') {
    // Mission five in progress: four stars, patrol cars on her tail, the marina ahead.
    g.missions.index = 4;
    startMission(g.missions, g);
    g.missions.step = 1;
    g.missions.timer = 0;
    g.missions.objective = 'Survive the chase — 90 seconds';
    addHeat(g.police, 12);
    const car = createCar('sports', 1780, 1010, 0, '#39c0d8');
    g.player.inCar = car;
    g.player.x = car.x; g.player.y = car.y;
    g.allCars.push(car);
    const route = { points: [], target: null };
    for (let i = 0; i < 9 / STEP; i += 1) {
      autopilotDrive(g, car, route, STEP);
      g.player.x = car.x; g.player.y = car.y; g.player.angle = car.angle;
      g.stepWorld(STEP, null);
    }
    return { screen: SCREEN_PLAY };
  }
  // Mission four at the bank: Mara on foot, pistol out, guards closing in.
  g.missions.index = 3;
  startMission(g.missions, g);
  g.missions.step = 1;
  g.missions.objective = 'Hold the vault — stay at the marker';
  g.missions.holdT = 2.2;
  g.player.weapon = 'pistol';
  g.player.ammo = 12;
  const bank = g.world.landmarks.bank;
  g.player.x = bank.x + 40;
  g.player.y = bank.y + 110;
  g.player.angle = angleTo(g.player.x, g.player.y, bank.x, bank.y);
  addHeat(g.police, 6);
  g.missions.guardsSpawned = false;
  for (let i = 0; i < 6 / STEP; i += 1) g.stepWorld(STEP, null);
  return { screen: SCREEN_PLAY };
}
