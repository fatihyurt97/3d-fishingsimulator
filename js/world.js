import * as THREE from 'three';
import { LAKE, DOCK, DAY_LENGTH_SEC, START_HOUR, WEATHER } from './config.js';

// Basit seedli rastgele: her açılışta aynı dünya oluşsun diye.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function heightAt(x, z) {
  const dx = x - LAKE.center.x, dz = z - LAKE.center.z;
  const r = Math.hypot(dx, dz) / LAKE.radius;
  let h;
  if (r < 1) {
    h = -LAKE.depth * Math.pow(Math.max(0, 1 - r * r), 0.7);
    h += 0.35 * Math.sin(x * 0.21) * Math.cos(z * 0.17);
  } else {
    h = (r - 1) * 3.0;
    h += Math.max(0, r - 1.4) * 1.2 * (Math.sin(x * 0.045) + Math.cos(z * 0.052) + 1.5);
  }
  return h;
}

const SKY = {
  nightTop: new THREE.Color(0x050a1c), nightHor: new THREE.Color(0x14213d),
  dayTop: new THREE.Color(0x3d8fdc), dayHor: new THREE.Color(0xc4e6f7),
  dusk: new THREE.Color(0xf08a5a), dawnTop: new THREE.Color(0x3a4d8a),
  rain: new THREE.Color(0x58626e),
};

// Su yüzeyi için tekrarlanabilir dalga normal haritası (prosedürel)
function makeWaterNormalMap() {
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  const H = (x, y) =>
    0.5 * Math.sin((2 * Math.PI * (3 * x + 2 * y)) / N) +
    0.3 * Math.sin((2 * Math.PI * (5 * x - 3 * y)) / N + 1.3) +
    0.2 * Math.sin((2 * Math.PI * (7 * x + 4 * y)) / N + 0.4) +
    0.12 * Math.sin((2 * Math.PI * (13 * x - 11 * y)) / N + 2.1);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * 1.6;
      const dy = (H(x, y + 1) - H(x, y - 1)) * 1.6;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * N + x) * 4;
      data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87c6ef);
    this.scene.fog = new THREE.Fog(0x9fd3f0, 60, 230);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 700);
    this.camera.position.set(0, 4, 6);
    this.camera.lookAt(0, 0.5, -20);
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight(0xdbeeff, 0x3a4a2a, 0.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 320 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.target.position.set(0, 0, -8);
    this.scene.add(this.sun.target);
    this.scene.add(this.sun);
    this.moon = new THREE.DirectionalLight(0x8fa8ff, 0.0);
    this.scene.add(this.moon);

    this.rand = rng(20260512);
    this.time = (START_HOUR / 24);
    this.weather = 'clear';
    this.weatherTimer = 90;
    this.rainAmount = 0;
    this.cloudAmount = 0.2;

    this._buildTerrain();
    this._buildWater();
    this._buildDock();
    this._buildSky();
    this._buildProps();
    this._buildClouds();
    this._buildRain();
    this._buildEnvironment();
    this.applyTime();
  }

  // ---------- inşa ----------
  _buildTerrain() {
    const size = 420, seg = 160;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const sand = new THREE.Color(0xc9a46c), mud = new THREE.Color(0x4a4232), deep = new THREE.Color(0x27382c);
    const grass = new THREE.Color(0x5b8a3a), grass2 = new THREE.Color(0x7ea64c), rock = new THREE.Color(0x857d6e);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      if (h < -0.05) {
        c.copy(mud).lerp(deep, Math.min(1, -h / LAKE.depth));
      } else if (h < 0.7) {
        c.copy(sand);
      } else if (h < 4) {
        const n = 0.5 + 0.5 * Math.sin(x * 0.31) * Math.cos(z * 0.27) + 0.15 * Math.sin(x * 1.7 + z * 0.9);
        c.copy(grass).lerp(grass2, THREE.MathUtils.clamp(n, 0, 1));
      } else {
        c.copy(grass).lerp(rock, Math.min(1, (h - 4) / 5));
      }
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  _buildWater() {
    const size = 420, seg = 120;
    this.waterGeo = new THREE.PlaneGeometry(size, size, seg, seg);
    this.waterGeo.rotateX(-Math.PI / 2);
    // Derinliğe göre renk: sığ turkuaz, derin lacivert
    const pos = this.waterGeo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const shallow = new THREE.Color(0x3c9f9a), deep = new THREE.Color(0x0f3650), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const d = THREE.MathUtils.clamp(-heightAt(pos.getX(i), pos.getZ(i)) / LAKE.depth, 0, 1);
      c.copy(shallow).lerp(deep, Math.sqrt(d));
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    this.waterGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    this.waterNormal = makeWaterNormalMap();
    this.waterNormal.repeat.set(36, 36);
    this.waterMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.07, metalness: 0.0,
      transparent: true, opacity: 0.8,
      normalMap: this.waterNormal, normalScale: new THREE.Vector2(0.45, 0.45),
      envMapIntensity: 0.3,
    });
    this.water = new THREE.Mesh(this.waterGeo, this.waterMat);
    this.water.receiveShadow = true;
    this.scene.add(this.water);
    this.waterBaseY = this.waterGeo.attributes.position.array.slice();
  }

  // Yansımalar için gökyüzünden ortam haritası (bir kez üretilir)
  _buildEnvironment() {
    const envScene = new THREE.Scene();
    const g = new THREE.SphereGeometry(100, 32, 16);
    const col = [];
    const p = g.attributes.position;
    const top = new THREE.Color(0x4a8fd6), hor = new THREE.Color(0xcfe9f8), gnd = new THREE.Color(0x3c5a34);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 100;
      c.copy(y > 0 ? hor.clone().lerp(top, Math.pow(y, 0.6)) : hor.clone().lerp(gnd, Math.min(1, -y * 3)));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    envScene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(envScene, 0.03).texture;
    pmrem.dispose();
    this.waterMat.envMap = this.envMap;
    this.waterMat.needsUpdate = true;
  }

  _buildDock() {
    this.dock = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a6240, roughness: 0.85, metalness: 0 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x5a3e28, roughness: 0.9, metalness: 0 });
    const tipZ = DOCK.tip.z, startZ = DOCK.standZ + 0.6;
    const length = startZ - tipZ;
    const plankW = 0.26, gap = 0.04;
    const plankGeo = new THREE.BoxGeometry(1.9, 0.12, plankW);
    const count = Math.ceil(length / (plankW + gap));
    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(plankGeo, wood);
      p.position.set(0, DOCK.deckY, startZ - i * (plankW + gap) - plankW / 2);
      p.castShadow = true; p.receiveShadow = true;
      this.dock.add(p);
    }
    const postGeo = new THREE.CylinderGeometry(0.1, 0.12, 5, 8);
    for (let i = 0; i <= 5; i++) {
      const z = startZ - (i * (length / 5));
      for (const x of [-0.85, 0.85]) {
        const post = new THREE.Mesh(postGeo, woodDark);
        post.position.set(x, DOCK.deckY - 2.2, z);
        post.castShadow = true;
        this.dock.add(post);
      }
    }
    for (const x of [-0.98, 0.98]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, length), woodDark);
      rail.position.set(x, DOCK.deckY - 0.02, (startZ + tipZ) / 2);
      rail.castShadow = true;
      this.dock.add(rail);
    }
    // Kıyıdaki dolap
    const shed = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 2.2), woodDark);
    shed.position.set(-8, 0.9, -6);
    shed.castShadow = true; shed.receiveShadow = true;
    this.dock.add(shed);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.1, 4), new THREE.MeshStandardMaterial({ color: 0x9c2f2f, roughness: 0.7 }));
    roof.rotation.y = Math.PI / 4;
    roof.position.set(-8, 2.6, -6);
    roof.castShadow = true;
    this.dock.add(roof);
    this.scene.add(this.dock);
  }

  _buildSky() {
    const geo = new THREE.SphereGeometry(500, 24, 16);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x3d8fdc) },
        uHor: { value: new THREE.Color(0xc4e6f7) },
        uBot: { value: new THREE.Color(0x27382c) },
        uSunGlow: { value: new THREE.Color(0xffd08a) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uGlow: { value: 0.0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uBot; uniform vec3 uSunGlow;
        uniform vec3 uSunDir; uniform float uGlow;
        varying vec3 vDir;
        void main(){
          float y = vDir.y;
          vec3 col = y > 0.0 ? mix(uHor, uTop, pow(y, 0.6)) : mix(uHor, uBot, min(1.0, -y * 4.0));
          float s = max(0.0, dot(normalize(vDir), normalize(uSunDir)));
          col += uSunGlow * pow(s, 8.0) * uGlow * 0.25;
          col += vec3(1.0, 0.95, 0.85) * pow(s, 900.0) * 1.2;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.scene.add(this.sky);
  }

  _buildProps() {
    const r = this.rand;
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 2.4, 7);
    const foliageLow = new THREE.ConeGeometry(1.9, 2.8, 9);
    const foliageTop = new THREE.ConeGeometry(1.2, 2.4, 9);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 0.95 });
    const foliageMats = [0x2c6a2e, 0x3d7a34, 0x2a5e3a, 0x4a7f3a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
    const rockGeo = new THREE.DodecahedronGeometry(1, 1);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8c8a84, roughness: 0.95, flatShading: true });

    let placed = 0, tries = 0;
    while (placed < 70 && tries < 2000) {
      tries++;
      const x = (r() - 0.5) * 260, z = -r() * 240 + 20;
      const dLake = Math.hypot(x - LAKE.center.x, z - LAKE.center.z) / LAKE.radius;
      if (dLake < 1.35 || (Math.abs(x) < 6 && z > -20 && z < 10)) continue;
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.2;
      const mat = foliageMats[Math.floor(r() * foliageMats.length)];
      const low = new THREE.Mesh(foliageLow, mat);
      low.position.y = 3.2;
      const top = new THREE.Mesh(foliageTop, mat);
      top.position.y = 4.6;
      for (const m of [trunk, low, top]) { m.castShadow = true; m.receiveShadow = true; }
      g.add(trunk, low, top);
      const s = 0.8 + r() * 0.8;
      g.scale.setScalar(s);
      g.position.set(x, heightAt(x, z), z);
      g.rotation.y = r() * Math.PI;
      this.scene.add(g);
      placed++;
    }

    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2;
      const rr = 1.0 + r() * 0.08;
      const x = LAKE.center.x + Math.cos(a) * LAKE.radius * rr;
      const z = LAKE.center.z + Math.sin(a) * LAKE.radius * rr;
      if (Math.abs(x) < 6 && z > -22 && z < 4) continue;
      const m = new THREE.Mesh(rockGeo, rockMat);
      const s = 0.5 + r() * 1.2;
      m.scale.set(s, s * 0.6, s * 0.9);
      m.position.set(x, heightAt(x, z) + 0.1, z);
      m.rotation.set(r() * 3, r() * 3, r() * 3);
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
    }

    const reedGeo = new THREE.CylinderGeometry(0.02, 0.03, 1.2, 4);
    reedGeo.translate(0, 0.6, 0);
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x6e8f3a, roughness: 0.8 });
    const reeds = new THREE.InstancedMesh(reedGeo, reedMat, 260);
    const m4 = new THREE.Matrix4();
    let rc = 0;
    for (let i = 0; i < 260 && rc < 260; i++) {
      const a = r() * Math.PI * 2;
      const rr = 0.97 + r() * 0.06;
      const x = LAKE.center.x + Math.cos(a) * LAKE.radius * rr;
      const z = LAKE.center.z + Math.sin(a) * LAKE.radius * rr;
      if (Math.abs(x) < 6 && z > -22 && z < 4) continue;
      const s = 0.6 + r() * 0.8;
      m4.makeRotationFromEuler(new THREE.Euler(r() * 0.2, r() * 6, r() * 0.2));
      m4.scale(new THREE.Vector3(s, s, s));
      m4.setPosition(x, heightAt(x, z) - 0.05, z);
      reeds.setMatrixAt(rc++, m4);
    }
    reeds.count = rc;
    this.scene.add(reeds);
  }

  _buildClouds() {
    this.clouds = [];
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.9 });
    const geo = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      const n = 4 + Math.floor(this.rand() * 3);
      for (let j = 0; j < n; j++) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set((j - n / 2) * 2.2 + this.rand(), this.rand() * 0.8, this.rand() * 2);
        m.scale.set(2.6 + this.rand() * 1.5, 1.6 + this.rand() * 0.8, 2.2 + this.rand());
        g.add(m);
      }
      g.position.set((this.rand() - 0.5) * 500, 60 + this.rand() * 30, -this.rand() * 300 + 60);
      g.userData.speed = 1.5 + this.rand() * 2;
      this.scene.add(g);
      this.clouds.push(g);
    }
    this.cloudMat = mat;
  }

  _buildRain() {
    const N = 900;
    this.rainCount = N;
    this.rainPos = new Float32Array(N * 6);
    this.rainSeed = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.rainSeed[i * 3] = (this.rand() - 0.5) * 40;
      this.rainSeed[i * 3 + 1] = this.rand() * 16;
      this.rainSeed[i * 3 + 2] = -this.rand() * 60;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xcfe3f0, transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  // ---------- zaman & hava ----------
  get hour() { return (this.time * 24) % 24; }

  setTime(hour) { this.time = ((hour % 24) + 24) % 24 / 24; this.applyTime(); }

  advanceHours(h) { this.setTime(this.hour + h); }

  setWeather(w) {
    this.weather = w;
    this.weatherTimer = 80 + Math.random() * 90;
  }

  nextWeather() {
    const roll = Math.random();
    if (this.weather === 'clear') return roll < 0.7 ? 'clear' : 'cloudy';
    if (this.weather === 'cloudy') return roll < 0.45 ? 'clear' : roll < 0.8 ? 'cloudy' : 'rain';
    return roll < 0.5 ? 'cloudy' : 'rain';
  }

  update(dt, t) {
    this.time = (this.time + dt / DAY_LENGTH_SEC) % 1;
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) this.setWeather(this.nextWeather());

    const targetRain = this.weather === 'rain' ? 1 : 0;
    this.rainAmount += (targetRain - this.rainAmount) * Math.min(1, dt * 0.5);
    const targetCloud = this.weather === 'clear' ? 0.2 : this.weather === 'cloudy' ? 0.7 : 1.0;
    this.cloudAmount += (targetCloud - this.cloudAmount) * Math.min(1, dt * 0.4);

    // Su dalgası (geometri) ve kayan normal haritası (detay)
    const pos = this.waterGeo.attributes.position;
    const base = this.waterBaseY;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], z = base[i * 3 + 2];
      pos.setY(i, this.waveHeight(x, z, t));
    }
    pos.needsUpdate = true;
    this.waterGeo.computeVertexNormals();
    this.waterNormal.offset.set(t * 0.012, t * 0.008);

    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt * (0.5 + this.cloudAmount);
      if (c.position.x > 300) c.position.x = -300;
    }
    this.cloudMat.opacity = 0.35 + 0.6 * this.cloudAmount;

    this.rain.visible = this.rainAmount > 0.05;
    if (this.rain.visible) {
      const P = this.rainPos, S = this.rainSeed;
      const fall = dt * 22;
      for (let i = 0; i < this.rainCount; i++) {
        S[i * 3 + 1] -= fall;
        if (S[i * 3 + 1] < 0) S[i * 3 + 1] += 16;
        const x = S[i * 3] + this.camera.position.x;
        const y = S[i * 3 + 1];
        const z = S[i * 3 + 2] + this.camera.position.z;
        P[i * 6] = x; P[i * 6 + 1] = y + 0.6; P[i * 6 + 2] = z;
        P[i * 6 + 3] = x - 0.05; P[i * 6 + 4] = y; P[i * 6 + 5] = z;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.opacity = 0.2 + 0.3 * this.rainAmount;
    }

    this.applyTime();
  }

  waveHeight(x, z, t) {
    return 0.05 * Math.sin(x * 0.4 + t * 1.1) + 0.04 * Math.sin(z * 0.35 - t * 0.9)
      + 0.02 * Math.sin((x + z) * 0.8 + t * 2.0);
  }

  // Gün dönümü, gökyüzü, ışıklar, sis
  applyTime() {
    const e = Math.sin((this.time - 0.25) * Math.PI * 2); // -1 gece yarısı, 0 doğuş/batış, 1 öğle
    const dayF = THREE.MathUtils.smoothstep(e, -0.12, 0.28);
    const twiF = Math.max(0, 1 - Math.abs(e) * 3.2);

    const top = SKY.nightTop.clone().lerp(SKY.dayTop, dayF);
    const hor = SKY.nightHor.clone().lerp(SKY.dayHor, dayF);
    hor.lerp(SKY.dusk, twiF * 0.85);
    top.lerp(SKY.dawnTop, twiF * 0.5);

    const grayF = Math.max(this.rainAmount * 0.75, this.cloudAmount * 0.35);
    top.lerp(SKY.rain, grayF * (0.3 + 0.7 * dayF + 0.2));
    hor.lerp(SKY.rain, grayF * 0.8);

    this.skyMat.uniforms.uTop.value.copy(top);
    this.skyMat.uniforms.uHor.value.copy(hor);
    this.skyMat.uniforms.uSunDir.value.set(0.4, Math.max(-0.2, e), -0.9);
    this.skyMat.uniforms.uGlow.value = twiF;
    this.scene.background = hor;
    this.scene.fog.color.copy(hor);
    this.scene.fog.far = WEATHER[this.weather].fogFar * (0.7 + 0.3 * dayF + 0.3 * (1 - this.rainAmount));
    this.scene.fog.near = 40 - 25 * this.rainAmount;

    // Güneş: gerçek gölge yönü. Hedef iskele civarı.
    const sunI = Math.max(0, e) * 2.8 * (1 - 0.45 * grayF);
    this.sun.intensity = sunI;
    this.sun.position.set(this.sun.target.position.x + 30, this.sun.target.position.y + 100 * Math.max(0.08, e) + 4, this.sun.target.position.z - 45);
    this.sun.color.setRGB(1, 0.9 + 0.08 * dayF, 0.78 + 0.22 * dayF);
    this.sun.castShadow = sunI > 0.05;
    this.moon.intensity = Math.max(0, -e) * 0.35;
    this.moon.position.set(-40, 80, 60);
    this.hemi.intensity = (0.25 + 0.5 * dayF) * (1 - 0.3 * grayF);
    this.hemi.color.set(0xdbeeff).lerp(new THREE.Color(0x9fb4ff), 1 - dayF);
    this.waterMat.opacity = 0.8 - 0.1 * (1 - dayF);
    this.waterMat.envMapIntensity = 0.12 + 0.28 * dayF;
    this.cloudMat.color.set(0xffffff).lerp(new THREE.Color(0x7a8594), grayF);
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.9 ? 70 : 55;
    this.camera.updateProjectionMatrix();
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
