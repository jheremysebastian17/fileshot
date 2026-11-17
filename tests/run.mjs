// Node tests: tool logic (PDF/ZIP), translations, and headless physics checks that every sport is winnable.
// Run: node tests/run.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
globalThis.PDFLib = require('../vendor/pdf-lib.min.js');
globalThis.Matter = require('../vendor/matter.min.js');
const { unzipSync } = await import('../vendor/fflate.js');
const tools = await import('../js/tools.js');
const { allKeys } = await import('../js/i18n.js');

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}

// A tiny File stand-in (Node 20+ has File, but keep it explicit).
const file = (name, data, type) => new File([data], name, { type });
async function makePdf(pages) {
  const doc = await PDFLib.PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200 + i, 200]);
  return doc.save();
}
const pagesOf = async (blob) => (await PDFLib.PDFDocument.load(new Uint8Array(await blob.arrayBuffer()))).getPageCount();

await test('parseRanges', () => {
  assert.deepEqual(tools.parseRanges('1-3, 5', 10), [0, 1, 2, 4]);
  assert.deepEqual(tools.parseRanges('3,1,3', 5), [2, 0]);
  assert.equal(tools.parseRanges('0', 5), null);
  assert.equal(tools.parseRanges('4-2', 5), null);
  assert.equal(tools.parseRanges('6', 5), null);
  assert.equal(tools.parseRanges('a', Infinity), null);
  assert.equal(tools.parseRanges('', Infinity), null);
});

await test('mergePdfs keeps every page in order', async () => {
  const [out] = await tools.mergePdfs([file('a.pdf', await makePdf(2), 'application/pdf'), file('b.pdf', await makePdf(3), 'application/pdf')]);
  const doc = await PDFLib.PDFDocument.load(new Uint8Array(await out.blob.arrayBuffer()));
  assert.equal(doc.getPageCount(), 5);
  assert.deepEqual(doc.getPages().map((p) => p.getWidth()), [200, 201, 200, 201, 202]);
});

await test('mergePdfs reports a damaged PDF by name', async () => {
  await assert.rejects(tools.mergePdfs([file('bad.pdf', 'not a pdf', 'application/pdf')]), (e) => e.key === 'errPdf' && e.params.name === 'bad.pdf');
});

await test('splitPdf: all pages -> ZIP with one PDF per page', async () => {
  const [out] = await tools.splitPdf([file('doc.pdf', await makePdf(3), 'application/pdf')], { mode: 'all' });
  const entries = unzipSync(new Uint8Array(await out.blob.arrayBuffer()));
  assert.deepEqual(Object.keys(entries), ['doc-1.pdf', 'doc-2.pdf', 'doc-3.pdf']);
});

await test('splitPdf: range extracts the right pages, rejects missing pages', async () => {
  const src = file('doc.pdf', await makePdf(5), 'application/pdf');
  const [out] = await tools.splitPdf([src], { mode: 'range', ranges: '2-3,5' });
  assert.equal(await pagesOf(out.blob), 3);
  await assert.rejects(tools.splitPdf([src], { mode: 'range', ranges: '9' }), (e) => e.key === 'errRange' && e.params.n === 5);
});

await test('zipFiles round-trips and de-duplicates names', async () => {
  const [out] = await tools.zipFiles([file('a.txt', 'hello', 'text/plain'), file('a.txt', 'world', 'text/plain')]);
  const entries = unzipSync(new Uint8Array(await out.blob.arrayBuffer()));
  assert.deepEqual(Object.keys(entries), ['a.txt', 'a (2).txt']);
  assert.equal(new TextDecoder().decode(entries['a (2).txt']), 'world');
});

await test('translations: every language has the same keys', () => {
  const keys = allKeys();
  for (const [l, k] of Object.entries(keys)) assert.deepEqual(k.slice().sort(), keys.es.slice().sort(), `language ${l}`);
});

/* ---------- physics: each sport must be winnable, but not trivially ---------- */
const { Engine, Body, Composite } = Matter;
function harness(sport) {
  const engine = Engine.create();
  engine.gravity.y = sport.gravity ?? 1;
  let result = null;
  let phase = 'aim';
  let fly = 0; let slow = 0;
  let sling;
  const api = {
    Matter, engine, world: engine.world, W: 900, H: 500, opts: { label: '', texts: (k) => k }, reduced: true,
    theme: {}, get phase() { return phase; }, get frame() { return 0; }, get flyFrames() { return fly; },
    add: (...b) => Composite.add(engine.world, b), remove: (...b) => Composite.remove(engine.world, b),
    useSling(body, anchor, o) { sling = { body, anchor, ...o }; Body.setStatic(body, true); Body.setPosition(body, anchor); },
    startFlight() { phase = 'flying'; fly = 0; slow = 0; },
    score() { if (!result) { result = 'score'; phase = 'done'; } },
    miss() { if (!result) { result = 'miss'; phase = 'result'; } },
    defaultJudge(ball, { maxSeconds = 7 } = {}) {
      const p = ball.position;
      if (p.x < -60 || p.x > 960 || p.y > 560) return api.miss();
      slow = ball.speed < 0.18 ? slow + 1 : 0;
      if (slow > 40 || fly > maxSeconds * 60) api.miss();
    },
  };
  const game = sport.create(api);
  return {
    api, game,
    shoot(pullX, pullY) {
      result = null; phase = 'aim'; game.reset();
      // Same as the real game: the ball leaves from where it was pulled to (35 % of the drag).
      Body.setPosition(sling.body, { x: sling.anchor.x + pullX * 0.35, y: sling.anchor.y + pullY * 0.35 });
      Body.setStatic(sling.body, false);
      Body.setVelocity(sling.body, { x: -pullX * sling.power, y: -pullY * sling.power });
      api.startFlight();
      for (let i = 0; i < 900 && !result; i++) { game.update(); Engine.update(engine, 1000 / 60); fly++; game.judge(); }
      return result;
    },
    get sling() { return sling; },
  };
}

async function winRate(name, opts = {}) {
  const sport = (await import(`../js/games/${name}.js`)).default;
  const h = harness(sport);
  h.game.reset();
  const max = h.sling.maxPull;
  let wins = 0; let total = 0;
  for (let a = 0; a < 360; a += opts.step ?? 6) {
    for (let len = max * 0.2; len <= max; len += max / 12) {
      const r = (a * Math.PI) / 180;
      total++;
      if (h.shoot(Math.cos(r) * len, Math.sin(r) * len) === 'score') wins++;
    }
  }
  return { wins, total, pct: (100 * wins) / total };
}

for (const name of ['basket', 'football', 'golf', 'bowling']) {
  await test(`${name}: winnable but not trivial`, async () => {
    const { wins, total, pct } = await winRate(name);
    console.log(`     ${wins}/${total} random aims score (${pct.toFixed(1)} %)`);
    assert.ok(wins >= 3, 'at least a few aims must score');
    assert.ok(pct < 25, 'random aiming should mostly miss');
  });
}

await test('baseball: perfect timing is a home run, late swing or no swing is a miss', async () => {
  const sport = (await import('../js/games/baseball.js')).default;
  // The wind-up is random, so sweep the swing over every frame: only a narrow window may connect.
  let homeRuns = 0; let misses = 0;
  for (let f = 40; f < 260; f += 1) {
    const h = harness(sport);
    h.game.reset();
    let result = null;
    const api = h.api;
    const o = { score: api.score, miss: api.miss };
    api.score = () => { result ??= 'score'; o.score(); };
    api.miss = () => { result ??= 'miss'; o.miss(); };
    for (let i = 0; i < 1200 && !result; i++) {
      if (i === f) h.game.pointerdown({ x: 0, y: 0 });
      h.game.update();
      Engine.update(api.engine, 1000 / 60);
      if (api.phase === 'flying') h.game.judge();
    }
    if (result === 'score') homeRuns++; else misses++;
  }
  console.log(`     swing frame sweep: ${homeRuns} home runs, ${misses} misses`);
  assert.ok(homeRuns >= 1, 'some swing timing must give a home run');
  assert.ok(misses > homeRuns * 3, 'most timings must miss');
  // Never swinging is always a strike.
  const h = harness(sport); h.game.reset();
  let r = null; const o = h.api.miss; h.api.miss = (k) => { r ??= k; o(k); };
  for (let i = 0; i < 400 && !r; i++) { h.game.update(); Engine.update(h.api.engine, 1000 / 60); }
  assert.equal(r, 'missStrike');
});

console.log(failed ? `\n${failed} test(s) failed` : '\nall tests passed');
process.exit(failed ? 1 : 0);
