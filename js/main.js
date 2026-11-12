import { World } from './world.js';
import { FishPond } from './fish.js';
import { Fishing } from './fishing.js';
import { UI } from './ui.js';
import { createInput, bindStick, bindHold } from './input.js';
import { buildAvatar } from './avatar.js';
import { loadSave, writeSave, clearSave, hasSave, defaultSave } from './save.js';
import { sfx, unlock, setEnabled, setRain } from './audio.js';
import { BAITS, RODS, SPECIES, START_HOUR, DOCK } from './config.js';

const WALK_SPEED = 2.4;                         // m/s
const DOCK_MIN_X = -0.45, DOCK_MAX_X = 0.45;     // iskele genişliği içinde
const DOCK_MIN_Z = -12.5, DOCK_MAX_Z = 0.3;      // kıyıdan suya doğru

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class Game {
  constructor() {
    const canvas = document.getElementById('game');
    this.world = new World(canvas);
    this.save = loadSave();
    this.sfx = sfx;
    this.pond = new FishPond(this.world.scene, () => Math.random());
    this.ui = new UI(this);

    // Oyuncu: iskelede yürür. x/z dünya konumu, aim nişan açısı.
    this.player = { x: 0, z: DOCK.standZ - 0.3, aim: 0 };
    this.camAim = 0;
    this.avatar = buildAvatar(this.world.scene);

    this.fishing = new Fishing(this);
    this.input = createInput(canvas);
    this.inputState = this.input.state;
    this.started = false;

    this.input.on({
      down: (st, src) => this.fishing.onDown(st, src),
      up: (st, src) => this.fishing.onUp(st, src),
    });

    // Ekran kontrolleri: sol joystick yürür, sağ joystick nişan verir, AT eylemi
    bindStick(document.getElementById('stick-move'), (x, y) => { this.inputState.stickMove = { x, y }; });
    bindStick(document.getElementById('stick-aim'), (x) => { this.inputState.btnAim = x; });
    bindHold(document.getElementById('action-btn'), (on) => this.input.pressAction(on));

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
    this.toast('Sol alttaki yön tuşlarıyla iskelede yürü. AT ile at.');
    this.ui.updateHud();
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;

    this.world.update(dt, this.t);
    this.updatePlayer(dt);
    this.fishing.update(dt, this.t);
    this.avatar.setPose(this.player, this.t, this.moving);
    this.updateCamera(dt);
    setRain(this.world.rainAmount);

    if (now - this._lastHud > 250) { this.ui.updateHud(); this._lastHud = now; }
    if (now - this._lastSave > 10000) { this.save.hour = this.world.hour; writeSave(this.save); this._lastSave = now; }

    this.world.render();
    requestAnimationFrame((n) => this.frame(n));
  }

  // Yürüme: sadece olta boştayken. Ekran butonları veya WASD.
  updatePlayer(dt) {
    const st = this.inputState;
    const k = st.kb;
    const s = st.stickMove;

    const free = this.fishing.phase === 'idle' && !this.fishing.pulling && !this.ui.isModalOpen();
    let mx = 0, mz = 0;
    if (free) {
      // Joystick analog (0..1 şiddet), klavye tam hız
      mx = s.x + ((k.right ? 1 : 0) - (k.left ? 1 : 0));
      mz = s.y + ((k.back ? 1 : 0) - (k.fwd ? 1 : 0));
      const m = Math.hypot(mx, mz);
      if (m > 1) { mx /= m; mz /= m; }
    }
    const p = this.player;
    p.x = clamp(p.x + mx * WALK_SPEED * dt, DOCK_MIN_X, DOCK_MAX_X);
    p.z = clamp(p.z + mz * WALK_SPEED * dt, DOCK_MIN_Z, DOCK_MAX_Z);
    this.moving = Math.hypot(mx, mz) > 0.05;
  }

  // Kamera karakterin arkasında, nişan yönüne bakar
  updateCamera(dt) {
    const p = this.player;
    this.camAim += (p.aim - this.camAim) * Math.min(1, dt * 5);
    const sa = Math.sin(this.camAim), ca = Math.cos(this.camAim);
    const cam = this.world.camera;
    const back = 7.5, height = 3.6;
    cam.position.set(p.x - sa * back, 0.96 + height, p.z + ca * back);
    cam.lookAt(p.x + sa * 18, 0.4, p.z - ca * 18);
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
