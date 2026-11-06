// General text OCR with PaddleOCR PP-OCRv4 (ONNX models from RapidOCR), run with onnxruntime-node.
// Much more robust than Tesseract on photos / glowing dashboards / stickers. Fully offline.
//
// Pipeline: detect text regions (DB model) -> for each region fit a rotated rectangle, cut it out
// straightened -> recognise it (CRNN/CTC model) -> return lines sorted top-to-bottom.
const path = require('path');
const fs = require('fs');
const ort = require('onnxruntime-node');

// in a packaged build the models live outside app.asar (native code can't read inside it)
const DIR = path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'models', 'paddle');
const DET_LIMIT_MIN = 736;   // short side is scaled up to at least this for detection
const DET_MAX_SIDE = 2000;   // ...and the long side capped to this
const DET_THRESH = 0.3;      // pixel probability to count as text
const BOX_THRESH = 0.5;      // average probability for a region to be kept
const UNCLIP = 1.6;          // how much to grow each region (PaddleOCR default)
const REC_H = 48;            // recogniser input height
const REC_MIN_W = 320;

let detP = null, recP = null, keys = null, allowed = null;
function sessions() {
  if (!detP) {
    detP = ort.InferenceSession.create(path.join(DIR, 'det.onnx'));
    recP = ort.InferenceSession.create(path.join(DIR, 'rec.onnx'));
    const list = fs.readFileSync(path.join(DIR, 'rec_keys.txt'), 'utf8').split(/\r?\n/);
    if (list[list.length - 1] === '') list.pop();
    keys = ['', ...list, ' '];                       // index 0 = CTC blank, last = space
    // The model also knows ~6000 CJK characters; only allow printable ASCII in our results
    allowed = keys.map((c, i) => i === 0 || /^[\x20-\x7e]$/.test(c));
  }
  return Promise.all([detP, recP]);
}

// img = { width, height, data: RGBA Uint8Array }
function sample(img, x, y, out, o) { // bilinear, writes B,G,R floats in 0..255
  const { width: w, height: h, data } = img;
  x = Math.max(0, Math.min(w - 1, x)); y = Math.max(0, Math.min(h - 1, y));
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
  for (let c = 0; c < 3; c++) {
    const v = (data[i00 + c] * (1 - fx) + data[i10 + c] * fx) * (1 - fy) + (data[i01 + c] * (1 - fx) + data[i11 + c] * fx) * fy;
    out[o + (2 - c)] = v; // RGB -> BGR (Paddle models were trained on BGR)
  }
}

async function detect(det, img) {
  const { width: w, height: h } = img;
  let ratio = Math.min(w, h) < DET_LIMIT_MIN ? DET_LIMIT_MIN / Math.min(w, h) : 1;
  if (Math.max(w, h) * ratio > DET_MAX_SIDE) ratio = DET_MAX_SIDE / Math.max(w, h);
  const dw = Math.max(32, Math.round(w * ratio / 32) * 32), dh = Math.max(32, Math.round(h * ratio / 32) * 32);
  const rx = dw / w, ry = dh / h;

  const plane = dw * dh, input = new Float32Array(3 * plane), px = new Float32Array(3);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    sample(img, (x + 0.5) / rx - 0.5, (y + 0.5) / ry - 0.5, px, 0);
    const i = y * dw + x;
    input[i] = px[0] / 127.5 - 1; input[plane + i] = px[1] / 127.5 - 1; input[2 * plane + i] = px[2] / 127.5 - 1;
  }
  const out = await det.run({ x: new ort.Tensor('float32', input, [1, 3, dh, dw]) });
  const prob = out[det.outputNames[0]].data;

  // binarise + 2x2 dilation (as PaddleOCR does)
  const bin = new Uint8Array(plane);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const i = y * dw + x;
    if (prob[i] > DET_THRESH || (x > 0 && prob[i - 1] > DET_THRESH) || (y > 0 && prob[i - dw] > DET_THRESH) ||
        (x > 0 && y > 0 && prob[i - dw - 1] > DET_THRESH)) bin[i] = 1;
  }

  // connected components -> rotated rectangles (principal axis of the region's pixels)
  const seen = new Uint8Array(plane), boxes = [], stack = [];
  for (let s = 0; s < plane; s++) {
    if (!bin[s] || seen[s]) continue;
    const pts = []; let score = 0;
    seen[s] = 1; stack.push(s);
    while (stack.length) {
      const p = stack.pop(); pts.push(p); score += prob[p];
      const x = p % dw;
      if (x > 0 && bin[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < dw - 1 && bin[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (p >= dw && bin[p - dw] && !seen[p - dw]) { seen[p - dw] = 1; stack.push(p - dw); }
      if (p < plane - dw && bin[p + dw] && !seen[p + dw]) { seen[p + dw] = 1; stack.push(p + dw); }
    }
    if (pts.length < 10 || score / pts.length < BOX_THRESH) continue;

    let mx = 0, my = 0;
    for (const p of pts) { mx += p % dw; my += (p / dw) | 0; }
    mx /= pts.length; my /= pts.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of pts) { const dx = p % dw - mx, dy = ((p / dw) | 0) - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    let a = 0.5 * Math.atan2(2 * sxy, sxx - syy); // angle of the long axis
    if (Math.abs(a) > Math.PI / 4 && sxx >= syy) a = 0;
    const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of pts) {
      const dx = p % dw - mx, dy = ((p / dw) | 0) - my;
      const u = dx * ux + dy * uy, v = dx * vx + dy * vy;
      if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    let bw = u1 - u0 + 1, bh = v1 - v0 + 1;
    if (Math.min(bw, bh) < 3) continue;
    const d = (bw * bh * UNCLIP) / (2 * (bw + bh)); // grow by area*ratio/perimeter
    u0 -= d; u1 += d; v0 -= d; v1 += d; bw = u1 - u0; bh = v1 - v0;
    if (Math.min(bw, bh) < 5) continue;
    // rectangle in original-image coordinates: origin corner + unit axes + lengths
    const cx = mx + ux * u0 + vx * v0, cy = my + uy * u0 + vy * v0;
    boxes.push({
      ox: cx / rx, oy: cy / ry,
      ax: ux / rx, ay: uy / ry, bx: vx / rx, by: vy / ry, // per det-pixel step, in original pixels
      lu: bw, lv: bh,
      score: score / pts.length,
      top: (my - bh / 2) / ry, left: (mx - bw / 2) / rx, height: bh / ry,
    });
  }
  return boxes;
}

async function recognize(rec, img, b) {
  // straightened crop: width/height in original pixels
  const lenU = Math.hypot(b.ax, b.ay) * b.lu, lenV = Math.hypot(b.bx, b.by) * b.lv;
  const outW = Math.max(REC_MIN_W, Math.ceil(REC_H * lenU / lenV));
  const useW = Math.min(outW, Math.ceil(REC_H * lenU / lenV));
  const plane = REC_H * outW, input = new Float32Array(3 * plane), px = new Float32Array(3);
  const su = b.lu / useW, sv = b.lv / REC_H; // det pixels per output pixel
  for (let y = 0; y < REC_H; y++) for (let x = 0; x < useW; x++) {
    const u = (x + 0.5) * su, v = (y + 0.5) * sv;
    sample(img, b.ox + b.ax * u + b.bx * v, b.oy + b.ay * u + b.by * v, px, 0);
    const i = y * outW + x;
    input[i] = px[0] / 127.5 - 1; input[plane + i] = px[1] / 127.5 - 1; input[2 * plane + i] = px[2] / 127.5 - 1;
  }
  const out = await rec.run({ x: new ort.Tensor('float32', input, [1, 3, REC_H, outW]) });
  const t = out[rec.outputNames[0]], [, T, C] = t.dims, p = t.data;
  let text = '', confSum = 0, n = 0, prev = -1;
  for (let s = 0; s < T; s++) {
    let best = 0, bp = -1;
    for (let k = 0; k < C; k++) { if (!allowed[k]) continue; const v = p[s * C + k]; if (v > bp) { bp = v; best = k; } }
    if (best !== 0 && best !== prev) { text += keys[best]; confSum += bp; n++; }
    prev = best;
  }
  return { text: text.trim(), confidence: n ? confSum / n : 0 };
}

async function recognizeText(img) {
  const [det, rec] = await sessions();
  const boxes = await detect(det, img);
  const lines = [];
  for (const b of boxes) {
    const r = await recognize(rec, img, b);
    if (r.text) lines.push({ text: r.text, confidence: r.confidence, top: b.top, left: b.left, height: b.height });
  }
  // reading order: rows top-to-bottom, left-to-right within a row
  lines.sort((a, b) => (Math.abs(a.top - b.top) < Math.min(a.height, b.height) / 2 ? a.left - b.left : a.top - b.top));
  return { lines: lines.map(({ text, confidence }) => ({ text, confidence })), text: lines.map(l => l.text).join('\n') };
}

module.exports = { recognizeText, warmUp: () => sessions().catch(() => {}) };
