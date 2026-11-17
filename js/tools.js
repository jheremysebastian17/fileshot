// File processing. Everything runs locally in the browser: nothing is uploaded.
// pdf-lib is loaded as a classic script (global PDFLib); fflate is an ES module.
import { zipSync } from '../vendor/fflate.js';

export const MAX_TOTAL = 500 * 1024 * 1024; // above this, browsers tend to run out of memory

export class ToolError extends Error {
  constructor(key, params = {}) { super(key); this.key = key; this.params = params; }
}

const bytes = async (file) => new Uint8Array(await file.arrayBuffer());
const baseName = (name) => name.replace(/\.[^.]+$/, '');
const pdfBlob = (data) => new Blob([data], { type: 'application/pdf' });

async function loadPdf(file) {
  try {
    return await PDFLib.PDFDocument.load(await bytes(file));
  } catch {
    throw new ToolError('errPdf', { name: file.name }); // encrypted or damaged
  }
}

/** "1-3, 5" -> [0,1,2,4] (0-based, in the given order, no duplicates). Returns null if the syntax is invalid
 *  or a page is outside 1..max (pass max = Infinity to check only the syntax). */
export function parseRanges(text, max) {
  const out = [];
  const parts = String(text).split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  for (const part of parts) {
    const m = part.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (a < 1 || b < a || b > max) return null;
    for (let p = a; p <= b; p++) if (!out.includes(p - 1)) out.push(p - 1);
  }
  return out;
}

/* ---------- PDF ---------- */
export async function mergePdfs(files) {
  const out = await PDFLib.PDFDocument.create();
  for (const f of files) {
    const doc = await loadPdf(f);
    const pages = await out.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return [{ name: 'fileshot-merged.pdf', blob: pdfBlob(await out.save()) }];
}

export async function splitPdf([file], { mode, ranges }) {
  const doc = await loadPdf(file);
  const n = doc.getPageCount();
  const base = baseName(file.name);
  const extract = async (indices) => {
    const out = await PDFLib.PDFDocument.create();
    (await out.copyPages(doc, indices)).forEach((p) => out.addPage(p));
    return out.save();
  };
  if (mode === 'range') {
    const idx = parseRanges(ranges, n);
    if (!idx) throw new ToolError('errRange', { n });
    return [{ name: `${base}-pages.pdf`, blob: pdfBlob(await extract(idx)) }];
  }
  const entries = {};
  const width = String(n).length;
  for (let i = 0; i < n; i++) entries[`${base}-${String(i + 1).padStart(width, '0')}.pdf`] = await extract([i]);
  return [{ name: `${base}-split.zip`, blob: new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' }) }]; // PDFs are already compressed
}

/* ---------- Images (browser only: canvas) ---------- */
async function decode(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new ToolError('errImg', { name: file.name });
  }
}

function toCanvas(bitmap, maxSide = Infinity) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bitmap.width * scale));
  c.height = Math.max(1, Math.round(bitmap.height * scale));
  c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
  return c;
}
const canvasBlob = (c, type, quality) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), type, quality));

export async function compressImages(files, { quality = 0.7, maxSide = Infinity }) {
  const out = [];
  for (const f of files) {
    const bmp = await decode(f);
    // JPEG has no transparency, so PNG/WebP sources become WebP (keeps alpha, much smaller than PNG).
    const type = f.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    const blob = await canvasBlob(toCanvas(bmp, maxSide), type, quality);
    bmp.close();
    const ext = type === 'image/jpeg' ? 'jpg' : 'webp';
    // Never hand back a bigger file than the user gave us.
    out.push(blob.size < f.size
      ? { name: `${baseName(f.name)}-min.${ext}`, blob, before: f.size }
      : { name: f.name, blob: f, before: f.size, kept: true });
  }
  return out;
}

const A4 = [595.28, 841.89];
export async function imagesToPdf(files, { pageSize = 'fit' }) {
  const doc = await PDFLib.PDFDocument.create();
  for (const f of files) {
    let img;
    if (f.type === 'image/jpeg' || f.type === 'image/png') {
      try {
        const data = await bytes(f);
        img = f.type === 'image/jpeg' ? await doc.embedJpg(data) : await doc.embedPng(data);
      } catch { img = null; } // e.g. CMYK JPEG: fall back to re-encoding through canvas
    }
    if (!img) {
      const bmp = await decode(f);
      img = await doc.embedJpg(await (await canvasBlob(toCanvas(bmp), 'image/jpeg', 0.92)).arrayBuffer());
      bmp.close();
    }
    if (pageSize === 'a4') {
      const [pw, ph] = img.width > img.height ? [A4[1], A4[0]] : A4; // landscape photos get a landscape page
      const margin = 24;
      const s = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height, 1);
      const w = img.width * s;
      const h = img.height * s;
      doc.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    } else {
      doc.addPage([img.width, img.height]).drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
  }
  return [{ name: files.length === 1 ? `${baseName(files[0].name)}.pdf` : 'fileshot-images.pdf', blob: pdfBlob(await doc.save()) }];
}

/* ---------- ZIP ---------- */
export async function zipFiles(files) {
  const entries = {};
  for (const f of files) {
    let name = f.name;
    for (let i = 2; name in entries; i++) name = `${baseName(f.name)} (${i})${f.name.slice(baseName(f.name).length)}`;
    entries[name] = [await bytes(f), { level: 6 }];
  }
  return [{ name: 'fileshot.zip', blob: new Blob([zipSync(entries)], { type: 'application/zip' }) }];
}

/** Several outputs (e.g. many compressed images) are delivered as one ZIP. */
export async function bundle(outputs, zipName) {
  if (outputs.length === 1) return outputs[0];
  const entries = {};
  for (const o of outputs) entries[o.name] = [new Uint8Array(await o.blob.arrayBuffer()), { level: 0 }];
  return { name: zipName, blob: new Blob([zipSync(entries)], { type: 'application/zip' }) };
}
