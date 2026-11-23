// The camera and every brush stroke: ground, roads, buildings, cars, people,
// particles and the mission beacon. Top-down, sun-soaked, drawn in view order.
import { AVENUES, PALETTE, ROAD_W, STREETS, WORLD, clamp } from './config.js';

export function createCamera() {
  return { x: 1600, y: 1200, zoom: 1, shakeX: 0, shakeY: 0 };
}

export function updateCamera(cam, target, driving, dt, shake) {
  const wantZoom = driving ? 0.82 : 1.05;
  cam.zoom += (wantZoom - cam.zoom) * Math.min(1, 2 * dt);
  cam.x += (target.x - cam.x) * Math.min(1, 5 * dt);
  cam.y += (target.y - cam.y) * Math.min(1, 5 * dt);
  if (shake > 0.5) {
    cam.shakeX = (Math.random() - 0.5) * shake;
    cam.shakeY = (Math.random() - 0.5) * shake;
  } else { cam.shakeX = 0; cam.shakeY = 0; }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function inView(cam, vw, vh, x, y, margin) {
  const hw = vw / 2 / cam.zoom + margin;
  const hh = vh / 2 / cam.zoom + margin;
  return x > cam.x - hw && x < cam.x + hw && y > cam.y - hh && y < cam.y + hh;
}

function drawCarShape(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath();
  ctx.ellipse(4, 6, car.len / 2, car.wid / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -car.len / 2, -car.wid / 2, car.len, car.wid, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Windows.
  ctx.fillStyle = 'rgba(30,40,55,0.85)';
  roundRect(ctx, car.len * 0.08, -car.wid / 2 + 3, car.len * 0.22, car.wid - 6, 3);
  ctx.fill();
  roundRect(ctx, -car.len * 0.34, -car.wid / 2 + 3, car.len * 0.16, car.wid - 6, 3);
  ctx.fill();
  // Headlights and taillights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(car.len / 2 - 2, -car.wid / 2 + 3, 3, 4);
  ctx.fillRect(car.len / 2 - 2, car.wid / 2 - 7, 3, 4);
  ctx.fillStyle = '#e5484d';
  ctx.fillRect(-car.len / 2 - 1, -car.wid / 2 + 3, 3, 4);
  ctx.fillRect(-car.len / 2 - 1, car.wid / 2 - 7, 3, 4);
  if (car.def === 'police') {
    const phase = Math.floor(time * 4) % 2 === 0;
    ctx.fillStyle = phase ? '#ff3b30' : '#2f6bff';
    ctx.fillRect(-4, -car.wid / 2 + 2, 8, 5);
    ctx.fillStyle = phase ? '#2f6bff' : '#ff3b30';
    ctx.fillRect(-4, car.wid / 2 - 7, 8, 5);
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(-car.len * 0.1, -car.wid / 2, car.len * 0.2, car.wid);
  }
  if (car.def === 'taxi') {
    ctx.fillStyle = '#22262e';
    for (let i = 0; i < 5; i += 1) ctx.fillRect(-car.len * 0.28 + i * 6, -3, 3, 6);
  }
  ctx.restore();
}

function drawPersonShape(ctx, p) {
  if (p.downT > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 3, 12, 6, p.angle, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.shirt;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 12, 6, p.angle, 0, Math.PI * 2); ctx.fill();
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 3, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.shirt;
  ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8b98a';
  ctx.beginPath(); ctx.arc(p.x + Math.cos(p.angle) * 3, p.y + Math.sin(p.angle) * 3, 5.5, 0, Math.PI * 2); ctx.fill();
}

export function drawWorld(ctx, g, vw, vh, time) {
  const { world, camera } = g;
  ctx.save();
  ctx.translate(vw / 2 + camera.shakeX, vh / 2 + camera.shakeY);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  // Ground: grass everywhere, then water, sand, parks, lots.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(2920, 0, WORLD.w - 2920, WORLD.h);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(2920, 0, 60, WORLD.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  for (let y = 40; y < WORLD.h; y += 90) {
    ctx.beginPath();
    ctx.moveTo(2930, y + Math.sin(time * 1.4 + y) * 4);
    ctx.quadraticCurveTo(2960, y + 8, 2990, y);
    ctx.stroke();
  }
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(2830, 0, 90, WORLD.h);
  for (const park of world.parks) {
    if (!inView(camera, vw, vh, park.x + park.w / 2, park.y + park.h / 2, 200)) continue;
    ctx.fillStyle = PALETTE.parkDark;
    ctx.fillRect(park.x, park.y, park.w, park.h);
    ctx.strokeStyle = PALETTE.treeDark;
    ctx.lineWidth = 2;
    ctx.strokeRect(park.x + 4, park.y + 4, park.w - 8, park.h - 8);
  }
  for (const lot of world.parkingLots) {
    ctx.fillStyle = PALETTE.asphaltDark;
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for (let x = lot.x + 14; x < lot.x + lot.w - 10; x += 26) {
      ctx.beginPath(); ctx.moveTo(x, lot.y + 8); ctx.lineTo(x, lot.y + 30); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, lot.y + lot.h - 8); ctx.lineTo(x, lot.y + lot.h - 30); ctx.stroke();
    }
  }

  // Roads: sidewalk band, asphalt, dashes.
  for (const ax of AVENUES) {
    ctx.fillStyle = PALETTE.sidewalk;
    ctx.fillRect(ax - ROAD_W / 2 - 10, 0, ROAD_W + 20, WORLD.h);
    ctx.fillStyle = PALETTE.asphalt;
    ctx.fillRect(ax - ROAD_W / 2, 0, ROAD_W, WORLD.h);
  }
  for (const sy of STREETS) {
    ctx.fillStyle = PALETTE.sidewalk;
    ctx.fillRect(0, sy - ROAD_W / 2 - 10, WORLD.w, ROAD_W + 20);
    ctx.fillStyle = PALETTE.asphalt;
    ctx.fillRect(0, sy - ROAD_W / 2, WORLD.w, ROAD_W);
  }
  ctx.fillStyle = PALETTE.lane;
  for (const ax of AVENUES) {
    for (let y = 20; y < WORLD.h; y += 56) ctx.fillRect(ax - 2, y, 4, 28);
  }
  for (const sy of STREETS) {
    for (let x = 20; x < WORLD.w; x += 56) ctx.fillRect(x, sy - 2, 28, 4);
  }

  // Buildings with long sun shadows and rooftop details.
  for (const b of world.buildings) {
    if (!inView(camera, vw, vh, b.x + b.w / 2, b.y + b.h / 2, 120)) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(b.x + b.height * 0.4, b.y + b.height * 0.4, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = PALETTE.buildingEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, 10);
    if (b.roof === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + b.w / 2 - 12, b.y + b.h / 2 - 8, 24, 16);
    } else if (b.roof === 1 && b.height > 24) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('H', b.x + b.w / 2, b.y + b.h / 2 + 5);
    } else if (b.roof === 2) {
      ctx.fillStyle = PALETTE.glass;
      ctx.fillRect(b.x + 10, b.y + b.h / 2 - 6, b.w - 20, 12);
    }
  }

  // Trees.
  for (const t of world.trees) {
    if (!inView(camera, vw, vh, t.x, t.y, 20)) continue;
    ctx.fillStyle = PALETTE.treeDark;
    ctx.beginPath(); ctx.arc(t.x + 2, t.y + 2, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PALETTE.tree;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
  }
  // Palms along the beach.
  for (let y = 90; y < WORLD.h; y += 170) {
    const x = 2868;
    if (!inView(camera, vw, vh, x, y, 30)) continue;
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(x - 2, y - 4, 4, 12);
    ctx.fillStyle = '#3f8a4d';
    ctx.beginPath(); ctx.arc(x, y - 8, 11, 0, Math.PI * 2); ctx.fill();
  }

  // Mission beacon and pickups.
  const marker = g.missionMarker;
  if (marker) {
    const pulse = 1 + Math.sin(time * 5) * 0.15;
    ctx.fillStyle = 'rgba(255,214,64,0.18)';
    ctx.fillRect(marker.x - 26, marker.y - 130, 52, 130);
    ctx.save();
    ctx.translate(marker.x, marker.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd640';
    ctx.strokeStyle = '#7a5a00';
    ctx.lineWidth = 2;
    const s = 15 * pulse;
    ctx.fillRect(-s, -s, s * 2, s * 2);
    ctx.strokeRect(-s, -s, s * 2, s * 2);
    ctx.restore();
  }
  for (const pkg of g.missions.packages) {
    if (pkg.taken || !inView(camera, vw, vh, pkg.x, pkg.y, 20)) continue;
    ctx.fillStyle = '#37d67a';
    ctx.beginPath(); ctx.arc(pkg.x, pkg.y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0d3d20';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', pkg.x, pkg.y + 4);
  }
  for (const kit of g.missions.healthKits) {
    if (kit.taken || !inView(camera, vw, vh, kit.x, kit.y, 20)) continue;
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(kit.x - 9, kit.y - 9, 18, 18);
    ctx.fillStyle = '#e5484d';
    ctx.fillRect(kit.x - 2, kit.y - 6, 4, 12);
    ctx.fillRect(kit.x - 6, kit.y - 2, 12, 4);
  }

  // Traffic, police, enemies, pedestrians, player.
  for (const t of g.traffic) if (!t.car.dead) drawCarShape(ctx, t.car, time);
  for (const cop of g.police.cops) drawCarShape(ctx, cop.car, time);
  for (const e of g.missions.enemies) drawPersonShape(ctx, e);
  for (const p of g.peds) drawPersonShape(ctx, p);
  const player = g.player;
  if (!player.inCar) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(player.x + 2, player.y + 4, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e84a5f';
    ctx.beginPath(); ctx.arc(player.x, player.y, 12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(player.x, player.y, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath(); ctx.arc(player.x + Math.cos(player.angle) * 4, player.y + Math.sin(player.angle) * 4, 6, 0, Math.PI * 2); ctx.fill();
    if (player.weapon === 'pistol') {
      ctx.strokeStyle = '#22262e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(player.x + Math.cos(player.angle) * 8, player.y + Math.sin(player.angle) * 8);
      ctx.lineTo(player.x + Math.cos(player.angle) * 20, player.y + Math.sin(player.angle) * 20);
      ctx.stroke();
    }
  } else {
    drawCarShape(ctx, player.inCar, time);
    // Player marker above their car.
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(player.inCar.x, player.inCar.y - player.inCar.wid / 2 - 16);
    ctx.lineTo(player.inCar.x - 6, player.inCar.y - player.inCar.wid / 2 - 26);
    ctx.lineTo(player.inCar.x + 6, player.inCar.y - player.inCar.wid / 2 - 26);
    ctx.closePath(); ctx.fill();
  }

  // Bullets, flashes, particles.
  ctx.strokeStyle = '#fff3b0';
  ctx.lineWidth = 2;
  for (const b of g.combat.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const f of g.combat.flashes) {
    ctx.fillStyle = `rgba(255,220,90,${f.life / f.max})`;
    ctx.beginPath(); ctx.arc(f.x, f.y, 12, 0, Math.PI * 2); ctx.fill();
  }
  for (const p of g.combat.particles) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.kind === 'boom') {
      ctx.fillStyle = `rgba(255,${Math.floor(140 * a + 60)},40,${a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.6 - a * 0.6), 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'smoke') {
      ctx.fillStyle = `rgba(120,120,125,${a * 0.5})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = p.color || '#ffd76a';
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}
