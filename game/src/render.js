// Drawing only: the city, the people and cars on it, the HUD with its
// minimap, and the title, pause, jobs, help and game-over screens.
import {
  AVENUES, BEACH_Y, DISTRICTS, FONT, PALETTE, ROAD_W, STREETS, TUNE,
  WATER_Y, WORLD, clamp,
} from './config.js';
import { districtAt } from './world.js';
import { missionList } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_JOBS = 'jobs';
export const SCREEN_HELP = 'help';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const MINIMAP = { w: 196, h: 147, margin: 14 };

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { w: 1280, h: 800, dpr: 1 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    view.dpr = ratio;
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.round(view.w * ratio);
    canvas.height = Math.round(view.h * ratio);
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || context.textBaseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function circle(x, y, r, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }

  function drawGround(city, cam) {
    // Grass base.
    context.fillStyle = PALETTE.grass;
    context.fillRect(cam.x - 40, cam.y - 40, view.w + 80, view.h + 80);
    // Ocean and sand along the south edge.
    context.fillStyle = PALETTE.waterDeep;
    context.fillRect(cam.x - 40, WATER_Y, view.w + 80, WORLD.h - WATER_Y + 40);
    context.fillStyle = PALETTE.water;
    context.fillRect(cam.x - 40, WATER_Y, view.w + 80, 26);
    context.fillStyle = PALETTE.sand;
    context.fillRect(cam.x - 40, BEACH_Y, view.w + 80, WATER_Y - BEACH_Y);
    // Parks.
    for (const park of city.parks) {
      context.fillStyle = PALETTE.parkDark;
      context.fillRect(park.x, park.y, park.w, park.h);
    }
    // Roads: asphalt bands with centre dashes.
    context.fillStyle = PALETTE.asphalt;
    for (const ax of AVENUES) context.fillRect(ax - ROAD_W / 2, 0, ROAD_W, BEACH_Y);
    for (const sy of STREETS) context.fillRect(0, sy - ROAD_W / 2, WORLD.w, ROAD_W);
    context.fillStyle = PALETTE.lane;
    for (const ax of AVENUES) {
      for (let y = 40; y < BEACH_Y; y += 56) context.fillRect(ax - 2, y, 4, 28);
    }
    for (const sy of STREETS) {
      for (let x = 40; x < WORLD.w; x += 56) context.fillRect(x, sy - 2, 28, 4);
    }
    // Sidewalk curbs around each block.
    context.strokeStyle = PALETTE.curb;
    context.lineWidth = 4;
    for (let ai = 0; ai < AVENUES.length - 1; ai += 1) {
      for (let si = 0; si < STREETS.length - 1; si += 1) {
        const x = AVENUES[ai] + ROAD_W / 2;
        const y = STREETS[si] + ROAD_W / 2;
        const w = AVENUES[ai + 1] - AVENUES[ai] - ROAD_W;
        const h = STREETS[si + 1] - STREETS[si] - ROAD_W;
        context.strokeRect(x, y, w, h);
      }
    }
    // District names on the ground.
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const d of DISTRICTS) {
      context.font = `bold 26px ${FONT}`;
      context.fillStyle = 'rgba(255,255,255,0.16)';
      context.fillText(d.name.toUpperCase(), d.x + d.w / 2, d.y + d.h / 2);
    }
  }

  function drawBuildings(city) {
    for (const b of city.buildings) {
      context.fillStyle = PALETTE.buildingEdge;
      context.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
      context.fillStyle = b.roof;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(b.x + 8, b.y + 8, b.w - 16, 10);
      context.fillStyle = PALETTE.glass;
      for (let wx = b.x + 14; wx < b.x + b.w - 14; wx += 26) {
        context.fillRect(wx, b.y + b.h - 22, 12, 12);
      }
    }
    for (const t of city.trees) {
      circle(t.x, t.y, t.r, PALETTE.treeDark);
      circle(t.x - 2, t.y - 2, t.r - 2, PALETTE.tree);
    }
  }

  function drawCar(car, time) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const w = 46;
    const h = 24;
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.fillRect(-w / 2 + 2, -h / 2 + 3, w, h);
    context.fillStyle = car.color;
    context.beginPath();
    context.roundRect(-w / 2, -h / 2, w, h, 7);
    context.fill();
    context.fillStyle = PALETTE.glass;
    context.fillRect(-4, -h / 2 + 3, 14, h - 6);
    context.fillStyle = '#f8e16c';
    context.fillRect(w / 2 - 3, -h / 2 + 3, 3, 5);
    context.fillRect(w / 2 - 3, h / 2 - 8, 3, 5);
    if (car.kind === 'cop') {
      context.fillStyle = '#e8e4da';
      context.fillRect(-w / 2 + 4, -h / 2, 10, h);
      const flash = Math.floor(time * 4 + car.sirenPhase) % 2 === 0;
      context.fillStyle = flash ? '#e5534b' : '#2f6fd0';
      context.fillRect(-8, -h / 2 - 2, 8, 4);
      context.fillRect(0, -h / 2 - 2, 8, 4);
    }
    if (car.kind === 'mission') {
      context.strokeStyle = '#f2c94c';
      context.lineWidth = 3;
      context.beginPath();
      context.roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 9);
      context.stroke();
    }
    if (car.smoke > 0) {
      context.fillStyle = `rgba(60,60,60,${0.5 * car.smoke})`;
      context.beginPath();
      context.arc(-w / 2 - 6, 0, 8 + Math.random() * 6, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawWorld(state, city, time) {
    drawGround(city, state.camera);
    drawBuildings(city);
    // Cash stashes glint; health kits wait on corners.
    for (const stash of state.stashes) {
      if (stash.taken) continue;
      const pulse = 0.6 + 0.4 * Math.sin(time * 4 + stash.x);
      circle(stash.x, stash.y, 7, `rgba(46,204,113,${pulse})`);
      text('$', stash.x, stash.y + 5, 12, '#ffffff', 'center', 'middle');
    }
    for (const kit of state.healthKits) {
      if (kit.taken) continue;
      context.fillStyle = '#e8e4da';
      context.fillRect(kit.x - 9, kit.y - 9, 18, 18);
      context.fillStyle = '#c0392b';
      context.fillRect(kit.x - 2, kit.y - 7, 4, 14);
      context.fillRect(kit.x - 7, kit.y - 2, 14, 4);
    }
    // Mission waypoint: a pulsing ring on the ground.
    const mission = state.mission;
    if (mission.active && mission.waypoint) {
      const pulse = 10 + 4 * Math.sin(time * 5);
      context.strokeStyle = '#2ecc71';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(mission.waypoint.x, mission.waypoint.y, 18 + pulse, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = '#2ecc71';
      context.beginPath();
      context.arc(mission.waypoint.x, mission.waypoint.y, 5, 0, Math.PI * 2);
      context.fill();
    }
    for (const car of state.cars) drawCar(car, time);
    for (const ped of state.peds) {
      circle(ped.x, ped.y, 10, ped.color);
      context.fillStyle = '#2c2f36';
      context.beginPath();
      context.arc(ped.x + Math.cos(ped.angle) * 10, ped.y + Math.sin(ped.angle) * 10, 3, 0, Math.PI * 2);
      context.fill();
    }
    const p = state.player;
    if (p.onFoot) {
      if (p.invuln === 0 || Math.floor(p.invuln * 10) % 2 === 1) {
        circle(p.x, p.y, 13, PALETTE.player);
        context.strokeStyle = '#2c2f36';
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(p.x, p.y);
        context.lineTo(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20);
        context.stroke();
      }
      if (p.punchTimer > 0) {
        context.strokeStyle = 'rgba(242,201,76,0.8)';
        context.lineWidth = 4;
        context.beginPath();
        context.arc(p.x, p.y, 34, p.punchAngle - 0.9, p.punchAngle + 0.9);
        context.stroke();
      }
    }
    for (const b of state.bullets) {
      context.strokeStyle = '#f8e16c';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    for (const pt of state.particles) {
      context.fillStyle = pt.color;
      context.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      context.beginPath();
      context.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
    }
  }

  function drawMinimap(state) {
    const x0 = view.w - MINIMAP.w - MINIMAP.margin;
    const y0 = MINIMAP.margin;
    const sx = MINIMAP.w / WORLD.w;
    const sy = MINIMAP.h / WORLD.h;
    context.fillStyle = 'rgba(17,20,27,0.85)';
    context.fillRect(x0 - 4, y0 - 4, MINIMAP.w + 8, MINIMAP.h + 8);
    context.fillStyle = PALETTE.waterDeep;
    context.fillRect(x0, y0 + BEACH_Y * sy, MINIMAP.w, (WORLD.h - BEACH_Y) * sy);
    context.fillStyle = PALETTE.asphalt;
    for (const ax of AVENUES) context.fillRect(x0 + ax * sx - 1, y0, 2, BEACH_Y * sy);
    for (const sy2 of STREETS) context.fillRect(x0, y0 + sy2 * sy - 1, MINIMAP.w, 2);
    const mission = state.mission;
    if (mission.active && mission.waypoint) {
      circle(x0 + mission.waypoint.x * sx, y0 + mission.waypoint.y * sy, 4, '#2ecc71');
    }
    for (const car of state.cars) {
      if (car.kind === 'cop') circle(x0 + car.x * sx, y0 + car.y * sy, 3, '#5aa0ff');
    }
    const p = state.player;
    circle(x0 + p.x * sx, y0 + p.y * sy, 4, PALETTE.player);
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1;
    context.strokeRect(x0 + state.camera.x * sx, y0 + state.camera.y * sy, view.w * sx, view.h * sy);
  }

  function drawHud(state) {
    context.textBaseline = 'top';
    text(`$${state.money.toLocaleString('en-US')}`, 16, 14, 28, '#ffffff', 'left');
    text(`Mara Voss — ${districtAt(state.player.x, state.player.y)}`, 16, 48, 15, 'rgba(255,255,255,0.75)', 'left');
    // Wanted stars.
    for (let i = 0; i < 5; i += 1) {
      text('★', 16 + i * 26, 72, 24, i < state.stars ? '#f2c94c' : 'rgba(255,255,255,0.25)', 'left');
    }
    // Health bar.
    context.fillStyle = 'rgba(0,0,0,0.5)';
    context.fillRect(16, 104, 150, 14);
    context.fillStyle = state.hp > 35 ? '#2ecc71' : '#e5534b';
    context.fillRect(16, 104, 150 * clamp(state.hp / TUNE.playerHp, 0, 1), 14);
    text(`HP ${Math.ceil(state.hp)}`, 172, 102, 15, '#ffffff', 'left');
    // Ammo.
    text(`Ammo ${state.ammo} / ${TUNE.pistolAmmo}`, 16, 124, 15, '#ffffff', 'left');
    if (!state.player.onFoot && state.player.car) {
      text(`${Math.round(Math.abs(state.player.car.speed) * 0.12)} mph`, 16, 144, 15, '#f8e16c', 'left');
    }
    // Mission objective.
    const mission = state.mission;
    if (mission.active) {
      text(mission.text, 16, view.h - 72, 17, '#ffffff', 'left');
      if (mission.timer > 0) text(`${Math.ceil(mission.timer)}s`, 16, view.h - 46, 17, '#f2c94c', 'left');
      if (mission.waypoint) {
        const d = Math.hypot(mission.waypoint.x - state.player.x, mission.waypoint.y - state.player.y);
        text(`${Math.round(d)}m`, 16, view.h - 46, 17, '#2ecc71', 'left');
      }
    } else if (mission.text) {
      text(mission.text, 16, view.h - 72, 17, '#2ecc71', 'left');
    } else {
      text('Press M for jobs — Lennox is hiring', 16, view.h - 72, 17, 'rgba(255,255,255,0.75)', 'left');
    }
    text('WASD move · E car · F punch · Click shoot · Space brake · P pause · M jobs · H help', 16, view.h - 22, 13, 'rgba(255,255,255,0.55)', 'left');
    drawMinimap(state);
    // Off-screen waypoint arrow.
    if (mission.active && mission.waypoint) {
      const wx = mission.waypoint.x;
      const wy = mission.waypoint.y;
      const cam = state.camera;
      if (wx < cam.x || wx > cam.x + view.w || wy < cam.y || wy > cam.y + view.h) {
        const cx = clamp(wx, cam.x + 60, cam.x + view.w - 60);
        const cy = clamp(wy, cam.y + 60, cam.y + view.h - 60);
        const angle = Math.atan2(wy - state.player.y, wx - state.player.x);
        context.save();
        context.translate(cx - cam.x, cy - cam.y);
        context.rotate(angle);
        context.fillStyle = '#2ecc71';
        context.beginPath();
        context.moveTo(18, 0);
        context.lineTo(-10, -12);
        context.lineTo(-10, 12);
        context.closePath();
        context.fill();
        context.restore();
      }
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const lineH = 30;
    const height = 150 + lines.length * lineH;
    const x = (view.w - width) / 2;
    const y = (view.h - height) / 2;
    context.fillStyle = 'rgba(17,20,27,0.92)';
    context.fillRect(x, y, width, height);
    context.strokeStyle = accent || '#f2c94c';
    context.lineWidth = 3;
    context.strokeRect(x, y, width, height);
    context.textBaseline = 'alphabetic';
    text(title, view.w / 2, y + 62, 40, '#ffffff', 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], view.w / 2, y + 108 + i * lineH, 18, 'rgba(255,255,255,0.8)', 'center');
    }
    text(prompt, view.w / 2, y + height - 26, 19, '#f2c94c', 'center');
  }

  function drawJobs(state) {
    const list = missionList(state);
    const width = 680;
    const rowH = 92;
    const height = 170 + list.length * rowH;
    const x = (view.w - width) / 2;
    const y = (view.h - height) / 2;
    context.fillStyle = 'rgba(17,20,27,0.94)';
    context.fillRect(x, y, width, height);
    context.strokeStyle = '#f2c94c';
    context.lineWidth = 3;
    context.strokeRect(x, y, width, height);
    text('Jobs — Lennox', view.w / 2, y + 56, 36, '#ffffff', 'center');
    text('Press 1-5 to take a job · M or Esc to close', view.w / 2, y + 88, 16, 'rgba(255,255,255,0.7)', 'center');
    list.forEach((m, i) => {
      const ry = y + 118 + i * rowH;
      const status = m.done ? 'DONE ✓' : m.active ? 'ACTIVE' : m.available ? `$${m.payout}` : 'LOCKED';
      const color = m.done ? '#2ecc71' : m.active ? '#f2c94c' : m.available ? '#ffffff' : 'rgba(255,255,255,0.4)';
      text(`${i + 1}. ${m.title} — ${m.giver}`, x + 28, ry, 20, color, 'left');
      text(status, x + width - 28, ry, 20, color, 'right');
      text(m.brief, x + 28, ry + 28, 14, 'rgba(255,255,255,0.65)', 'left');
      context.strokeStyle = 'rgba(255,255,255,0.15)';
      context.beginPath();
      context.moveTo(x + 28, ry + 52);
      context.lineTo(x + width - 28, ry + 52);
      context.stroke();
    });
  }

  function draw(state, city, screen) {
    const time = state.time;
    context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    context.fillStyle = '#11141b';
    context.fillRect(0, 0, view.w, view.h);
    // Camera follows the player, clamped to the world.
    const cam = state.camera;
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    context.save();
    context.translate(-cam.x + shakeX, -cam.y + shakeY);
    drawWorld(state, city, time);
    context.restore();
    if (screen === SCREEN_TITLE) {
      drawPanel('NEON HARBOR', [
        'A sun-soaked coastal city. You are Mara Voss, getaway driver.',
        'Steal cars, outrun the Harbor PD, take Lennox’s jobs,',
        'and stay one step ahead of Viktor Kade.',
        '',
        `Money $${state.money.toLocaleString('en-US')} · Jobs done ${state.completed.filter(Boolean).length} / 5`,
      ], 'Press Enter or click to start', '#f2c94c');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city waits for no one — except now.'], 'Press P to resume');
    } else if (screen === SCREEN_JOBS) {
      drawJobs(state);
    } else if (screen === SCREEN_HELP) {
      drawPanel('How to play', [
        'WASD / arrows — walk or drive · Shift — run',
        'E — enter / exit a car · F — punch · Click — shoot',
        'Space — handbrake · M — jobs · P — pause',
        'Steal cars, grab green cash stashes, find white health kits.',
        'Stars mean the Harbor PD is coming. Lose them or get busted.',
      ], 'Press H or Esc to close');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Harbor PD caught up with Mara.', `They took $${Math.min(state.money, 200)} in fines.`], 'Press Enter to get back out there', '#5aa0ff');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', ['Mara went down in Neon Harbor.', 'The city keeps moving without her.'], 'Press Enter to try again', '#e5534b');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, view };
}
