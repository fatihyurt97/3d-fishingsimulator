// Dokunmatik (iPad/iPhone), fare ve klavye için tek giriş katmanı.
// Oyun şu bilgilere bakar: eylem basılı mı, yön butonları basılı mı, nerede basıldı.

export function createInput(canvas) {
  const state = {
    held: false,           // eylem basılı mı (makara / vuruş / şarj)
    pointerId: null,
    x0: 0, y0: 0,          // canvas üzerinde basış noktası
    x: 0, y: 0,
    downAt: 0,
    keyHeld: false,        // Boşluk veya ekran eylem butonu
    aimKey: 0,             // ok tuşları: -1 sol, +1 sağ
    btnAim: 0,             // sağ joystick yatay ekseni: -1..1 (nişan)
    stickMove: { x: 0, y: 0 }, // sol joystick: x sağ(+)/sol(-), y aşağı(+)=geri
    kb: { left: false, right: false, fwd: false, back: false },   // WASD
    btn: { left: false, right: false, fwd: false, back: false, aimL: false, aimR: false }, // ekran butonları
    handlers: { down() {}, up() {}, key() {} },
  };

  const syncHeld = () => { state.held = state.pointerId !== null || state.keyHeld; };

  canvas.addEventListener('pointerdown', (e) => {
    if (state.pointerId !== null) return;
    state.pointerId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* eski tarayıcı */ }
    state.x0 = state.x = e.clientX;
    state.y0 = state.y = e.clientY;
    state.downAt = performance.now();
    syncHeld();
    state.handlers.down(state);
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== state.pointerId) return;
    state.x = e.clientX;
    state.y = e.clientY;
  });

  const end = (e) => {
    if (e.pointerId !== state.pointerId) return;
    state.x = e.clientX;
    state.y = e.clientY;
    state.pointerId = null;
    syncHeld();
    state.handlers.up(state);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // Klavye: Boşluk = eylem (basılı tut). Ok tuşları = nişan. WASD = yürüme.
  const moveMap = { KeyA: 'left', KeyD: 'right', KeyW: 'fwd', KeyS: 'back' };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!state.keyHeld && !e.repeat) {
        state.keyHeld = true;
        syncHeld();
        state.handlers.down(state, 'key');
      }
    } else if (e.code === 'ArrowLeft') { state.aimKey = -1; }
    else if (e.code === 'ArrowRight') { state.aimKey = 1; }
    else if (moveMap[e.code]) { state.kb[moveMap[e.code]] = true; }
    else if (e.code === 'Escape') { state.handlers.key('escape'); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      state.keyHeld = false;
      syncHeld();
      state.handlers.up(state, 'key');
    } else if (e.code === 'ArrowLeft' && state.aimKey === -1) { state.aimKey = 0; }
    else if (e.code === 'ArrowRight' && state.aimKey === 1) { state.aimKey = 0; }
    else if (moveMap[e.code]) { state.kb[moveMap[e.code]] = false; }
  });

  // Sekme arka plana geçince tuşlar takılı kalmasın
  window.addEventListener('blur', () => {
    state.pointerId = null;
    state.keyHeld = false;
    syncHeld();
    state.aimKey = 0;
    for (const k of Object.keys(state.kb)) state.kb[k] = false;
    for (const k of Object.keys(state.btn)) state.btn[k] = false;
    state.handlers.up(state, 'blur');
  });

  return {
    state,
    on(handlers) { Object.assign(state.handlers, handlers); },

    // Ekran eylem butonu: klavyedeki Boşluk ile aynı davranır
    pressAction(on) {
      if (on && !state.keyHeld) {
        state.keyHeld = true;
        syncHeld();
        state.handlers.down(state, 'key');
      } else if (!on && state.keyHeld) {
        state.keyHeld = false;
        syncHeld();
        state.handlers.up(state, 'key');
      }
    },
  };
}

// Analog joystick (DualSense benzeri). Taban elemanı içinde bir "knob" hareket eder.
// onChange(x, y): x,y ∈ [-1, 1]. y pozitif = aşağı (ekranda).
export function bindStick(el, onChange) {
  const knob = el.querySelector('.stick-knob');
  let activeId = null;
  let cx = 0, cy = 0, R = 60;
  const DEAD = 0.14;

  const show = (x, y) => {
    knob.style.transform = `translate(calc(-50% + ${(x * R).toFixed(1)}px), calc(-50% + ${(y * R).toFixed(1)}px))`;
  };
  const measure = () => {
    const r = el.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    R = r.width / 2 - 34;
  };
  const update = (e) => {
    let x = (e.clientX - cx) / R;
    let y = (e.clientY - cy) / R;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    if (len < DEAD) { x = 0; y = 0; }
    show(x, y);
    onChange(x, y);
  };
  const press = (e) => {
    if (activeId !== null) return;
    activeId = e.pointerId;
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* yoksay */ }
    measure();
    el.classList.add('on');
    update(e);
    e.preventDefault();
  };
  const move = (e) => { if (e.pointerId === activeId) update(e); };
  const release = (e) => {
    if (activeId === null || (e && e.pointerId !== activeId)) return;
    activeId = null;
    el.classList.remove('on');
    show(0, 0);
    onChange(0, 0);
  };
  el.addEventListener('pointerdown', press);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Basılı tutulan ekran butonu: parmak basınca on(true), kalkınca on(false).
// Parmak buton dışına kaysa bile pointer capture sayesinde doğru bırakılır.
export function bindHold(el, onChange) {
  let activeId = null;
  const press = (e) => {
    if (activeId !== null) return;
    activeId = e.pointerId;
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* yoksay */ }
    el.classList.add('on');
    onChange(true);
    e.preventDefault();
  };
  const release = (e) => {
    if (activeId === null || (e && e.pointerId !== activeId)) return;
    activeId = null;
    el.classList.remove('on');
    onChange(false);
  };
  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
