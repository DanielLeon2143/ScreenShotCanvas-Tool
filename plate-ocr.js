// License plate OCR using fast-plate-ocr's ONNX model (https://github.com/ankandrew/fast-plate-ocr)
// Runs in the Electron main process with onnxruntime-node — fully offline.
const path = require('path');
const ort = require('onnxruntime-node');

const MODEL_DIR = path.join(__dirname, 'models');
const config = require(path.join(MODEL_DIR, 'plate_config.json'));

let sessionPromise = null;
function getSession() {
  if (!sessionPromise) sessionPromise = ort.InferenceSession.create(path.join(MODEL_DIR, config.model));
  return sessionPromise;
}

// rgb: Uint8Array of length img_height * img_width * channels, already resized by the renderer
async function recognizePlate(rgb) {
  const { img_height: h, img_width: w, max_plate_slots: slots, alphabet, pad_char: pad } = config;
  const c = config.image_color_mode === 'rgb' ? 3 : 1;
  if (!rgb || rgb.length !== h * w * c) throw new Error(`Expected ${h * w * c} bytes, got ${rgb && rgb.length}`);

  const session = await getSession();
  const out = await session.run({ input: new ort.Tensor('uint8', Uint8Array.from(rgb), [1, h, w, c]) });

  const probs = out.plate.data;           // [1, slots, vocab]
  const vocab = alphabet.length;
  let plate = '';
  const charProbs = [];
  for (let s = 0; s < slots; s++) {
    let best = 0, bestP = -1;
    for (let k = 0; k < vocab; k++) {
      const p = probs[s * vocab + k];
      if (p > bestP) { bestP = p; best = k; }
    }
    plate += alphabet[best];
    charProbs.push(bestP);
  }
  // strip trailing padding, keep confidences of real characters only
  let end = plate.length;
  while (end > 0 && plate[end - 1] === pad) end--;
  const text = plate.slice(0, end);
  const used = charProbs.slice(0, text.length);
  const confidence = used.length ? Math.min(...used) : 0;

  let region = null, regionProb = null;
  if (out.region && config.plate_regions) {
    const r = out.region.data;
    let bi = 0;
    for (let i = 1; i < r.length; i++) if (r[i] > r[bi]) bi = i;
    region = config.plate_regions[bi];
    regionProb = r[bi];
  }
  return { plate: text.split(pad).join(''), confidence, charProbs: used, region, regionProb };
}

module.exports = {
  recognizePlate,
  plateInputSpec: () => ({ width: config.img_width, height: config.img_height, mode: config.image_color_mode }),
  warmUp: () => getSession().catch(() => {}),
};
