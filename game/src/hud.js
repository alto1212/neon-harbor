// The HUD: health, money, wanted stars, the minimap, objective banner,
// dialogue and message feed — plus the title, pause, missions and end screens.
import { AVENUES, STREETS, WORLD, formatClock, formatMoney } from './config.js';
import { MISSIONS, currentMission } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_MISSIONS = 'missions';
export const SCREEN_HELP = 'help';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function panel(ctx, x, y, w, h, fill) {
  ctx.fillStyle = fill || 'rgba(16,20,28,0.82)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawStars(ctx, x, y, wanted) {
  ctx.font = '22px ' + FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < wanted ? '#ffd640' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', x + i * 26, y);
  }
}

function drawMinimap(ctx, g, x, y, w, h) {
  const sx = w / WORLD.w, sy = h / WORLD.h;
  panel(ctx, x - 6, y - 6, w + 12, h + 12);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#20262e';
  ctx.fillRect(x, y, w, h);
  // Water and sand.
  ctx.fillStyle = '#2e7f9e';
  ctx.fillRect(x + 2920 * sx, y, (WORLD.w - 2920) * sx, h);
  ctx.fillStyle = '#e3cd9a';
  ctx.fillRect(x + 2830 * sx, y, 90 * sx, h);
  // Roads.
  ctx.fillStyle = '#565b66';
  for (const ax of AVENUES) ctx.fillRect(x + (ax - 26) * sx, y, 52 * sx, h);
  for (const sy2 of STREETS) ctx.fillRect(x, y + (sy2 - 26) * sy, w, 52 * sy);
  // Landmarks.
  ctx.fillStyle = '#37d67a';
  const lm = g.world.landmarks;
  ctx.fillRect(x + lm.safehouse.x * sx - 2, y + lm.safehouse.y * sy - 2, 4, 4);
  // Mission marker.
  const marker = g.missionMarker;
  if (marker) {
    const pulse = 3 + Math.sin(g.time * 5) * 1.5;
    ctx.fillStyle = '#ffd640';
    ctx.beginPath();
    ctx.arc(x + marker.x * sx, y + marker.y * sy, pulse + 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police blips.
  for (const cop of g.police.cops) {
    ctx.fillStyle = Math.floor(g.time * 4) % 2 === 0 ? '#ff3b30' : '#2f6bff';
    ctx.beginPath();
    ctx.arc(x + cop.car.x * sx, y + cop.car.y * sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  const px = x + g.player.x * sx, py = y + g.player.y * sy;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(g.player.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // Viewport frame.
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  const vw = g.canvasW / g.camera.zoom, vh = g.canvasH / g.camera.zoom;
  ctx.strokeRect(
    x + (g.camera.x - vw / 2) * sx, y + (g.camera.y - vh / 2) * sy,
    vw * sx, vh * sy,
  );
}

export function drawHud(ctx, g, vw, vh) {
  const player = g.player;
  ctx.textBaseline = 'alphabetic';
  // Top-left: health, money, weapon.
  panel(ctx, 14, 14, 250, 86);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px ' + FONT;
  ctx.textAlign = 'left';
  ctx.fillText('MARA VOSS', 26, 36);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(26, 46, 150, 10);
  ctx.fillStyle = player.hp > 30 ? '#37d67a' : '#e5484d';
  ctx.fillRect(26, 46, 150 * Math.max(0, player.hp / player.maxHp), 10);
  ctx.fillStyle = '#ffd640';
  ctx.font = 'bold 17px ' + FONT;
  ctx.fillText(formatMoney(player.money), 26, 80);
  ctx.fillStyle = '#c9cdd4';
  ctx.font = '14px ' + FONT;
  const weapon = player.weapon === 'pistol' ? `Pistol  ${player.ammo}` : 'Fists';
  ctx.fillText(weapon, 190, 80);

  // Top-right: wanted stars and minimap.
  panel(ctx, vw - 224, 14, 210, 40);
  drawStars(ctx, vw - 210, 35, g.police.wanted);
  drawMinimap(ctx, g, vw - 214, 64, 190, 142);

  // Top-centre: objective.
  ctx.font = 'bold 15px ' + FONT;
  const obj = g.missions.objective;
  const objW = ctx.measureText(obj).width + 32;
  panel(ctx, (vw - objW) / 2, 14, objW, 34);
  ctx.fillStyle = '#ffd640';
  ctx.textAlign = 'center';
  ctx.fillText(obj, vw / 2, 37);
  if (g.missions.active) {
    const def = currentMission(g.missions);
    const step = def && def.steps[g.missions.step];
    if (step && step.time !== undefined) {
      const left = Math.max(0, step.time - g.missions.timer);
      ctx.fillStyle = left < 20 ? '#e5484d' : '#fff';
      ctx.font = 'bold 20px ' + FONT;
      ctx.fillText(`⏱ ${Math.ceil(left)}s`, vw / 2, 66);
    }
  }

  // Bottom-left: district and clock.
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 16px ' + FONT;
  ctx.fillText(g.world.districtAt(player.x, player.y), 18, vh - 44);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '14px ' + FONT;
  ctx.fillText(formatClock(g.clock), 18, vh - 22);

  // Bottom-right: speed when driving.
  if (player.inCar) {
    const kmh = Math.round(Math.abs(player.inCar.speed) * 0.36);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px ' + FONT;
    ctx.fillText(kmh + ' km/h', vw - 18, vh - 24);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '13px ' + FONT;
    ctx.fillText(player.inCar.name + '  •  ' + Math.round(player.inCar.hp) + '%', vw - 18, vh - 48);
  } else {
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '13px ' + FONT;
    ctx.fillText('E — enter car   F — punch   Click — shoot', vw - 18, vh - 24);
  }

  // Arrest warning.
  if (g.police.arrestT > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff3b30';
    ctx.font = 'bold 30px ' + FONT;
    ctx.fillText('BUSTED!', vw / 2, vh / 2 - 60);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(vw / 2 - 100, vh / 2 - 40, 200, 10);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(vw / 2 - 100, vh / 2 - 40, 200 * (g.police.arrestT / 1.2), 10);
  }

  // Messages feed.
  ctx.textAlign = 'left';
  ctx.font = '14px ' + FONT;
  let my = vh - 120;
  for (let i = g.messages.length - 1; i >= 0; i -= 1) {
    const m = g.messages[i];
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, m.life)})`;
    ctx.fillText(m.text, 18, my);
    my -= 20;
  }

  // Dialogue box.
  if (g.dialogue.length > 0) {
    const d = g.dialogue[0];
    const dw = Math.min(vw - 80, 620);
    panel(ctx, (vw - dw) / 2, vh - 148, dw, 64);
    ctx.fillStyle = '#ffd640';
    ctx.font = 'bold 14px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText(d.who, (vw - dw) / 2 + 16, vh - 122);
    ctx.fillStyle = '#fff';
    ctx.font = '15px ' + FONT;
    wrapText(ctx, d.text, (vw - dw) / 2 + 16, vh - 100, dw - 32, 19);
  }
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

function drawMenuPanel(ctx, vw, vh, title, lines, prompt, selected, options) {
  ctx.fillStyle = 'rgba(8,10,16,0.55)';
  ctx.fillRect(0, 0, vw, vh);
  const w = 640;
  const h = 150 + lines.length * 30 + (options ? options.length * 34 : 0);
  const x = (vw - w) / 2, y = (vh - h) / 2;
  panel(ctx, x, y, w, h, 'rgba(16,20,28,0.94)');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd640';
  ctx.font = 'bold 44px ' + FONT;
  ctx.fillText(title, vw / 2, y + 66);
  ctx.fillStyle = '#c9cdd4';
  ctx.font = '16px ' + FONT;
  lines.forEach((line, i) => ctx.fillText(line, vw / 2, y + 112 + i * 30));
  if (options) {
    options.forEach((opt, i) => {
      const oy = y + 118 + lines.length * 30 + i * 34;
      if (i === selected) {
        ctx.fillStyle = '#ffd640';
        ctx.font = 'bold 19px ' + FONT;
        ctx.fillText('▶ ' + opt, vw / 2, oy);
      } else {
        ctx.fillStyle = '#eef1f5';
        ctx.font = '18px ' + FONT;
        ctx.fillText(opt, vw / 2, oy);
      }
    });
  }
  if (prompt) {
    ctx.fillStyle = '#8b93a3';
    ctx.font = '14px ' + FONT;
    ctx.fillText(prompt, vw / 2, y + h - 22);
  }
}

export function drawScreen(ctx, g, vw, vh, screen) {
  if (screen === SCREEN_TITLE) {
    drawMenuPanel(ctx, vw, vh, 'NEON HARBOR', [
      'Mara Voss. One city. Five jobs. No way out but through.',
      'Steal cars, outrun the Harbor PD, and finish the crew\'s last score.',
    ], 'Press Enter or click to play  •  H for controls', g.menuIndex, ['New Game', g.hasSave ? 'Continue' : null, 'How to Play'].filter(Boolean));
    return;
  }
  if (screen === SCREEN_PAUSED) {
    drawMenuPanel(ctx, vw, vh, 'PAUSED', ['The city waits. Your wanted level does not cool while paused.'],
      'P / Esc to resume  •  M for missions', 0, null);
    return;
  }
  if (screen === SCREEN_OVER) {
    drawMenuPanel(ctx, vw, vh, g.overTitle || 'WASTED', [
      g.overText || 'Mara went down in Neon Harbor.',
      `Money kept: ${formatMoney(g.player.money)}   •   Jobs done: ${g.missions.index} / ${MISSIONS.length}`,
    ], 'Press Enter to try again', 0, null);
    return;
  }
  if (screen === SCREEN_MISSIONS) {
    const lines = MISSIONS.map((mm, i) => {
      const state = i < g.missions.index ? '✓ DONE' : i === g.missions.index ? '● NEXT' : '○ LOCKED';
      return `${state}   ${mm.title} — ${'$' + [600, 900, 1400, 2200, 3500][i]}`;
    });
    lines.push('');
    lines.push('Hidden stashes found: ' + g.missions.packages.filter((p) => p.taken).length + ' / 8');
    drawMenuPanel(ctx, vw, vh, 'THE CREW\'S JOBS', lines, 'M to close  •  Enter to start the next job', 0, null);
    return;
  }
  if (screen === SCREEN_HELP) {
    drawMenuPanel(ctx, vw, vh, 'HOW TO PLAY', [
      'WASD / arrows — move, drive, steer      Shift — run',
      'E — steal / leave a car      F — punch      Mouse + click — aim and shoot',
      'Space — handbrake      P — pause      M — jobs      H — this screen',
      'Steal a car in front of a witness and the PD will notice.',
      'Lose the cops, let the heat cool, and the stars fade.',
    ], 'Press H or Esc to close', 0, null);
  }
}
