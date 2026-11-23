// Five story jobs for getaway driver Mara Voss, handed out by fixer Lennox
// against Viktor Kade. Each mission is a short chain of stages — go somewhere,
// pick something up, drive something somewhere, lose the heat — with a
// payout on the last stage.
import { MONEY, TUNE } from './config.js';
import { EVENT_MISSION, makeCar } from './world.js';
import { addWanted } from './entities.js';

export const MISSIONS = [
  {
    title: 'First Gear', giver: 'Lennox', payout: MONEY.mission[0],
    brief: 'Lennox needs a driver he can trust. Take his car from the Downtown garage to the Marina drop. 90 seconds.',
    stages: [
      { type: 'enter', x: 1460, y: 730, text: 'Get in Lennox’s car at the Downtown garage' },
      { type: 'deliver', x: 1460, y: 1570, text: 'Drive to the Marina drop-off', time: 90 },
    ],
  },
  {
    title: 'Hot Cargo', giver: 'Lennox', payout: MONEY.mission[1],
    brief: 'A package is waiting at the Docks. Carry it to the Old Town safehouse — and expect company once you grab it.',
    stages: [
      { type: 'channel', x: 2420, y: 450, text: 'Pick up the package at the Docks', channel: 1.5 },
      { type: 'deliver', x: 500, y: 450, text: 'Deliver the package to the Old Town safehouse' },
    ],
  },
  {
    title: 'Heat Wave', giver: 'Lennox', payout: MONEY.mission[2],
    brief: 'A job went loud and the whole Harbor PD is looking for you. Lose the three-star heat — the beach hideout cools things twice as fast.',
    stages: [
      { type: 'loseHeat', x: 1600, y: 2280, text: 'Lose the heat — hide out at the beach if you need to' },
    ],
  },
  {
    title: 'The Kade Job', giver: 'Lennox', payout: MONEY.mission[3],
    brief: 'Viktor Kade keeps his gold coupe in Downtown. Steal it and bring it to Lennox’s lockup in Northside. He will send everyone.',
    stages: [
      { type: 'enter', x: 1780, y: 730, text: 'Steal Kade’s gold coupe in Downtown' },
      { type: 'deliver', x: 820, y: 1290, text: 'Deliver the coupe to the Northside lockup' },
    ],
  },
  {
    title: 'Harbor Heist', giver: 'Lennox', payout: MONEY.mission[4],
    brief: 'The Marina casino vault, one quiet walk in, then run. Four stars the moment you touch the cash — get to the boat at the south pier.',
    stages: [
      { type: 'channel', x: 1780, y: 1290, text: 'Crack the Marina casino vault', channel: 5 },
      { type: 'deliver', x: 2600, y: 2290, text: 'Escape to the getaway boat at the south pier' },
    ],
  },
];

function setStage(state, stage) {
  const mission = state.mission;
  mission.stage = stage;
  const def = MISSIONS[mission.index].stages[stage];
  mission.waypoint = { x: def.x, y: def.y };
  mission.text = def.text;
  mission.timer = def.time || 0;
  mission.channel = 0;
}

export function startMission(state, city, random, index) {
  const def = MISSIONS[index];
  const mission = state.mission;
  mission.index = index;
  mission.active = true;
  mission.targetCar = null;
  // Mission cars: a gold coupe waiting where the job says.
  if (index === 0 || index === 3) {
    const spot = def.stages[0];
    const car = makeCar(random, spot.x, spot.y, 0, 'mission');
    car.color = '#d9a03d';
    state.cars.push(car);
    mission.targetCar = car;
  }
  if (index === 2) addWanted(state, 60);
  setStage(state, 0);
  state.events |= EVENT_MISSION;
}

export function cancelMission(state) {
  const mission = state.mission;
  if (mission.targetCar && mission.targetCar.kind === 'mission') {
    mission.targetCar.kind = 'parked';
    mission.targetCar.driver = 'none';
  }
  mission.active = false;
  mission.index = -1;
  mission.waypoint = null;
  mission.text = '';
  mission.targetCar = null;
}

function completeMission(state) {
  const mission = state.mission;
  const def = MISSIONS[mission.index];
  state.money += def.payout;
  state.stats.earned += def.payout;
  state.completed[mission.index] = true;
  if (mission.targetCar && mission.targetCar.kind === 'mission') {
    mission.targetCar.kind = 'parked';
    mission.targetCar.driver = 'none';
  }
  state.events |= EVENT_MISSION;
  mission.active = false;
  mission.index = -1;
  mission.waypoint = null;
  mission.text = 'Job done. Lennox paid you.';
  mission.targetCar = null;
}

function failMission(state, text) {
  const mission = state.mission;
  if (mission.targetCar && mission.targetCar.kind === 'mission') {
    mission.targetCar.kind = 'parked';
    mission.targetCar.driver = 'none';
  }
  mission.active = false;
  mission.index = -1;
  mission.waypoint = null;
  mission.text = text;
  mission.targetCar = null;
}

export function updateMission(state, city, dt) {
  const mission = state.mission;
  if (!mission.active) return;
  const def = MISSIONS[mission.index];
  const stage = def.stages[mission.stage];
  const p = state.player;

  if (mission.timer > 0) {
    mission.timer -= dt;
    if (mission.timer <= 0) {
      failMission(state, 'Too slow — Lennox found someone else.');
      return;
    }
  }

  if (stage.type === 'goto' || stage.type === 'deliver') {
    const needCar = mission.targetCar !== null && stage.type === 'deliver';
    const inCar = needCar ? p.car === mission.targetCar : true;
    const d = Math.hypot(p.x - stage.x, p.y - stage.y);
    if (d < 52 && inCar) advance(state, def);
    return;
  }
  if (stage.type === 'enter') {
    if (mission.targetCar && p.car === mission.targetCar) advance(state, def);
    return;
  }
  if (stage.type === 'channel') {
    if (!p.onFoot) { mission.channel = 0; return; }
    const d = Math.hypot(p.x - stage.x, p.y - stage.y);
    if (d < 52) {
      mission.channel += dt;
      if (mission.channel >= stage.channel) {
        if (mission.index === 1) addWanted(state, 40);
        if (mission.index === 4) addWanted(state, 80);
        advance(state, def);
      }
    } else {
      mission.channel = 0;
    }
    return;
  }
  if (stage.type === 'loseHeat') {
    // The beach hideout doubles the cooldown.
    if (state.wanted <= 0) {
      completeMission(state);
    }
  }
}

function advance(state, def) {
  const mission = state.mission;
  if (mission.stage + 1 >= def.stages.length) {
    completeMission(state);
    return;
  }
  setStage(state, mission.stage + 1);
  state.events |= EVENT_MISSION;
}

export function missionList(state) {
  return MISSIONS.map((m, i) => ({
    index: i,
    title: m.title,
    giver: m.giver,
    payout: m.payout,
    brief: m.brief,
    done: state.completed[i],
    available: i === 0 || state.completed[i - 1],
    active: state.mission.active && state.mission.index === i,
  }));
}
