// Shared mini-game runtime: Matter.js physics (global Matter), a fixed 900x500 world scaled to the canvas,
// slingshot aiming, confetti, banners and score/miss handling. Each sport only describes its world.
const { Engine, Body, Composite, Events } = Matter;

export const W = 900;
export const H = 500;
const STEP = 1000 / 60;

export function readTheme(el = document.documentElement) {
  const s = getComputedStyle(el);
  const v = (n) => s.getPropertyValue(n).trim();
  return { bg: v('--field'), bg2: v('--field-2'), line: v('--line'), text: v('--text'), muted: v('--muted'), accent: v('--accent'), accent2: v('--accent-2'), panel: v('--panel') };
}

/**
 * runGame(canvas, sport, { label, onScore, onMiss, texts }) -> { destroy }
 * sport.create(api) returns { reset(), update(), draw(g), judge?(), pointerdown?(p), pointerup?(p), key?(e) }.
 * texts(key, params) returns translated banner texts.
 */
export function runGame(canvas, sport, opts) {
  const g = canvas.getContext('2d');
  const engine = Engine.create();
  engine.gravity.y = sport.gravity ?? 1;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let theme = readTheme();
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let frame = 0;
  let destroyed = false;
  const particles = [];
  let banner = null; // { text, color, t }
  let phase = 'aim'; // aim | flying | result | done
  let flyFrames = 0;
  let slowFrames = 0;
  let sling = null; // { body, anchor, maxPull, power, drag: {start, cur} | null }

  const api = {
    Matter, engine, world: engine.world, W, H, opts, reduced,
    get theme() { return theme; },
    get phase() { return phase; },
    get frame() { return frame; },
    add: (...bodies) => Composite.add(engine.world, bodies),
    remove: (...bodies) => Composite.remove(engine.world, bodies),
    /** Make `body` aimable: drag anywhere, pull back, release to shoot. */
    useSling(body, anchor, { maxPull = 160, power = 0.16 } = {}) {
      sling = { body, anchor, maxPull, power, drag: null };
      Body.setStatic(body, true);
      Body.setPosition(body, anchor);
      Body.setAngle(body, 0);
    },
    startFlight() { phase = 'flying'; flyFrames = 0; slowFrames = 0; },
    score(textKey, params) {
      if (phase === 'result' || phase === 'done') return;
      phase = 'done';
      banner = { text: opts.texts(textKey, params), color: theme.accent, t: 0 };
      burst(api.focus ?? { x: W / 2, y: H / 2 }, 120);
      setTimeout(() => !destroyed && opts.onScore(), 1300);
    },
    miss(textKey = 'missGeneric', params) {
      if (phase === 'result' || phase === 'done') return;
      phase = 'result';
      banner = { text: opts.texts(textKey, params), color: theme.accent2, t: 0 };
      opts.onMiss();
      setTimeout(() => { if (destroyed || phase === 'done') return; game.reset(); phase = 'aim'; banner = null; }, 1300);
    },
    /** Default miss rules for thrown balls: left the screen, stopped moving, or took too long. */
    defaultJudge(ball, { maxSeconds = 7 } = {}) {
      const p = ball.position;
      if (p.x < -60 || p.x > W + 60 || p.y > H + 60) return api.miss();
      slowFrames = ball.speed < 0.18 ? slowFrames + 1 : 0;
      if (slowFrames > 40 || flyFrames > maxSeconds * 60) api.miss();
    },
    get flyFrames() { return flyFrames; },
  };

  const game = sport.create(api);
  game.reset();

  /* ---------- input ---------- */
  const toWorld = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const pullVector = () => {
    const d = { x: sling.drag.cur.x - sling.drag.start.x, y: sling.drag.cur.y - sling.drag.start.y };
    const len = Math.hypot(d.x, d.y);
    const k = len > sling.maxPull ? sling.maxPull / len : 1;
    return { x: d.x * k, y: d.y * k, len: Math.min(len, sling.maxPull) };
  };
  function down(e) {
    if (phase !== 'aim') return;
    if (game.pointerdown) { game.pointerdown(toWorld(e)); return; }
    if (!sling) return;
    canvas.setPointerCapture?.(e.pointerId);
    const p = toWorld(e);
    sling.drag = { start: p, cur: p };
  }
  function move(e) {
    if (!sling?.drag || phase !== 'aim') return;
    sling.drag.cur = toWorld(e);
    const v = pullVector();
    Body.setPosition(sling.body, { x: sling.anchor.x + v.x * 0.35, y: sling.anchor.y + v.y * 0.35 });
  }
  function up() {
    if (!sling?.drag || phase !== 'aim') return;
    const v = pullVector();
    sling.drag = null;
    if (v.len < 12) { Body.setPosition(sling.body, sling.anchor); return; } // a tap, not a throw
    Body.setStatic(sling.body, false);
    Body.setVelocity(sling.body, { x: -v.x * sling.power, y: -v.y * sling.power });
    Body.setAngularVelocity(sling.body, -v.x * 0.0012);
    api.startFlight();
    game.onShot?.();
  }
  const key = (e) => game.key?.(e);
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  window.addEventListener('keydown', key);

  /* ---------- sizing ---------- */
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  /* ---------- effects ---------- */
  function burst(at, n) {
    const colors = [theme.accent, theme.accent2, '#ffffff', '#38bdf8', '#f472b6'];
    for (let i = 0; i < (reduced ? n / 4 : n); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 7;
      particles.push({ x: at.x, y: at.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, life: 90 + Math.random() * 40, c: colors[i % colors.length] });
    }
  }

  function drawAim() {
    if (!sling?.drag || phase !== 'aim') return;
    const v = pullVector();
    if (v.len < 12) return;
    // Dotted preview of the first part of the trajectory (Matter integrates per 1/60 s step).
    const gStep = engine.gravity.y * engine.gravity.scale * STEP * STEP;
    const fa = sling.body.frictionAir;
    let x = sling.body.position.x;
    let y = sling.body.position.y;
    let vx = -v.x * sling.power;
    let vy = -v.y * sling.power;
    g.fillStyle = theme.text;
    for (let i = 1; i <= 33; i++) {
      vx *= 1 - fa; vy = vy * (1 - fa) + gStep;
      x += vx; y += vy;
      if (i % 3 === 0) { g.globalAlpha = 0.75 * (1 - i / 36); g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill(); }
    }
    g.globalAlpha = 1;
    // Rubber band from the anchor to the ball.
    g.strokeStyle = theme.accent; g.lineWidth = 3; g.setLineDash([6, 6]);
    g.beginPath(); g.moveTo(sling.anchor.x, sling.anchor.y); g.lineTo(sling.body.position.x, sling.body.position.y); g.stroke();
    g.setLineDash([]);
  }

  function drawOverlay() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 0.18; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = Math.min(1, p.life / 30);
      g.fillStyle = p.c; g.fillRect(-4, -2.5, 8, 5); g.restore();
    }
    if (banner) {
      banner.t++;
      const s = reduced ? 1 : Math.min(1, banner.t / 10) * (1 + 0.08 * Math.max(0, 1 - banner.t / 18));
      g.save(); g.translate(W / 2, H * 0.32); g.scale(s, s);
      g.font = '800 64px "Barlow Condensed", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,.55)'; g.strokeText(banner.text, 0, 0);
      g.fillStyle = banner.color; g.fillText(banner.text, 0, 0);
      g.restore();
    }
  }

  /* ---------- loop ---------- */
  function tick(now) {
    if (destroyed) return;
    acc = Math.min(acc + (now - last), 100); // after a background tab, do not fast-forward seconds of physics
    last = now;
    while (acc >= STEP) {
      acc -= STEP;
      frame++;
      if (frame % 60 === 0) theme = readTheme();
      game.update();
      Engine.update(engine, STEP);
      if (phase === 'flying') { flyFrames++; game.judge ? game.judge() : null; }
    }
    const k = canvas.width / W;
    g.setTransform(k, 0, 0, canvas.height / H, 0, 0);
    game.draw(g);
    drawAim();
    drawOverlay();
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key);
      Events.off(engine);
      Composite.clear(engine.world, false);
      Engine.clear(engine);
    },
  };
}

/* ---------- drawing helpers shared by the sports ---------- */
export function fileTag(g, api, x, y) {
  const text = api.opts.label;
  if (!text) return;
  g.font = '700 13px system-ui, sans-serif';
  const w = g.measureText(text).width + 14;
  g.fillStyle = api.theme.accent;
  g.beginPath(); g.roundRect(x - w / 2, y - 34, w, 20, 6); g.fill();
  g.beginPath(); g.moveTo(x - 5, y - 15); g.lineTo(x + 5, y - 15); g.lineTo(x, y - 9); g.fill();
  g.fillStyle = '#0b1120'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y - 24);
}

export function shadow(g, x, groundY, r, height) {
  const k = Math.max(0.25, 1 - height / 300);
  g.fillStyle = 'rgba(0,0,0,.25)';
  g.beginPath(); g.ellipse(x, groundY, r * 1.1 * k, r * 0.3 * k, 0, 0, 7); g.fill();
}

export function sky(g, api, groundY) {
  const t = api.theme;
  const grad = g.createLinearGradient(0, 0, 0, groundY);
  grad.addColorStop(0, t.bg); grad.addColorStop(1, t.bg2);
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
}
