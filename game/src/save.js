// Save / load for Neon Bay. One key, one small JSON object: cash, mission
// progress, where the player stands and how healthy they are. The wanted
// level never saves — every fresh load starts clean.
export const SAVE_KEY = 'neon-bay-save-v2';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: typeof data.cash === 'number' ? Math.max(0, Math.floor(data.cash)) : 0,
      missionIndex: typeof data.missionIndex === 'number' ? Math.max(0, Math.floor(data.missionIndex)) : 0,
      pos: Array.isArray(data.pos) && data.pos.length === 3 ? data.pos : [0, 0, 40],
      heading: typeof data.heading === 'number' ? data.heading : 0,
      health: typeof data.health === 'number' ? Math.max(1, Math.min(100, data.health)) : 100,
    };
  } catch {
    return null;
  }
}

export function storeSave(data) {
  try {
    window.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        cash: Math.floor(data.cash || 0),
        missionIndex: Math.floor(data.missionIndex || 0),
        pos: [data.pos.x, data.pos.y, data.pos.z],
        heading: data.heading || 0,
        health: Math.floor(data.health || 100),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    /* storage unavailable */
  }
}
