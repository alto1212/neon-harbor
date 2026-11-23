// Neon Harbor — a make.fun gta6-01 entry (Node 22, standard library only).
// An original top-down 2D open-world crime game: the game is this directory's
// game/ folder, plain static files a desktop browser loads offline
// (game/index.html and its ES modules, no library and no network request),
// and this program hands it in. It copies game/ and screenshots/ from beside
// this file to /output and writes /output/dossier.json, the summary the judge
// reads, with the vendored make.fun library.
//
// The game itself: a 3200x2400 sun-soaked coastal city (Downtown, Marina,
// Docks, Old Town, Northside, Midtown, beach and ocean) where getaway driver
// Mara Voss steals cars, outruns the Harbor PD through a 0-5 star wanted
// system, and works five story jobs for fixer Lennox against Viktor Kade.
// Traffic AI, pedestrians, fists and a pistol, health kits, hidden cash
// stashes, HUD + minimap, start screen, localStorage saves and WebAudio
// synth sounds — all in plain canvas 2D.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Pre-flight: the entry is only worth handing in with real renders.
// The kit's gates cap the entry at 4 screenshots of 256 KiB each, so fail
// loudly here instead of shipping a broken dossier.
const shotsDir = join(here, 'screenshots');
if (!existsSync(join(here, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing — the entry has no game to hand in');
}
if (!existsSync(shotsDir)) {
  throw new Error('screenshots/ is missing — capture the real renders first');
}
const shots = readdirSync(shotsDir)
  .filter((name) => /\.(png|jpe?g)$/i.test(name))
  .sort();
if (shots.length < 1 || shots.length > 4) {
  throw new Error(`expected 1-4 screenshots, found ${shots.length}`);
}
for (const name of shots) {
  const size = statSync(join(shotsDir, name)).size;
  if (size > 262144) {
    throw new Error(`screenshot ${name} is ${size} bytes, over the 256 KiB cap`);
  }
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`Neon Harbor: ${shots.length} screenshot(s) (${shots.join(', ')}) handed in to ${out}`);
