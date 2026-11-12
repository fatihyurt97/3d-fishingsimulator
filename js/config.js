// Tüm tasarım sayıları burada. Denge ayarı yapmak için genelde sadece bu dosya değişir.

export const LAKE = {
  center: { x: 0, z: -60 },   // göl merkezi
  radius: 50,                  // göl yarıçapı (m)
  depth: 6,                    // en derin nokta (m)
};

export const DOCK = {
  tip: { x: 0, z: -14 },       // iskelenin su tarafındaki ucu
  deckY: 0.9,                  // iskele yüzeyi yüksekliği
  standZ: 0,                   // oyuncunun durduğu yer
};

// Mesafe bölgeleri (iskele ucundan itibaren, metre)
export const ZONE_LIMITS = { shallow: 13, mid: 28 };

export function zoneOfDistance(d) {
  if (d < ZONE_LIMITS.shallow) return 'shallow';
  if (d < ZONE_LIMITS.mid) return 'mid';
  return 'deep';
}

export const DAY_LENGTH_SEC = 240;  // bir oyun günü gerçek zamanda kaç saniye
export const START_HOUR = 7;

export const WEATHER = {
  clear:  { label: 'Açık',    biteMul: 1.0,  fogFar: 230, rain: false },
  cloudy: { label: 'Bulutlu', biteMul: 1.15, fogFar: 200, rain: false },
  rain:   { label: 'Yağmur',  biteMul: 1.35, fogFar: 150, rain: true  },
};

export const BAITS = {
  worm:  { name: 'Solucan',     unit: 'adet', consumable: true, packSize: 10, packPrice: 5,  desc: 'Her balığa iyi gelir.' },
  dough: { name: 'Hamur',       unit: 'adet', consumable: true, packSize: 10, packPrice: 8,  desc: 'Sazan ve altın sazan\'ın favorisi.' },
  lure:  { name: 'Yapay Yem',   unit: '',     consumable: false, price: 45, desc: 'Sürükleyerek kullan. Yırtıcılar bayılır.' },
};

export const RODS = {
  bambu:  { name: 'Bambu Olta',   price: 0,   cast: 30, capacity: 1.0,  reel: 1.0,  desc: 'Başlangıç oltası. Hafif, ama sınırlı.' },
  fiber:  { name: 'Fiber Olta',   price: 250, cast: 45, capacity: 1.15, reel: 1.15, desc: 'Daha uzağa atar, ipi daha iyi tutar.' },
  karbon: { name: 'Karbon Olta',  price: 900, cast: 60, capacity: 1.3,  reel: 1.3,  desc: 'Profesyonel. Efsane balıklara hazır.' },
};

export const MAX_BAG = 10;
export const START_MONEY = 60;
export const START_BAITS = { worm: 15, dough: 0 };

// Balık türleri. bite: saniyede temel ısırma olasılığı (yakında ve uygun şartta).
// timeW: gün dönemine göre çarpan. baitW: yem türüne göre çarpan. rainW: yağmurda ek çarpan.
export const SPECIES = [
  {
    id: 'kefal', name: 'Kefal', color: 0x9fb4c2, finColor: 0x6d8594,
    zones: ['shallow'], minKg: 0.3, maxKg: 1.2, price: 10, strength: 0.25,
    bite: 0.06, count: 7, timeW: { dawn: 1.0, day: 1.0, dusk: 0.8, night: 0.3 },
    baitW: { worm: 1.0, dough: 1.2, lure: 0.2 }, rainW: 1.0,
    desc: 'Sığ sularda sürü halinde gezer. Ufak ama her zaman bir şey.',
  },
  {
    id: 'lina', name: 'Lina', color: 0x5d7a3a, finColor: 0x3b4f24,
    zones: ['shallow', 'mid'], minKg: 0.4, maxKg: 2.5, price: 16, strength: 0.4,
    bite: 0.05, count: 4, timeW: { dawn: 1.6, day: 0.8, dusk: 1.2, night: 0.3 },
    baitW: { worm: 1.0, dough: 2.0, lure: 0.1 }, rainW: 1.0,
    desc: 'Çamurlu dibi sever. Sabah erken saatlerde en aktifidir.',
  },
  {
    id: 'sazan', name: 'Sazan', color: 0xc89a3a, finColor: 0x8c6a22,
    zones: ['shallow', 'mid'], minKg: 0.8, maxKg: 7, price: 18, strength: 0.55,
    bite: 0.05, count: 6, timeW: { dawn: 1.2, day: 1.0, dusk: 1.3, night: 0.9 },
    baitW: { worm: 0.7, dough: 2.5, lure: 0.1 }, rainW: 1.0,
    desc: 'Göllerin klasiği. Hamuru görünce deliye döner.',
  },
  {
    id: 'sudak', name: 'Gümüş Sudak', color: 0xc9d6dc, finColor: 0x8fa3ad,
    zones: ['mid'], minKg: 0.2, maxKg: 1.6, price: 22, strength: 0.45,
    bite: 0.05, count: 4, timeW: { dawn: 2.0, day: 0.5, dusk: 2.0, night: 0.8 },
    baitW: { worm: 1.5, dough: 0.5, lure: 1.2 }, rainW: 1.1,
    desc: 'Şafakta ve alacakaranlıkta sürüler halinde avlanır.',
  },
  {
    id: 'alabalik', name: 'Gökkuşağı Alabalığı', color: 0xe07aa0, finColor: 0x9bd1ff,
    zones: ['shallow', 'mid'], minKg: 0.5, maxKg: 3, price: 30, strength: 0.6,
    bite: 0.04, count: 4, timeW: { dawn: 1.2, day: 1.4, dusk: 1.0, night: 0.2 },
    baitW: { worm: 0.8, dough: 0.2, lure: 2.5 }, rainW: 1.5,
    desc: 'Temiz ve serin suyu sever. Yapay yemi kovalar.',
  },
  {
    id: 'turna', name: 'Turna', color: 0x4f6b3e, finColor: 0x2c3d22,
    zones: ['mid', 'deep'], minKg: 2, maxKg: 12, price: 35, strength: 0.8,
    bite: 0.035, count: 3, timeW: { dawn: 1.2, day: 0.6, dusk: 1.8, night: 1.6 },
    baitW: { worm: 1.0, dough: 0.1, lure: 3.0 }, rainW: 1.0,
    desc: 'Dişleri keskin, saldırganı yüksek. Yapay yemde ölümcül.',
  },
  {
    id: 'yayin', name: 'Yayın', color: 0x3d3a33, finColor: 0x26241f,
    zones: ['deep'], minKg: 5, maxKg: 25, price: 25, strength: 0.95,
    bite: 0.03, count: 3, timeW: { dawn: 0.6, day: 0.3, dusk: 1.4, night: 2.2 },
    baitW: { worm: 2.5, dough: 1.0, lure: 0.8 }, rainW: 1.6,
    desc: 'Derin ve karanlık suların yaşlı avcısı. Gece uyanır.',
  },
  {
    id: 'altin', name: 'Altın Sazan', color: 0xffc83d, finColor: 0xff9f1a,
    zones: ['mid', 'deep'], minKg: 3, maxKg: 10, price: 90, strength: 0.85,
    bite: 0.012, count: 1, timeW: { dawn: 2.2, day: 0.5, dusk: 0.8, night: 0.6 },
    baitW: { worm: 0.6, dough: 3.0, lure: 0.1 }, rainW: 1.0, rare: true,
    desc: 'Efsaneleri süsleyen nadir sazan. Şafakta hamura yaklaşır.',
  },
  {
    id: 'ejderha', name: 'Göl Ejderi', color: 0x6b3fa0, finColor: 0x2de0c4,
    zones: ['deep'], minKg: 40, maxKg: 80, price: 150, strength: 1.0,
    bite: 0.006, count: 1, timeW: { dawn: 0.3, day: 0.05, dusk: 1.5, night: 3.0 },
    baitW: { worm: 2.0, dough: 0.5, lure: 1.0 }, rainW: 3.0, rare: true, legendary: true,
    desc: 'Gölün dibinde yaşadığı söylenen efsane. Gerçek mi? Sadece gece ve yağmurda...',
  },
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map(s => [s.id, s]));

export function timeBucket(hour) {
  if (hour >= 5 && hour < 9) return 'dawn';
  if (hour >= 9 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}
