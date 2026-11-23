// Keyboard and mouse: WASD/arrows to move and drive, E to enter or leave a car,
// F to punch, mouse to aim and click to shoot, Space to confirm, P or Escape to pause.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_PUNCH = 8;
export const ACTION_HORN = 16;
export const ACTION_MUTE = 32;

const CONFIRM_KEYS = new Set(['Space', 'Enter']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);
const INTERACT_KEYS = new Set(['KeyE']);
const PUNCH_KEYS = new Set(['KeyF']);
const HORN_KEYS = new Set(['KeyH']);
const MUTE_KEYS = new Set(['KeyM']);

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };
  let held = false;

  window.addEventListener('keydown', (event) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    if (!event.repeat) pressed.add(event.code);
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) { mouse.down = true; mouse.clicked = true; held = true; }
  });
  window.addEventListener('mouseup', () => { mouse.down = false; held = false; });

  function hasAny(set) {
    for (const key of set) if (pressed.has(key)) return true;
    return false;
  }

  return {
    keys, mouse,
    // Steering and throttle as -1..1, from keys or (when driving) the same keys.
    drive() {
      const up = keys.has('KeyW') || keys.has('ArrowUp');
      const down = keys.has('KeyS') || keys.has('ArrowDown');
      const left = keys.has('KeyA') || keys.has('ArrowLeft');
      const right = keys.has('KeyD') || keys.has('ArrowRight');
      return {
        throttle: (up ? 1 : 0) - (down ? 1 : 0),
        steer: (left ? -1 : 0) + (right ? 1 : 0),
        brake: keys.has('Space') && !held,
        run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
      };
    },
    walk() {
      const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      return { x, y, run: keys.has('ShiftLeft') || keys.has('ShiftRight') };
    },
    takeActions() {
      let actions = 0;
      if (hasAny(CONFIRM_KEYS) || mouse.clicked) actions |= ACTION_CONFIRM;
      if (hasAny(PAUSE_KEYS)) actions |= ACTION_PAUSE;
      if (hasAny(INTERACT_KEYS)) actions |= ACTION_INTERACT;
      if (hasAny(PUNCH_KEYS)) actions |= ACTION_PUNCH;
      if (hasAny(HORN_KEYS)) actions |= ACTION_HORN;
      if (hasAny(MUTE_KEYS)) actions |= ACTION_MUTE;
      pressed.clear();
      mouse.clicked = false;
      return actions;
    },
  };
}
