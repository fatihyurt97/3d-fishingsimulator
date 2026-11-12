// Dokunmatik (iPad/iPhone), fare (Mac) ve klavye için tek giriş katmanı.
// Oyun sadece şu olaylara bakar: basılı mı, nerede, ne zaman bırakıldı.

export function createInput(canvas) {
  const state = {
    held: false,           // basılı tutuluyor mu (makara / vuruş / şarj)
    pointerId: null,
    x0: 0, y0: 0,          // basış noktası
    x: 0, y: 0,            // şu anki nokta
    downAt: 0,
    keyHeld: false,
    keyDownAt: 0,
    aimKey: 0,             // -1 sol, +1 sağ (ok tuşları)
    handlers: { down() {}, up() {}, move() {}, key() {} },
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (state.pointerId !== null) return;
    state.pointerId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* eski tarayıcı */ }
    state.x0 = state.x = e.clientX;
    state.y0 = state.y = e.clientY;
    state.downAt = performance.now();
    state.held = true;
    state.handlers.down(state);
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== state.pointerId) return;
    state.x = e.clientX;
    state.y = e.clientY;
    state.handlers.move(state);
  });

  const end = (e) => {
    if (e.pointerId !== state.pointerId) return;
    state.x = e.clientX;
    state.y = e.clientY;
    state.pointerId = null;
    state.held = false;
    state.handlers.up(state);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // Klavye: Boşluk = basılı tut (şarj / makara / vuruş). Ok tuşları = nişan.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!state.keyHeld && !e.repeat) {
        state.keyHeld = true;
        state.keyDownAt = performance.now();
        state.held = true;
        state.handlers.down(state, 'key');
      }
    } else if (e.code === 'ArrowLeft') { state.aimKey = -1; }
    else if (e.code === 'ArrowRight') { state.aimKey = 1; }
    else if (e.code === 'Escape') { state.handlers.key('escape'); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      state.keyHeld = false;
      state.held = state.pointerId !== null;
      state.handlers.up(state, 'key');
    } else if (e.code === 'ArrowLeft' && state.aimKey === -1) { state.aimKey = 0; }
    else if (e.code === 'ArrowRight' && state.aimKey === 1) { state.aimKey = 0; }
  });

  // Sekme arka plana geçince takılı kalmasın
  window.addEventListener('blur', () => {
    state.pointerId = null; state.keyHeld = false; state.held = false; state.aimKey = 0;
    state.handlers.up(state, 'blur');
  });

  return {
    state,
    on(handlers) { Object.assign(state.handlers, handlers); },
  };
}
