import { LANGS, t, setLang, getLang } from './i18n.js';
import { runGame } from './games/core.js';
import basket from './games/basket.js';
import football from './games/football.js';
import baseball from './games/baseball.js';
import golf from './games/golf.js';
import bowling from './games/bowling.js';
import { MAX_TOTAL, ToolError, parseRanges, compressImages, mergePdfs, imagesToPdf, splitPdf, zipFiles, bundle } from './tools.js';

const SPORTS = { basket, football, baseball, golf, bowling };
const HOW = { basket: 'howBasket', football: 'howFootball', baseball: 'howBaseball', golf: 'howGolf', bowling: 'howBowling' };
const EMOJI = { basket: '🏀', football: '⚽', baseball: '⚾', golf: '⛳', bowling: '🎳' };
const IMG = ['image/jpeg', 'image/png', 'image/webp'];

// Each tool has its own sport. `accept` filters dropped files; `run` does the work.
const TOOLS = [
  { id: 'compress', sport: 'basket', accept: IMG, formats: 'JPG, PNG, WebP', min: 1, multiple: true,
    run: (files, o) => compressImages(files, { quality: o.quality / 100, maxSide: Number(o.maxSide) || Infinity }) },
  { id: 'merge', sport: 'football', accept: ['application/pdf'], formats: 'PDF', min: 2, multiple: true, reorder: true, run: (files) => mergePdfs(files) },
  { id: 'img2pdf', sport: 'baseball', accept: [...IMG, 'image/gif', 'image/bmp'], formats: 'JPG, PNG, WebP, GIF, BMP', min: 1, multiple: true, reorder: true,
    run: (files, o) => imagesToPdf(files, { pageSize: o.pageSize }) },
  { id: 'split', sport: 'golf', accept: ['application/pdf'], formats: 'PDF', min: 1, multiple: false, run: (files, o) => splitPdf(files, o) },
  { id: 'zip', sport: 'bowling', accept: null, min: 1, multiple: true, run: (files) => zipFiles(files) },
];
const byId = Object.fromEntries(TOOLS.map((x) => [x.id, x]));

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const fmtSize = (b) => {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toLocaleString(getLang(), { maximumFractionDigits: i ? 1 : 0 })} ${u[i]}`;
};
function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter((k) => k !== null && k !== undefined));
  return n;
}

/* ---------- state ---------- */
let tool = null;
let files = [];
let options = {};
let game = null;
let fails = 0;
let job = null; // processing promise, started when the game starts so the result is ready on score
let resultUrl = null;

/* ---------- i18n + theme ---------- */
function applyTexts() {
  root.lang = getLang();
  document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach((n) => { n.innerHTML = t(n.dataset.i18nHtml); }); // trusted strings from i18n.js
  document.querySelectorAll('[data-i18n-aria]').forEach((n) => n.setAttribute('aria-label', t(n.dataset.i18nAria)));
  renderHome();
  if (tool) { renderToolHead(); renderFiles(); renderOptions(); updatePlay(); renderGameHud(); }
}
const langSelect = $('lang-select');
langSelect.append(...Object.entries(LANGS).map(([v, label]) => el('option', { value: v, textContent: label })));
langSelect.addEventListener('change', () => { setLang(langSelect.value); store.set('fileshot-lang', langSelect.value); applyTexts(); });

$('theme-btn').addEventListener('click', () => {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  store.set('fileshot-theme', root.dataset.theme);
});

/* ---------- views (hash routing: #compress, #merge, …) ---------- */
function show(view) {
  for (const v of ['home', 'tool', 'game', 'result']) $(`view-${v}`).hidden = v !== view;
  window.scrollTo({ top: 0 });
}

function route() {
  stopGame();
  const id = location.hash.slice(1);
  if (byId[id]) {
    if (tool?.id !== id) { tool = byId[id]; files = []; options = defaults(tool); }
    renderToolHead(); renderFiles(); renderOptions(); updatePlay();
    show('tool');
    document.title = `${t(`${tool.id}T`)} · FileShot`;
  } else {
    tool = null;
    show('home');
    document.title = 'FileShot';
  }
}
window.addEventListener('hashchange', route);

function renderHome() {
  $('tool-grid').replaceChildren(...TOOLS.map((x) => el('a', { className: `tool-card s-${x.sport}`, href: `#${x.id}` },
    el('span', { className: 'tool-card-emoji', ariaHidden: 'true', textContent: EMOJI[x.sport] }),
    el('h2', { textContent: t(`${x.id}T`) }),
    el('p', { textContent: t(`${x.id}D`) }),
    el('span', { className: 'chip', textContent: t(x.sport) }))));
}

/* ---------- tool view ---------- */
function defaults(x) {
  return { compress: { quality: 70, maxSide: '' }, img2pdf: { pageSize: 'fit' }, split: { mode: 'all', ranges: '' } }[x.id] ?? {};
}

function renderToolHead() {
  $('tool-emoji').textContent = EMOJI[tool.sport];
  $('tool-title').textContent = t(`${tool.id}T`);
  $('tool-desc').textContent = t(`${tool.id}D`);
  $('tool-sport').textContent = t('sportLabel', { sport: `${EMOJI[tool.sport]} ${t(tool.sport)}` });
  const input = $('file-input');
  input.multiple = tool.multiple;
  input.accept = tool.accept ? tool.accept.join(',') : '';
  $('drop-formats').textContent = tool.accept ? t('formats', { f: tool.formats }) : t('anyFormat');
}

function notice(text) {
  const n = $('tool-notice');
  n.textContent = text ?? '';
  n.hidden = !text;
}

function addFiles(list) {
  const incoming = [...list];
  const ok = incoming.filter((f) => !tool.accept || tool.accept.includes(f.type) || (f.type === '' && /\.pdf$/i.test(f.name) && tool.accept.includes('application/pdf')));
  const rejected = incoming.filter((f) => !ok.includes(f));
  files = tool.multiple ? [...files, ...ok] : ok.slice(0, 1).concat(ok.length ? [] : files);
  notice(rejected.length ? rejected.map((f) => t('errType', { name: f.name })).join(' ') : null);
  if (files.reduce((s, f) => s + f.size, 0) > MAX_TOTAL) { files = files.slice(0, -ok.length); notice(t('errBig')); }
  renderFiles(); updatePlay();
}

function renderFiles() {
  const list = $('file-list');
  list.replaceChildren(...files.map((f, i) => {
    const btn = (label, text, fn, disabled = false) => el('button', { type: 'button', className: 'mini', ariaLabel: label, textContent: text, disabled, onclick: fn });
    const move = (d) => () => { const j = i + d; [files[i], files[j]] = [files[j], files[i]]; renderFiles(); list.children[j]?.querySelector(d < 0 ? '.mini' : '.mini:nth-of-type(2)')?.focus(); };
    return el('li', {},
      el('span', { className: 'file-ext', textContent: (f.name.split('.').pop() || '?').slice(0, 4).toUpperCase() }),
      el('span', { className: 'file-name', textContent: f.name, title: f.name }),
      el('span', { className: 'file-size', textContent: fmtSize(f.size) }),
      tool.reorder ? btn(t('up', { name: f.name }), '↑', move(-1), i === 0) : null,
      tool.reorder ? btn(t('down', { name: f.name }), '↓', move(1), i === files.length - 1) : null,
      btn(t('remove', { name: f.name }), '✕', () => { files.splice(i, 1); renderFiles(); updatePlay(); }));
  }));
}

function renderOptions() {
  const box = $('options');
  const field = (label, control) => el('label', { className: 'field' }, el('span', { textContent: label }), control);
  const select = (key, entries) => {
    const s = el('select', { onchange: () => { options[key] = s.value; renderOptions(); updatePlay(); } },
      ...entries.map(([v, label]) => el('option', { value: v, textContent: label, selected: options[key] === v })));
    return s;
  };
  const nodes = [];
  if (tool.id === 'compress') {
    const out = el('output', { textContent: `${options.quality} %` });
    const range = el('input', { type: 'range', min: 10, max: 95, step: 5, value: options.quality, oninput: () => { options.quality = Number(range.value); out.textContent = `${range.value} %`; } });
    nodes.push(el('label', { className: 'field' }, el('span', {}, t('quality'), ' ', out), range));
    nodes.push(field(t('maxSide'), select('maxSide', [['', t('original')], ['2560', '2560 px'], ['1920', '1920 px'], ['1280', '1280 px'], ['800', '800 px']])));
  } else if (tool.id === 'img2pdf') {
    nodes.push(field(t('pageSize'), select('pageSize', [['fit', t('fit')], ['a4', t('a4')]])));
  } else if (tool.id === 'split') {
    nodes.push(field(t('splitMode'), select('mode', [['all', t('splitAll')], ['range', t('splitRange')]])));
    if (options.mode === 'range') {
      const input = el('input', { type: 'text', value: options.ranges, placeholder: t('rangePh'), inputMode: 'numeric', oninput: () => { options.ranges = input.value; updatePlay(); } });
      nodes.push(field(t('rangeLabel'), input));
    }
  }
  box.replaceChildren(...nodes);
  box.hidden = !nodes.length;
}

function blocker() {
  if (files.length < tool.min) return tool.min > 1 ? t('needFiles', { n: tool.min }) : t('needFile');
  if (tool.id === 'split' && options.mode === 'range' && !parseRanges(options.ranges, Infinity)) return t('badRange');
  return null;
}
function updatePlay() {
  const why = blocker();
  $('play-btn').disabled = !!why;
  $('play-hint').textContent = why ?? '';
}

const drop = $('drop');
$('file-input').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); });
// Dropping a file anywhere else must not navigate away from the page.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

/* ---------- game ---------- */
function renderGameHud() {
  if (!tool) return;
  $('game-sport').textContent = `${EMOJI[tool.sport]} ${t(tool.sport)}`;
  $('game-how').textContent = t(HOW[tool.sport]);
}

function setFails(n) {
  fails = n;
  [...$('pips').children].forEach((p, i) => p.classList.toggle('on', i < n));
  if (n >= 3) revealSkip();
}
function revealSkip() {
  const b = $('skip-btn');
  if (!b.hidden) return;
  b.hidden = false;
  requestAnimationFrame(() => b.classList.add('show'));
}

$('play-btn').addEventListener('click', () => {
  if (blocker()) return;
  const snapshot = [...files];
  job = tool.run(snapshot, { ...options }).then(
    async (outs) => ({ outs, file: await bundle(outs, `fileshot-${tool.id}.zip`) }),
    (err) => ({ err }));
  setFails(0);
  const skip = $('skip-btn');
  skip.hidden = true; skip.classList.remove('show');
  renderGameHud();
  show('game');
  const exts = [...new Set(snapshot.map((f) => (f.name.includes('.') ? f.name.split('.').pop() : '').toUpperCase().slice(0, 4)))];
  const ext = snapshot.length > 1 ? `${snapshot.length} ${exts.length === 1 && exts[0] ? exts[0] : '📄'}` : exts[0] || '📄';
  game = runGame($('game-canvas'), SPORTS[tool.sport], {
    label: ext,
    texts: t,
    onMiss: () => setFails(fails + 1),
    onScore: finish,
  });
  $('game-canvas').focus({ preventScroll: true });
});

// Keyboard-only users cannot drag: tabbing inside the game reveals the skip button straight away.
$('view-game').addEventListener('keydown', (e) => { if (e.key === 'Tab') revealSkip(); });

// The skip button leans towards the cursor (magnetic) and its glow follows it.
const skipBtn = $('skip-btn');
skipBtn.addEventListener('pointermove', (e) => {
  const r = skipBtn.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  skipBtn.style.setProperty('--mx', `${x * 10}px`);
  skipBtn.style.setProperty('--my', `${y * 8}px`);
  skipBtn.style.setProperty('--gx', `${(x + 0.5) * 100}%`);
});
skipBtn.addEventListener('pointerleave', () => { skipBtn.style.setProperty('--mx', '0px'); skipBtn.style.setProperty('--my', '0px'); });
skipBtn.addEventListener('click', finish);
$('cancel-btn').addEventListener('click', () => { stopGame(); job = null; show('tool'); });

function stopGame() {
  game?.destroy();
  game = null;
}

/* ---------- result ---------- */
async function finish() {
  if (!job) return;
  stopGame();
  show('result');
  const title = $('result-title');
  $('spinner').hidden = false;
  title.textContent = t('processing');
  $('result-text').textContent = '';
  $('savings').replaceChildren();
  $('download-btn').hidden = true;
  const { outs, file, err } = await job;
  job = null;
  $('spinner').hidden = true;
  if (err) {
    title.textContent = t('errT');
    $('result-text').textContent = err instanceof ToolError ? t(err.key, err.params) : t('errGeneric');
    if (!(err instanceof ToolError)) console.error(err);
    title.focus();
    return;
  }
  title.textContent = t('doneT');
  const total = outs.reduce((s, o) => s + o.blob.size, 0);
  $('result-text').textContent = outs.length > 1 ? t('outSize', { n: outs.length, size: fmtSize(total) }) : t('oneOut', { size: fmtSize(file.blob.size) });
  // Per-file savings for compression.
  $('savings').replaceChildren(...outs.filter((o) => o.before).map((o) => el('li', {},
    el('span', { className: 'file-name', textContent: o.name }),
    el('span', { textContent: o.kept ? t('kept') : t('saved', { before: fmtSize(o.before), after: fmtSize(o.blob.size), pct: `${Math.round((1 - o.blob.size / o.before) * 100)} %` }) }))));
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = URL.createObjectURL(file.blob);
  const dl = $('download-btn');
  dl.href = resultUrl;
  dl.download = file.name;
  dl.textContent = `⬇ ${t('download', { name: file.name })}`;
  dl.hidden = false;
  dl.focus();
}
$('again-btn').addEventListener('click', () => { files = []; renderFiles(); updatePlay(); notice(null); show('tool'); });

/* ---------- init ---------- */
const saved = store.get('fileshot-lang') || navigator.language.slice(0, 2);
setLang(LANGS[saved] ? saved : 'en');
langSelect.value = getLang();
applyTexts();
route();
