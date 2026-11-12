import { SPECIES, BAITS, RODS, MAX_BAG, WEATHER } from './config.js';

const $ = (id) => document.getElementById(id);
const fmtTime = (h) => {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export class UI {
  constructor(game) {
    this.g = game;
    this.modalOpen = false;
    this.modalCloseable = true;
    this.lastToastT = 0;
    this._bind();
  }

  _bind() {
    $('btn-shop').onclick = () => this.g.openMenu('shop');
    $('btn-bag').onclick = () => this.g.openMenu('bag');
    $('btn-book').onclick = () => this.g.openMenu('journal');
    $('btn-settings').onclick = () => this.g.openMenu('settings');
    $('bait-btn').onclick = () => this.g.cycleBait();
    $('modal-close').onclick = () => { if (this.modalCloseable) this.closeModal(); };
    $('modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal' && this.modalCloseable) this.closeModal();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.modalOpen && this.modalCloseable) this.closeModal();
    });
  }

  // ---------- HUD ----------
  updateHud() {
    const s = this.g.save;
    $('money').textContent = `${s.money} ₺`;
    $('clock').textContent = fmtTime(this.g.world.hour);
    const w = WEATHER[this.g.world.weather];
    $('weather').textContent = (this.g.world.weather === 'rain' ? '🌧 ' : this.g.world.weather === 'cloudy' ? '☁ ' : '☀ ') + w.label;
    const k = this.g.currentBaitKind();
    if (k) {
      const count = k === 'lure' ? '∞' : s.baits[k];
      $('bait-name').textContent = `${BAITS[k].name}`;
      $('bait-count').textContent = `× ${count}`;
    } else {
      $('bait-name').textContent = 'Yem yok';
      $('bait-count').textContent = '';
    }
    $('bag-count').textContent = `${s.bag.length}/${MAX_BAG}`;
  }

  setHint(t) { $('hint').textContent = t; }

  setPull(v) {
    const el = $('pull');
    el.classList.toggle('show', v > 0.001);
    $('pull-fill').style.height = `${Math.round(v * 100)}%`;
  }

  showBite(on) { $('bite').classList.toggle('show', on); }

  showFight(on) { $('fight').classList.toggle('show', on); }

  setFight({ tension, cap, dist, total, reel }) {
    // Gerilim ölçeği 0..1.4. Yeşil bant ideal aralık: 0.45..0.9 (kapasite üstü tehlike)
    const max = 1.4;
    const pct = Math.max(0, Math.min(1, tension / max)) * 100;
    $('tension-fill').style.height = `${pct}%`;
    const danger = tension > cap;
    $('tension-fill').classList.toggle('danger', danger);
    $('reel-state').textContent = reel ? 'MAKARA ▲' : 'serbest';
    $('dist-text').textContent = `${dist.toFixed(0)} m`;
    const prog = total > 0 ? Math.max(0, Math.min(1, 1 - dist / total)) : 0;
    $('dist-fill').style.width = `${Math.round(prog * 100)}%`;
  }

  toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ---------- Modal ----------
  isModalOpen() { return this.modalOpen; }

  openModal(title, html, { closeable = true, wide = false } = {}) {
    this.modalOpen = true;
    this.modalCloseable = closeable;
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = html;
    $('modal-close').style.display = closeable ? '' : 'none';
    $('modal-card').classList.toggle('wide', wide);
    $('modal').classList.add('show');
  }

  closeModal() {
    this.modalOpen = false;
    $('modal').classList.remove('show');
    $('modal-body').innerHTML = '';
    this.g.onModalClosed?.();
  }

  // Ana menü
  showStart(hasSave) {
    this.openModal('Göl Avcısı', `
      <p class="lead">Gölün sessizliğine hoş geldin. Olta at, balığı bekle, doğru anda vur.</p>
      <ul class="howto">
        <li><b>At:</b> Ekranda aşağı çek, bırak. (Klavye: Boşluk basılı tut, bırak)</li>
        <li><b>Vur:</b> “ŞİMDİ VUR!” çıkınca dokun.</li>
        <li><b>Makara:</b> Basılı tut = çek. Gerilim kırmızıya gelirse bırak, yoksa ip kopar.</li>
        <li><b>Uzaklık = bölge:</b> Yakın atış sığ, uzak atış derin sudur. Efsaneler derinde.</li>
      </ul>
      <div class="row">
        <button class="btn primary big" id="start-btn">${hasSave ? 'Devam Et' : 'Oyna'}</button>
      </div>
    `, { closeable: false });
    $('start-btn').onclick = () => this.g.startGame();
  }

  showShop() {
    const s = this.g.save;
    const baitRows = ['worm', 'dough'].map(k => {
      const b = BAITS[k];
      return `<div class="item">
        <div class="meta"><b>${b.name}</b><span>${b.desc}</span><span class="stock">Elinde: ${s.baits[k] || 0}</span></div>
        <button class="btn" data-buy-bait="${k}">${b.packSize} adet · ${b.packPrice} ₺</button>
      </div>`;
    }).join('');
    const lure = `<div class="item">
      <div class="meta"><b>${BAITS.lure.name}</b><span>${BAITS.lure.desc}</span><span class="stock">${s.ownsLure ? 'Sahipsin (kalıcı)' : ''}</span></div>
      ${s.ownsLure ? '<button class="btn" disabled>Sahipsin</button>' : `<button class="btn" data-buy-lure="1">${BAITS.lure.price} ₺</button>`}
    </div>`;
    const rodRows = Object.entries(RODS).map(([id, r]) => {
      const owned = s.ownedRods.includes(id);
      const equipped = s.rod === id;
      let btn;
      if (equipped) btn = '<button class="btn" disabled>Kullanılıyor</button>';
      else if (owned) btn = `<button class="btn" data-equip-rod="${id}">Tak</button>`;
      else btn = `<button class="btn" data-buy-rod="${id}" ${s.money < r.price ? 'disabled' : ''}>${r.price} ₺</button>`;
      return `<div class="item">
        <div class="meta"><b>${r.name}</b><span>${r.desc}</span><span class="stock">Atış ${r.cast} m · Kapasite ${Math.round(r.capacity * 100)}%</span></div>
        ${btn}
      </div>`;
    }).join('');
    this.openModal('Dükkân', `
      <div class="money-line">Bakiye: <b>${s.money} ₺</b></div>
      <h3>Yemler</h3>${baitRows}${lure}
      <h3>Oltalar</h3>${rodRows}
    `);
    const body = $('modal-body');
    body.querySelectorAll('[data-buy-bait]').forEach(b => b.onclick = () => this.g.buyBait(b.dataset.buyBait));
    body.querySelectorAll('[data-buy-lure]').forEach(b => b.onclick = () => this.g.buyLure());
    body.querySelectorAll('[data-buy-rod]').forEach(b => b.onclick = () => this.g.buyRod(b.dataset.buyRod));
    body.querySelectorAll('[data-equip-rod]').forEach(b => b.onclick = () => this.g.equipRod(b.dataset.equipRod));
  }

  showBag() {
    const s = this.g.save;
    let total = 0;
    const rows = s.bag.map((f, i) => {
      const sp = SPECIES.find(x => x.id === f.id);
      const v = Math.round(f.kg * sp.price);
      total += v;
      return `<div class="item"><div class="meta"><b>${sp.name}</b><span>${f.kg.toFixed(2)} kg</span></div><span class="price">${v} ₺</span></div>`;
    }).join('') || '<p class="empty">Çanta boş. Yakaladığın balıkları “Çantaya koy” diyerek buraya ekleyebilirsin.</p>';
    this.openModal(`Çanta ${s.bag.length}/${MAX_BAG}`, `
      ${rows}
      <div class="row">
        <div class="money-line">Toplam değer: <b>${total} ₺</b></div>
        <button class="btn primary" id="sell-btn" ${s.bag.length ? '' : 'disabled'}>Hepsini Sat</button>
      </div>
    `);
    const btn = $('sell-btn');
    if (btn) btn.onclick = () => this.g.sellAll();
  }

  showJournal() {
    const s = this.g.save;
    const found = Object.keys(s.journal).length;
    const cards = SPECIES.map(sp => {
      const e = s.journal[sp.id];
      if (!e) {
        return `<div class="card unknown"><div class="swatch" style="background:#334"></div>
          <b>???</b><span>Henüz yakalanmadı</span></div>`;
      }
      return `<div class="card ${sp.legendary ? 'legend' : sp.rare ? 'rare' : ''}">
        <div class="swatch" style="background:${hex(sp.color)}"></div>
        <b>${sp.name}</b>
        <span>Yakalanan: ${e.count} · Rekor: ${e.record.toFixed(2)} kg</span>
        <span class="desc">${sp.desc}</span>
      </div>`;
    }).join('');
    const st = s.stats;
    this.openModal(`Balık Kitabı ${found}/${SPECIES.length}`, `
      <div class="grid">${cards}</div>
      <p class="stats">Atış: ${st.casts} · Yakalama: ${st.catches} · Kaçan: ${st.escapes} · Kopan ip: ${st.breaks}</p>
    `, { wide: true });
  }

  showSettings() {
    const s = this.g.save;
    this.openModal('Ayarlar', `
      <div class="item"><div class="meta"><b>Ses</b><span>Dalga, kuş ve olta efektleri</span></div>
        <button class="btn" id="sound-btn">${s.sound ? 'Açık' : 'Kapalı'}</button></div>
      <div class="item"><div class="meta"><b>Zamanı ilerlet</b><span>+2 saat (test için)</span></div>
        <button class="btn" id="time-btn">+2 saat</button></div>
      <div class="item"><div class="meta"><b>Hava değiştir</b><span>Açık → Bulutlu → Yağmur</span></div>
        <button class="btn" id="weather-btn">Değiştir</button></div>
      <div class="item"><div class="meta"><b>Kaydı sil</b><span>Tüm ilerleme sıfırlanır</span></div>
        <button class="btn danger" id="reset-btn">Sıfırla</button></div>
    `);
    $('sound-btn').onclick = () => { this.g.toggleSound(); this.showSettings(); };
    $('time-btn').onclick = () => { this.g.world.advanceHours(2); this.toast('Saat 2 saat ileri alındı.'); this.showSettings(); };
    $('weather-btn').onclick = () => { this.g.world.setWeather(this.g.world.nextWeather()); this.showSettings(); };
    $('reset-btn').onclick = () => {
      if (confirm('Tüm ilerleme silinsin mi?')) this.g.resetProgress();
    };
  }

  // Yakalama sonucu: çantaya koy ya da bırak
  showCatch(info, canKeep, onDecide) {
    const badges = [
      info.legendary ? '<span class="badge legend">EFSANE</span>' : '',
      info.rare && !info.legendary ? '<span class="badge rare">NADİR</span>' : '',
      info.first ? '<span class="badge">İLK KEZ</span>' : '',
      info.record ? '<span class="badge gold">REKOR</span>' : '',
    ].join('');
    this.openModal('Yakalandı!', `
      <div class="catch">
        <div class="swatch big" style="background:${hex(info.color)}"></div>
        <h2>${info.name}</h2>
        <div class="badges">${badges}</div>
        <p class="big-num">${info.kg.toFixed(2)} kg</p>
        <p class="value">Değeri: <b>${info.price} ₺</b></p>
        <p class="desc">${info.desc}</p>
      </div>
      <div class="row">
        <button class="btn" id="release-btn">Suya bırak</button>
        <button class="btn primary" id="keep-btn" ${canKeep ? '' : 'disabled'}>${canKeep ? 'Çantaya koy' : 'Çanta dolu'}</button>
      </div>
    `, { closeable: false });
    const done = (keep) => { this.closeModal(); onDecide(keep); };
    $('release-btn').onclick = () => done(false);
    const keepBtn = $('keep-btn');
    if (canKeep) keepBtn.onclick = () => done(true);
  }
}
