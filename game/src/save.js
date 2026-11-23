// Save game: money, finished missions and collected cash stashes, kept in
// localStorage so a visit picks up where the last one left off.
import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.money !== 'number') return null;
    return {
      money: data.money | 0,
      completed: Array.isArray(data.completed) ? data.completed.map(Boolean) : [false, false, false, false, false],
      stashes: Array.isArray(data.stashes) ? data.stashes.map(Boolean) : [],
    };
  } catch {
    return null;
  }
}

export function saveGame(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.money | 0,
      completed: state.completed,
      stashes: state.stashes.map((s) => s.taken),
    }));
  } catch {
    // Storage can be off: the game then lasts this visit only.
  }
}
