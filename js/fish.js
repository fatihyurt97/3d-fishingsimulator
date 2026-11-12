import * as THREE from 'three';
import { SPECIES, DOCK, LAKE, zoneOfDistance } from './config.js';

// ---- Paylaşılan geometri ve malzemeler (performans için) ----
const GEO = {
  body: new THREE.SphereGeometry(0.5, 14, 10),
  tail: new THREE.ConeGeometry(0.3, 0.45, 4),
  fin: new THREE.ConeGeometry(0.12, 0.28, 3),
  eye: new THREE.SphereGeometry(0.075, 8, 6),
  pupil: new THREE.SphereGeometry(0.035, 6, 4),
};
const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) {
    matCache.set(color, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  }
  return matCache.get(color);
}
const WHITE = new THREE.MeshBasicMaterial({ color: 0xffffff });
const BLACK = new THREE.MeshBasicMaterial({ color: 0x111111 });

export function buildFishMesh(sp, sizeJitter = 1) {
  const root = new THREE.Group();
  const L = (0.45 + 0.28 * Math.cbrt(sp.maxKg)) * sizeJitter;
  root.scale.setScalar(L);

  const body = new THREE.Mesh(GEO.body, mat(sp.color));
  body.scale.set(1, 0.55, 0.42);
  root.add(body);

  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.45, 0, 0);
  const tail = new THREE.Mesh(GEO.tail, mat(sp.finColor));
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-0.2, 0, 0);
  tail.scale.set(1, 1, 0.25);
  tailPivot.add(tail);
  root.add(tailPivot);

  const dorsal = new THREE.Mesh(GEO.fin, mat(sp.finColor));
  dorsal.position.set(0.02, 0.27, 0);
  dorsal.scale.set(1, 1, 0.35);
  root.add(dorsal);

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(GEO.eye, WHITE);
    eye.position.set(0.3, 0.07, side * 0.17);
    const pupil = new THREE.Mesh(GEO.pupil, BLACK);
    pupil.position.set(0.36, 0.07, side * 0.2);
    root.add(eye, pupil);
  }

  root.userData.tailPivot = tailPivot;
  root.userData.length = L;
  return root;
}

const TAU = Math.PI * 2;
function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}

export class Fish {
  constructor(species, scene, rand) {
    this.species = species;
    this.rand = rand;
    this.homeZone = species.zones[Math.floor(rand() * species.zones.length)];
    this.mesh = buildFishMesh(species, 0.9 + rand() * 0.2);
    scene.add(this.mesh);
    this.depth = species.id === 'ejderha' ? -3.2 : (this.homeZone === 'deep' ? -2.2 : this.homeZone === 'mid' ? -1.4 : -0.7);
    this.baseSpeed = 0.35 + rand() * 0.4;
    this.speed = this.baseSpeed;
    this.hooked = false;
    this.locked = false;       // ısırdı, yeme doğru gidiyor
    this.scared = 0;           // kaçma süresi
    this.wanderTimer = 0;
    this.phase = rand() * 10;
    this.yaw = rand() * TAU;
    this.moving = true;
    const p = this.randomPointInZone(this.homeZone);
    this.x = p.x; this.z = p.z;
    this.target = this.randomPointInZone(this.homeZone);
    this.kg = 0;
  }

  randomPointInZone(zone) {
    for (let i = 0; i < 200; i++) {
      const a = this.rand() * TAU;
      const rr = Math.sqrt(this.rand()) * 0.9;
      const x = LAKE.center.x + Math.cos(a) * LAKE.radius * rr;
      const z = LAKE.center.z + Math.sin(a) * LAKE.radius * rr;
      if (zoneOfDistance(Math.hypot(x - DOCK.tip.x, z - DOCK.tip.z)) === zone) return { x, z };
    }
    return { x: LAKE.center.x, z: LAKE.center.z };
  }

  // Yeme yakınsa gider, yoksa gezinir. bait: {x,z} veya null
  update(dt, t, bait) {
    if (this.hooked) return;

    let tx, tz, spd = this.baseSpeed;
    if (this.scared > 0) {
      this.scared -= dt;
      tx = this.target.x; tz = this.target.z;
      spd = 2.2;
      if (Math.hypot(tx - this.x, tz - this.z) < 1.5 || this.scared <= 0) {
        this.target = this.randomPointInZone(this.homeZone);
      }
    } else if (this.locked && bait) {
      tx = bait.x; tz = bait.z; spd = 1.2;
    } else if (bait && Math.hypot(bait.x - this.x, bait.z - this.z) < 10) {
      // Yemi fark etti: yaklaş ama üstüne çıkma
      tx = bait.x; tz = bait.z; spd = 0.7;
      const dist = Math.hypot(tx - this.x, tz - this.z);
      if (dist < 1.4) { this.moving = false; this._face(tx, tz); this._pos(dt, t); return; }
    } else {
      this.wanderTimer -= dt;
      const dist = Math.hypot(this.target.x - this.x, this.target.z - this.z);
      if (dist < 1.2 || this.wanderTimer <= 0) {
        this.target = this.randomPointInZone(this.homeZone);
        this.wanderTimer = 6 + this.rand() * 8;
      }
      tx = this.target.x; tz = this.target.z;
    }

    const dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const step = Math.min(d, spd * dt);
      this.x += (dx / d) * step;
      this.z += (dz / d) * step;
      this._face(tx, tz);
      this.moving = true;
    } else {
      this.moving = false;
    }
    this._pos(dt, t);
  }

  _face(tx, tz) {
    const want = Math.atan2(-(tz - this.z), tx - this.x);
    this.yaw = angleLerp(this.yaw, want, 0.12);
  }

  _pos(dt, t) {
    // Gölün içinde kal
    const dLake = Math.hypot(this.x - LAKE.center.x, this.z - LAKE.center.z);
    if (dLake > LAKE.radius * 0.93) {
      const k = (LAKE.radius * 0.93) / dLake;
      this.x = LAKE.center.x + (this.x - LAKE.center.x) * k;
      this.z = LAKE.center.z + (this.z - LAKE.center.z) * k;
    }
    this.mesh.position.set(this.x, this.depth + Math.sin(t * 1.3 + this.phase) * 0.05, this.z);
    this.mesh.rotation.y = this.yaw;
    const tp = this.mesh.userData.tailPivot;
    const wag = this.moving ? 0.5 : 0.18;
    tp.rotation.y = Math.sin(t * (this.moving ? 11 : 4) + this.phase) * wag;
  }

  // Yem, şu an bu balık için cazip mi?
  distanceTo(p) { return Math.hypot(p.x - this.x, p.z - this.z); }

  setHooked(on) {
    this.hooked = on;
    this.locked = false;
  }

  // Balığı sığ/derin dağılım dışına taşımadan yeniden yerleştir
  respawn() {
    const p = this.randomPointInZone(this.homeZone);
    this.x = p.x; this.z = p.z;
    this.target = this.randomPointInZone(this.homeZone);
    this.scared = 0; this.locked = false; this.hooked = false;
  }

  scare(fromX, fromZ) {
    this.scared = 4;
    this.locked = false;
    const away = this.randomPointInZone('deep');
    this.target = { x: this.x + (this.x - fromX) * 0.5 + (away.x - this.x) * 0.2, z: this.z + (this.z - fromZ) * 0.5 + (away.z - this.z) * 0.2 };
    this.target.x = Math.max(LAKE.center.x - LAKE.radius * 0.9, Math.min(LAKE.center.x + LAKE.radius * 0.9, this.target.x));
    this.target.z = Math.max(LAKE.center.z - LAKE.radius * 0.9, Math.min(LAKE.center.z + LAKE.radius * 0.9, this.target.z));
  }
}

export class FishPond {
  constructor(scene, rand) {
    this.fish = [];
    for (const sp of SPECIES) {
      for (let i = 0; i < sp.count; i++) {
        this.fish.push(new Fish(sp, scene, rand));
      }
    }
  }

  update(dt, t, bait) {
    for (const f of this.fish) f.update(dt, t, bait);
  }

  // Yemin çevresindeki balıklar için ısırma olasılığı çarpanı
  // ctx: { timeMul, baitKey, weatherMul, rain, lureRetrieve }
  biteCandidates(bait, ctx) {
    const out = [];
    for (const f of this.fish) {
      if (f.hooked || f.locked || f.scared > 0) continue;
      const d = f.distanceTo(bait);
      if (d > 8) continue;
      const sp = f.species;
      let m = (sp.timeW[ctx.timeKey] ?? 1) * (sp.baitW[ctx.baitKey] ?? 1) * ctx.weatherMul;
      if (ctx.rain) m *= sp.rainW;
      if (ctx.baitKey === 'lure' && !ctx.lureRetrieve) m *= 0.25;
      // yakın olan daha çok ilgi görür
      const proximity = 1 - d / 8;
      out.push({ fish: f, rate: sp.bite * m * proximity });
    }
    return out;
  }
}
