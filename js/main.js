import { World } from './world.js';
import { FishPond } from './fish.js';
import { Fishing } from './fishing.js';
import { UI } from './ui.js';
import { createInput } from './input.js';
import { loadSave, writeSave, clearSave, hasSave, defaultSave } from './save.js';
import { sfx, unlock, setEnabled, setRain } from './audio.js';
import { BAITS, RODS, SPECIES, START_HOUR } from './config.js';

class Game {
  constructor() {
    const canvas = document.getElementById('game');
    this.world = new World(canvas);
    this.save = loadSave();
    this.sfx = sfx;
    this.rng = Math.random;
    this.pond = new FishPond(this.world.scene, () => Math.random());
    this.ui = new UI(this);
    this.fishing = new Fishing(this);
    this.input = createInput(canvas);
    this.inputState = this.input.state;
    this.started = false;

    this.input.on({
      down: (st, src) => this.fishing.onDown(st, src),
      up: (st, src) => this.fishing.onUp(st, src),
    });

    this.world.setTime(this.save.hour ?? START_HOUR);
    setEnabled(this.save.sound);
    this._lastHud = 0;
    this._lastSave = 0;

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    this.resize();

    this.ui.showStart(hasSave());
    this.ui.updateHud();
    this.last = performance.now();
    this.t = 0;
    requestAnimationFrame((n) => this.frame(n));
  }

  resize() {
    this.world.resize(window.innerWidth, window.innerHeight);
  }

  // ---------- Oyun akışı ----------
  startGame() {
    unlock();
    this.started = true;
    this.ui.closeModal();
    this.toast('Aşağı çek ve bırak → olta atılır.');
    this.ui.updateHud();
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;

    this.world.update(dt, this.t);
    this.fishing.update(dt, this.t);
    setRain(this.world.rainAmount);

    if (now - this._lastHud > 250) { this.ui.updateHud(); this._lastHud = now; }
    if (now - this._lastSave > 10000) { this.save.hour = this.world.hour; writeSave(this.save); this._lastSave = now; }

    this.world.render();
    requestAnimationFrame((n) => this.frame(n));
  }

  persist() {
    this.save.hour = this.world.hour;
    writeSave(this.save);
    this.ui.updateHud();
  }

  toast(msg) { this.ui.toast(msg); }

  // ---------- Yem ----------
  currentBaitKind() {
    return this.fishing._pickBaitKind();
  }

  cycleBait() {
    const s = this.save;
    const owned = ['worm', 'dough', 'lure'].filter(k => k === 'lure' ? s.ownsLure : (s.baits[k] || 0) > 0);
    if (!owned.length) { this.toast('Elinde yem yok. Dükkâna git.'); sfx.error(); return; }
    const i = owned.indexOf(s.selectedBait);
    s.selectedBait = owned[(i + 1) % owned.length];
    sfx.ui();
    this.persist();
  }

  // ---------- Menüler ----------
  openMenu(name) {
    if (this.fishing.phase !== 'idle' || this.fishing.pulling) {
      this.toast('Önce balıkla uğraş.');
      return;
    }
    sfx.ui();
    if (name === 'shop') this.ui.showShop();
    if (name === 'bag') this.ui.showBag();
    if (name === 'journal') this.ui.showJournal();
    if (name === 'settings') this.ui.showSettings();
  }

  onModalClosed() {
    this.ui.updateHud();
  }

  // ---------- Ekonomi ----------
  buyBait(kind) {
    const b = BAITS[kind];
    if (this.save.money < b.packPrice) { this.toast('Paran yetmiyor.'); sfx.error(); return; }
    this.save.money -= b.packPrice;
    this.save.baits[kind] = (this.save.baits[kind] || 0) + b.packSize;
    sfx.coin();
    this.persist();
    this.ui.showShop();
  }

  buyLure() {
    const s = this.save;
    if (s.ownsLure) return;
    if (s.money < BAITS.lure.price) { this.toast('Paran yetmiyor.'); sfx.error(); return; }
    s.money -= BAITS.lure.price;
    s.ownsLure = true;
    sfx.coin();
    this.toast('Yapay yem alındı. Sürükleyerek kullan!');
    this.persist();
    this.ui.showShop();
  }

  buyRod(id) {
    const r = RODS[id];
    const s = this.save;
    if (s.ownedRods.includes(id)) return this.equipRod(id);
    if (s.money < r.price) { this.toast('Paran yetmiyor.'); sfx.error(); return; }
    s.money -= r.price;
    s.ownedRods.push(id);
    s.rod = id;
    sfx.coin();
    this.toast(`${r.name} takıldı.`);
    this.persist();
    this.ui.showShop();
  }

  equipRod(id) {
    this.save.rod = id;
    sfx.ui();
    this.persist();
    this.ui.showShop();
  }

  sellAll() {
    const s = this.save;
    let total = 0;
    for (const f of s.bag) {
      const sp = SPECIES.find(x => x.id === f.id);
      total += Math.round(f.kg * sp.price);
    }
    if (!total) return;
    s.money += total;
    s.stats.earned += total;
    s.bag = [];
    sfx.coin();
    this.toast(`${total} ₺ kazandın!`);
    this.persist();
    this.ui.showBag();
  }

  toggleSound() {
    this.save.sound = !this.save.sound;
    setEnabled(this.save.sound);
    this.persist();
  }

  resetProgress() {
    clearSave();
    this.save = defaultSave();
    this.fishing._reset();
    this.world.setTime(START_HOUR);
    setEnabled(this.save.sound);
    this.ui.closeModal();
    this.persist();
    this.toast('Kayıt sıfırlandı.');
  }
}

// Bozuk kayıt veya beklenmeyen hata oyunu tamamen kilitlemesin
window.addEventListener('error', (e) => {
  const el = document.getElementById('toast');
  if (el) { el.textContent = 'Bir hata oldu: ' + (e.message || 'bilinmeyen'); el.classList.add('show'); }
});

window.game = new Game();
