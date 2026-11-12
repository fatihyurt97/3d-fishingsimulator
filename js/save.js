import { START_MONEY, START_BAITS } from './config.js';

const KEY = 'gol-avcisi-save-v1';

export function defaultSave() {
  return {
    money: START_MONEY,
    rod: 'bambu',
    ownedRods: ['bambu'],
    baits: { ...START_BAITS },
    ownsLure: false,
    selectedBait: 'worm',
    journal: {},          // { [speciesId]: { count, record, firstAt } }
    bag: [],              // [{ id, kg }]
    stats: { casts: 0, catches: 0, breaks: 0, escapes: 0, earned: 0 },
    hour: 7,
    sound: true,
  };
}

// Tarayıcı gizli modda / site verisi kapalıyken bile oyun çalışsın diye try/catch.
export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...defaultSave(), ...parsed, baits: { ...START_BAITS, ...(parsed.baits || {}) } };
    }
  } catch (e) { /* yoksay */ }
  return defaultSave();
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) { /* yoksay */ }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* yoksay */ }
}

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
}
