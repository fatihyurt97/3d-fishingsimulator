import * as THREE from 'three';
import { DOCK, RODS, BAITS, WEATHER, MAX_BAG, timeBucket } from './config.js';

// Oyunun çekirdeği: atış -> bekleme -> ısırık -> makara mücadelesi -> yakalama.
// Fazlar: idle, casting, waiting, nibble, bite, fight, catch, snapped

const BITE_SCALE = 1.8;       // ısırma sıklığı genel çarpanı (denge ayarı)
const WATER_Y = 0.02;
const MAX_AIM = 0.75;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Fishing {
  constructor(game) {
    this.g = game;
    this.world = game.world;
    this.phase = 'idle';
    this.t = 0;
    this.aimBase = 0;
    this.aim = 0;
    this.pulling = false;
    this.pullSrc = null;
    this.pullValue = 0;
    this.keyPullT = 0;
    this.bait = null;
    this.fish = null;
    this.fight = null;
    this.timer = 0;
    this.kick = 0;            // rod swing impulse
    this.jerk = 0;            // rod hook jerk
    this.lastHint = '';
    this.tipWorld = new THREE.Vector3();
    this.mouth = new THREE.Vector3();
    this.bobPos = new THREE.Vector3();
    this.castFrom = new THREE.Vector3();
    this.castTo = new THREE.Vector3();
    this.castT = 0;
    this.dirVec = new THREE.Vector3();

    this._buildRod();
    this._buildBobber();
    this._buildLine();
    this._buildRipples();
    this._buildSplash();
    this._buildPreview();
  }

  // ---------- Görsel inşa ----------
  _buildRod() {
    const cam = this.world.camera;
    this.rodRoot = new THREE.Group();
    this.rodRoot.position.set(0.42, -0.42, -0.75);
    cam.add(this.rodRoot);
    this.pivot = new THREE.Group();
    this.rodRoot.add(this.pivot);

    const cork = new THREE.MeshLambertMaterial({ color: 0x3b2a1e, flatShading: true });
    const blankMat = new THREE.MeshLambertMaterial({ color: 0x2c7a5a, flatShading: true });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.42, 8), cork);
    handle.rotation.x = -Math.PI / 2;
    handle.position.set(0, 0, 0.08);
    const blank = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 1.7, 8), blankMat);
    blank.rotation.x = -Math.PI / 2;
    blank.position.set(0, 0, -0.77);
    const reel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.14), new THREE.MeshLambertMaterial({ color: 0x9aa3ad, flatShading: true }));
    reel.position.set(0.0, -0.07, 0.04);
    this.pivot.add(handle, blank, reel);

    this.tip = new THREE.Object3D();
    this.tip.position.set(0, 0, -1.7);
    this.pivot.add(this.tip);
    this.rodPitch = 0.3;
    this.rodYaw = 0;
  }

  _buildBobber() {
    this.bobber = new THREE.Group();
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshLambertMaterial({ color: 0xff3b2f }));
    red.scale.set(1, 1.6, 1);
    red.position.y = 0.1;
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshLambertMaterial({ color: 0xf8f8f8 }));
    white.scale.set(1, 0.8, 1);
    white.position.y = -0.06;
    this.bobber.add(red, white);
    this.bobber.visible = false;
    this.world.scene.add(this.bobber);
  }

  _buildLine() {
    this.linePts = 16;
    this.lineArr = new Float32Array(this.linePts * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.lineArr, 3));
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.85 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    this.world.scene.add(this.line);
  }

  _buildRipples() {
    this.ripples = [];
    const geo = new THREE.RingGeometry(0.85, 1, 32);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
      m.visible = false;
      this.world.scene.add(m);
      this.ripples.push({ m, life: 0 });
    }
  }

  emitRipple(x, z, size = 1) {
    const r = this.ripples.find(r => r.life <= 0) || this.ripples[0];
    r.m.position.set(x, WATER_Y + 0.03, z);
    r.m.scale.setScalar(0.2 * size);
    r.m.visible = true;
    r.life = 1.0;
    r.size = size;
  }

  _buildSplash() {
    this.drops = [];
    const geo = new THREE.SphereGeometry(0.06, 5, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      this.world.scene.add(m);
      this.drops.push({ m, v: new THREE.Vector3(), life: 0 });
    }
  }

  emitSplash(x, z, power = 1) {
    this.emitRipple(x, z, 1.6 * power);
    for (let i = 0; i < 10; i++) {
      const d = this.drops.find(d => d.life <= 0);
      if (!d) break;
      d.m.position.set(x, WATER_Y, z);
      const a = Math.random() * Math.PI * 2;
      const s = (1.2 + Math.random() * 1.8) * power;
      d.v.set(Math.cos(a) * s * 0.5, 2.5 + Math.random() * 2.5, Math.sin(a) * s * 0.5);
      d.m.visible = true;
      d.life = 0.7;
    }
  }

  _buildPreview() {
    const geo = new THREE.RingGeometry(0.55, 0.75, 40);
    geo.rotateX(-Math.PI / 2);
    this.preview = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.85, depthWrite: false }));
    this.preview.visible = false;
    this.world.scene.add(this.preview);
  }

  // ---------- Yardımcılar ----------
  get rod() { return RODS[this.g.save.rod]; }

  _dockPoint() { return new THREE.Vector3(DOCK.tip.x, WATER_Y, DOCK.tip.z); }

  _dirFromAim(aim) { return new THREE.Vector3(Math.sin(aim), 0, -Math.cos(aim)); }

  _pickBaitKind() {
    const s = this.g.save;
    const owns = (k) => k === 'lure' ? s.ownsLure : (s.baits[k] || 0) > 0;
    const order = [s.selectedBait, 'worm', 'dough', 'lure'];
    for (const k of order) if (k && owns(k)) return k;
    return null;
  }

  _hint(text) {
    if (text !== this.lastHint) { this.lastHint = text; this.g.ui.setHint(text); }
  }

  _setPhase(p) { this.phase = p; this.timer = 0; }

  // ---------- Girdi (input.js'ten gelir) ----------
  onDown(st, src) {
    if (this.g.ui.isModalOpen()) return;
    if (this.phase === 'idle') {
      if (!this._pickBaitKind()) { this.g.toast('Yemin bitti! Dükkândan yem al.'); this.g.sfx.error(); return; }
      this.pulling = true;
      this.pullSrc = src || 'pointer';
      this.keyPullT = 0;
      this.pullValue = 0;
      this.g.sfx.ui();
    } else if (this.phase === 'bite') {
      this._hook();
    } else if (this.phase === 'nibble') {
      // Erken vurdu: balık kaçar
      this.g.toast('Erken vurdun! Balık kaçtı.');
      this.g.sfx.escape();
      this._escape();
    }
  }

  onUp(st, src) {
    if (this.pulling) {
      this._updatePull(0, st);
      this._release();
    }
  }

  _updatePull(dt, st) {
    if (this.pullSrc === 'key') {
      this.keyPullT += dt;
      this.pullValue = Math.min(1, this.keyPullT / 1.1);
      this.aim = this.aimBase;
    } else {
      this.pullValue = clamp((st.y - st.y0) / 240, 0, 1);
      const dx = clamp((st.x - st.x0) / 240, -1, 1);
      this.aim = clamp(this.aimBase + dx * 0.55, -MAX_AIM, MAX_AIM);
    }
  }

  _release() {
    this.pulling = false;
    const p = this.pullValue;
    if (p < 0.08) { this.g.toast('Daha güçlü çek, sonra bırak.'); return; }
    this.aimBase = this.aim;
    this._cast(p);
  }

  _cast(p) {
    const kind = this._pickBaitKind();
    if (!kind) return;
    const s = this.g.save;
    const dist = 6 + p * (this.rod.cast - 6);
    const dir = this._dirFromAim(this.aim);
    const land = this._dockPoint().addScaledVector(dir, dist);
    this.bait = { x: land.x, z: land.z, dist, dirX: dir.x, dirZ: dir.z, kind, retrieving: false };
    if (BAITS[kind].consumable) s.baits[kind] -= 1;
    s.stats.casts += 1;
    this.g.persist();
    this.castFrom.copy(this.tipWorld);
    this.castTo.copy(land);
    this.castT = 0;
    this._setPhase('casting');
    this.kick = 1;
    this.preview.visible = false;
    this.g.sfx.cast();
    this.lineOn = true;
  }

  _landed() {
    this._setPhase('waiting');
    this.emitSplash(this.bait.x, this.bait.z, 1);
    this.g.sfx.splash();
  }

  _hook() {
    const b = this.bait;
    const fish = this.fish;
    const sp = fish.species;
    const kg = sp.minKg + (sp.maxKg - sp.minKg) * Math.pow(Math.random(), 1.6);
    const frac = (kg - sp.minKg) / (sp.maxKg - sp.minKg + 1e-6);
    fish.setHooked(true);
    this.fight = {
      fish, kg, s: sp.strength * (0.7 + 0.3 * frac),
      d: b.dist, dMax: b.dist, t: 0, T: 0, strain: 0,
      surge: 0, surgeCool: 1.2 + Math.random(), ph: Math.random() * 10,
      tire: 1, dirX: b.dirX, dirZ: b.dirZ, tick: 0,
    };
    this.g.ui.showBite(false);
    this.g.ui.showFight(true);
    this.g.sfx.hook();
    this.jerk = 1;
    this.bobber.visible = false;
    this._setPhase('fight');
  }

  // ---------- Her kare ----------
  update(dt, t) {
    this.t = t;
    const st = this.g.inputState;
    this.tip.getWorldPosition(this.tipWorld);

    if (this.phase === 'idle') {
      if (st.aimKey && !this.pulling) {
        this.aimBase = clamp(this.aimBase + st.aimKey * dt * 0.9, -MAX_AIM, MAX_AIM);
      }
      if (this.pulling) {
        this._updatePull(dt, st);
        const dist = 6 + Math.max(0.05, this.pullValue) * (this.rod.cast - 6);
        const dir = this._dirFromAim(this.aim);
        const land = this._dockPoint().addScaledVector(dir, dist);
        this.preview.position.set(land.x, WATER_Y + 0.02, land.z);
        this.preview.visible = true;
        const pulse = 1 + 0.08 * Math.sin(t * 10);
        this.preview.scale.setScalar(pulse);
        this._hint('Bırak → at  ·  Aşağı çek: güç  ·  Sağa/sola: yön');
      } else {
        this.preview.visible = false;
        if (!this._pickBaitKind()) this._hint('Yemin bitti! Dükkândan yem al.');
        else this._hint('Aşağı çek, bırak → at  ·  Klavye: Boşluk');
      }
    }

    if (this.phase === 'casting') {
      this.castT += dt;
      const u = Math.min(1, this.castT / 0.65);
      const arc = Math.sin(Math.PI * u) * 2.4;
      this.bobPos.lerpVectors(this.castFrom, this.castTo, u);
      this.bobPos.y += arc;
      if (u >= 1) this._landed();
    }

    if (this.phase === 'waiting') this._updateWaiting(dt, t, st);
    if (this.phase === 'nibble') this._updateNibble(dt, t);
    if (this.phase === 'bite') this._updateBite(dt, t);
    if (this.phase === 'fight') this._updateFight(dt, t, st);
    if (this.phase === 'catch') this._updateCatch(dt);
    if (this.phase === 'snapped') {
      this.timer -= dt;
      if (this.timer <= 0) this._reset();
    }

    this.g.pond.update(dt, t, this.bait ? { x: this.bait.x, z: this.bait.z } : null);
    this._updateVisuals(dt, t);
  }

  _updateWaiting(dt, t, st) {
    const b = this.bait;
    this.timer += dt;
    if (st.held) {
      const speed = (b.kind === 'lure' ? 1.4 : 2.0) * this.rod.reel;
      b.dist = Math.max(0, b.dist - speed * dt);
      b.retrieving = b.kind === 'lure';
      if (b.dist < 3) {
        this.g.toast('Yem geri geldi.');
        this._reset();
        return;
      }
      b.x = DOCK.tip.x + b.dirX * b.dist;
      b.z = DOCK.tip.z + b.dirZ * b.dist;
      this._hint('Sürükleniyor… bırak: yemi bırak');
    } else {
      b.retrieving = false;
      this._hint(b.kind === 'lure' ? 'Yapay yemi sürükle: basılı tut' : 'Bekle… (basılı tut: yemi geri çek)');
    }

    // Su yüzeyi halkaları
    if (Math.floor(t * 0.5) !== Math.floor((t - dt) * 0.5)) this.emitRipple(b.x, b.z, 0.5);

    const w = this.g.world;
    const cands = this.g.pond.biteCandidates({ x: b.x, z: b.z }, {
      timeKey: timeBucket(w.hour),
      baitKey: b.kind,
      weatherMul: WEATHER[w.weather].biteMul,
      rain: w.rainAmount > 0.5,
      lureRetrieve: b.retrieving,
    });
    let total = 0;
    for (const c of cands) total += c.rate;
    total *= BITE_SCALE;
    if (total > 0 && Math.random() < 1 - Math.exp(-total * dt)) {
      let r = Math.random() * total / BITE_SCALE;
      let pick = cands[cands.length - 1].fish;
      for (const c of cands) { r -= c.rate; if (r <= 0) { pick = c.fish; break; } }
      this._startNibble(pick);
    }
  }

  _startNibble(fish) {
    this.fish = fish;
    fish.locked = true;
    this._setPhase('nibble');
    this.timer = 0.6 + Math.random() * 1.0;
    this.g.sfx.nibble();
  }

  _updateNibble(dt, t) {
    this.timer -= dt;
    if (this.timer <= 0) {
      const sp = this.fish.species;
      this._setPhase('bite');
      this.timer = sp.legendary ? 0.9 : sp.rare ? 1.0 : 1.25;
      this.g.sfx.bite();
      this.g.ui.showBite(true);
    }
  }

  _updateBite(dt, t) {
    this.timer -= dt;
    this._hint('ŞİMDİ VUR!');
    if (this.timer <= 0) {
      this.g.toast('Balık yemi bıraktı…');
      this.g.sfx.escape();
      this._escape();
    }
  }

  _escape() {
    if (this.fish) { this.fish.locked = false; this.fish.scare(this.bait ? this.bait.x : 0, this.bait ? this.bait.z : 0); }
    this.g.ui.showBite(false);
    this.g.save.stats.escapes += 1;
    this.g.persist();
    this._reset();
  }

  _updateFight(dt, t, st) {
    const F = this.fight;
    const rod = this.rod;
    F.t += dt;
    const reel = st.held;

    // Balığın kuvveti: normal çekiş + ara sıra ani kaçış (surge)
    let f;
    if (F.surge > 0) {
      F.surge -= dt;
      f = 0.75 + 0.25 * F.s;
      if (F.surge <= 0) F.surgeCool = 2.0 + Math.random() * 2.0 + (1 - F.s) * 1.5;
    } else {
      F.surgeCool -= dt;
      f = (0.2 + 0.35 * F.s) * F.tire + 0.07 * Math.sin(F.t * 2.3 + F.ph);
      if (F.surgeCool <= 0) {
        F.surge = 0.8 + Math.random() * 0.8 + F.s * 0.5;
        this.g.sfx.surge();
      }
    }
    F.tire = Math.max(0.6, 1 - F.t * 0.008);

    // Hat gerilimi: makara çekince artar, balık çekince artar
    const target = f + (reel ? 0.42 : 0);
    F.T += (target - F.T) * Math.min(1, dt * 4);

    // Makara hızı ve balığın ipi geri alması
    const out = F.surge > 0 ? 1.2 * (0.6 + F.s) : 0;
    let inward = 0;
    if (reel) {
      inward = 2.2 * rod.reel * (1 - 0.45 * f);
      if (F.T > 1.0) inward *= 0.35;   // ip gergin: makara zorlanır
      F.tick -= dt;
      if (F.tick <= 0) { this.g.sfx.reel(); F.tick = 0.22; }
    }
    F.d += (out - inward) * dt;
    F.d = Math.max(0, F.d);

    // Kopma kontrolü
    if (F.T > rod.capacity) F.strain += dt; else F.strain = Math.max(0, F.strain - dt * 1.2);
    if (F.strain > 0.6) { this._lineBreak(); return; }
    if (F.d > rod.cast + 25) { this._escapeFight(); return; }

    // Yakalama
    if (F.d <= 1.2) { this._caught(); return; }

    this.g.ui.setFight({ tension: F.T, cap: rod.capacity, dist: F.d, total: F.dMax, reel });
    const hint = F.T > rod.capacity * 0.95 ? 'GEVŞET! ip kopmak üzere' : reel ? 'Makara çekiliyor…' : 'Basılı tut: makara  ·  Kırmızı bölgeye girince bırak';
    this._hint(hint);
  }

  _lineBreak() {
    const F = this.fight;
    F.fish.setHooked(false);
    F.fish.scare(this.bait.x, this.bait.z);
    this.g.sfx.snap();
    this.g.toast('İp koptu! Büyük balık kaçtı.');
    this.g.save.stats.breaks += 1;
    this.g.persist();
    this.fight = null;
    this.g.ui.showFight(false);
    this._setPhase('snapped');
    this.timer = 0.6;
    this.lineOn = false;
  }

  _escapeFight() {
    this.fight.fish.setHooked(false);
    this.fight.fish.scare(this.bait.x, this.bait.z);
    this.g.toast('Balık çok uzaklaştı, ip koptu.');
    this.g.save.stats.breaks += 1;
    this.g.persist();
    this.fight = null;
    this.g.ui.showFight(false);
    this._setPhase('snapped');
    this.timer = 0.6;
    this.lineOn = false;
  }

  _caught() {
    const F = this.fight;
    this.g.ui.showFight(false);
    this.g.sfx.catch();
    this.catchKg = F.kg;
    this.catchFish = F.fish;
    this.fight = null;
    this.lineOn = false;
    this._hint('');
    this._setPhase('catch');
    this.timer = 1.4;
  }

  _updateCatch(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    const sp = this.catchFish.species;
    const kg = Math.round(this.catchKg * 100) / 100;
    const s = this.g.save;
    const entry = s.journal[sp.id] || { count: 0, record: 0 };
    const first = entry.count === 0;
    const record = kg > entry.record;
    entry.count += 1;
    entry.record = Math.max(entry.record, kg);
    s.journal[sp.id] = entry;
    s.stats.catches += 1;
    this.g.persist();

    const price = Math.round(kg * sp.price);
    const canKeep = s.bag.length < MAX_BAG;
    this._setPhase('modal');
    this.g.ui.showCatch({
      id: sp.id, name: sp.name, kg, price, first, record,
      rare: !!sp.rare, legendary: !!sp.legendary, color: sp.color, desc: sp.desc,
    }, canKeep, (keep) => this._finishCatch(keep, kg, sp));
  }

  _finishCatch(keep, kg, sp) {
    if (keep) {
      this.g.save.bag.push({ id: sp.id, kg });
      this.g.toast(`${sp.name} çantaya eklendi.`);
      this.g.sfx.coin();
    } else {
      this.g.toast(`${sp.name} suya bırakıldı.`);
    }
    this.g.persist();
    if (this.catchFish) { this.catchFish.respawn(); this.catchFish = null; }
    this._reset();
  }

  _reset() {
    if (this.fish) { this.fish.locked = false; this.fish = null; }
    this.bait = null;
    this.fight = null;
    this.pulling = false;
    this.bobber.visible = false;
    this.line.visible = false;
    this.lineOn = false;
    this.g.ui.showBite(false);
    this.g.ui.showFight(false);
    this.g.ui.setPull(0);
    this._setPhase('idle');
  }

  // ---------- Görsel güncelleme ----------
  _updateVisuals(dt, t) {
    // Olta çubuğu
    let pitchTarget = 0.3;
    if (this.pulling) pitchTarget = 0.3 - 0.3 * this.pullValue;
    if (this.phase === 'fight') pitchTarget = 0.35 + 0.4 * clamp(this.fight.T, 0, 1.2);
    if (this.phase === 'waiting' || this.phase === 'nibble' || this.phase === 'bite') pitchTarget = 0.4;
    this.kick *= Math.pow(0.02, dt);
    this.jerk *= Math.pow(0.05, dt);
    const swing = this.kick * 0.8;
    this.rodPitch += (pitchTarget - this.rodPitch) * Math.min(1, dt * 8);
    this.pivot.rotation.x = this.rodPitch - swing + this.jerk * 0.35;
    this.rodRoot.rotation.y = (this.aim || this.aimBase) * 0.35;

    // İğne ve ip
    if (this.phase === 'casting') {
      this.bobber.visible = true;
      this.bobber.position.copy(this.bobPos);
      this._setLine(this.tipWorld, this.bobber.position);
    } else if (this.phase === 'waiting' || this.phase === 'nibble' || this.phase === 'bite') {
      const b = this.bait;
      this.bobber.visible = true;
      const wave = this.world.waveHeight(b.x, b.z, t);
      let y = WATER_Y + wave;
      if (this.phase === 'nibble') y += Math.sin(t * 35) * 0.025;
      if (this.phase === 'bite') y -= 0.22 + Math.sin(t * 40) * 0.04;
      else y += Math.sin(t * 2.2) * 0.02;
      this.bobber.position.set(b.x, y, b.z);
      this._setLine(this.tipWorld, this.bobber.position);
    } else if (this.phase === 'fight') {
      const p = this.fishMouth(this.fight);
      this.bobber.visible = false;
      this._setLine(this.tipWorld, p);
    } else if (this.phase === 'catch') {
      // Balık iskelenin üstüne çıkarılır (sergilenir)
      this.line.visible = false;
      const m = this.catchFish.mesh;
      m.position.set(0.15, DOCK.deckY + 0.28 + Math.abs(Math.sin(t * 9)) * 0.08, -2.6);
      m.rotation.set(0, 0.5, 0);
      m.userData.tailPivot.rotation.y = Math.sin(t * 30) * 0.6;
    } else {
      this.bobber.visible = false;
      this.line.visible = false;
    }

    if (this.phase === 'idle' || this.phase === 'snapped' || this.phase === 'modal') {
      if (this.phase !== 'modal') this.line.visible = false;
    }

    // Halkalar ve sıçrama
    for (const r of this.ripples) {
      if (r.life <= 0) continue;
      r.life -= dt * 0.9;
      const s = (1 - r.life) * 2.6 * (r.size || 1);
      r.m.scale.setScalar(Math.max(0.05, s));
      r.m.material.opacity = Math.max(0, r.life) * 0.6;
      if (r.life <= 0) r.m.visible = false;
    }
    for (const d of this.drops) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.v.y -= 9 * dt;
      d.m.position.addScaledVector(d.v, dt);
      if (d.m.position.y < WATER_Y || d.life <= 0) { d.life = 0; d.m.visible = false; }
    }
  }

  fishMouth(F) {
    const dock = this._dockPoint();
    const d = F.d;
    const sway = Math.sin(F.t * 2.1 + F.ph) * (0.6 + 0.8 * F.s) * Math.min(1, d / 6);
    const px = -F.dirZ, pz = F.dirX;
    const x = dock.x + F.dirX * d + px * sway;
    const z = dock.z + F.dirZ * d + pz * sway;
    const depth = -0.4 - 1.2 * Math.min(1, d / this.rod.cast);
    F.fish.mesh.position.set(x, depth, z);
    // Balık, ipin yönüne (iskeleye) bakar
    F.fish.mesh.rotation.y = Math.atan2(-(dock.z - z), dock.x - x) + (sway > 0 ? 0.25 : -0.25);
    F.fish.mesh.userData.tailPivot.rotation.y = Math.sin(F.t * 12) * 0.5;
    this.mouth.set(x + F.dirX * 0.3, depth + 0.05, z + F.dirZ * 0.3);
    return this.mouth;
  }

  _setLine(from, to) {
    const arr = this.lineArr;
    const n = this.linePts;
    const sagAmt = Math.min(0.9, from.distanceTo(to) * 0.02);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      arr[i * 3] = from.x + (to.x - from.x) * u;
      arr[i * 3 + 1] = from.y + (to.y - from.y) * u - Math.sin(Math.PI * u) * sagAmt;
      arr[i * 3 + 2] = from.z + (to.z - from.z) * u;
    }
    this.line.geometry.attributes.position.needsUpdate = true;
    this.line.visible = true;
  }

  // Yem bırakılırken dışarıdan okunabilir durum
  get busy() { return this.phase !== 'idle'; }
  get kgPreview() { return this.fight ? this.fight.kg : 0; }
}
