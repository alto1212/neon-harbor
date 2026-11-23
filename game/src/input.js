// Keyboard and mouse: WASD/arrows to move and drive, E to enter/exit a car,
// F to punch, mouse aim + click to shoot, Space handbrake, Shift run,
// P pause, M jobs, H help, Enter/Space/click confirm on menus.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_JOBS = 4;
export const ACTION_HELP = 8;
export const ACTION_ENTER = 16;
export const ACTION_PUNCH = 32;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mouseClicked = false;

  const KEY_ACTIONS = {
    Enter: ACTION_CONFIRM,
    KeyP: ACTION_PAUSE,
    KeyM: ACTION_JOBS,
    KeyH: ACTION_HELP,
    KeyE: ACTION_ENTER,
    KeyF: ACTION_PUNCH,
  };

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action !== undefined) actions |= action;
    if (event.code === 'Space') {
      actions |= ACTION_CONFIRM;
      event.preventDefault();
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouseDown = true;
      mouseClicked = true;
      actions |= ACTION_CONFIRM;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function axis(neg, pos) {
    return (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0);
  }

  return {
    // Walking: x = right - left, y = down - up.
    moveX() { return axis('KeyA', 'KeyD') + axis('ArrowLeft', 'ArrowRight'); },
    moveY() { return axis('KeyW', 'KeyS') + axis('ArrowUp', 'ArrowDown'); },
    up() { return keys.has('KeyW') || keys.has('ArrowUp'); },
    down() { return keys.has('KeyS') || keys.has('ArrowDown'); },
    left() { return keys.has('KeyA') || keys.has('ArrowLeft'); },
    right() { return keys.has('KeyD') || keys.has('ArrowRight'); },
    run() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    brake() { return keys.has('Space'); },
    mouse() { return { x: mouseX, y: mouseY, down: mouseDown }; },
    takeMouseClick() {
      const clicked = mouseClicked;
      mouseClicked = false;
      return clicked;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
