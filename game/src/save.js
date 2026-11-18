// Save and load for Neon Bay: position, cash, mission progress, health and
// best cash, in localStorage. Wanted never saves: every fresh load is a
// clean slate with the cops, as it should be.
const KEY = 'neonbay-save-v1';

export function saveGame(state) {
  try {
    const data = {
      cash: Math.floor(state.cash),
      missionIndex: state.missionIndex,
      missionsCompleted: state.missionsCompleted,
      x: Math.round(state.pos.x * 10) / 10,
      z: Math.round(state.pos.z * 10) / 10,
      heading: Math.round(state.heading * 100) / 100,
      health: Math.round(state.health),
      savedAt: Date.now(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.x !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try { window.localStorage.removeItem(KEY); } catch { /* no storage */ }
}
