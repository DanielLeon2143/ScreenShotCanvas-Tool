# ScreenShotCanvas Tool

A small borderless desktop strip for reading vehicle info out of screenshots. Paste a screenshot into a
section, rotate or zoom it until the text is clear, and OCR it. There are four sections:

| Section | What it reads | Engine |
|---|---|---|
| **VIN** | 17-character VIN; validated with the check digit | PaddleOCR (PP-OCRv4) |
| **Plate** | License plate | [fast-plate-ocr](https://github.com/ankandrew/fast-plate-ocr) |
| **Expiration** | Registration / sticker expiration date | PaddleOCR |
| **Mileage** | Odometer reading (e.g. `82465 mi`) | PaddleOCR |

All OCR runs locally with ONNX Runtime, so it works offline once installed.

## Features

- Borderless 938×166 window that you can drag, plus pin-on-top, minimize and close buttons
- Paste (Ctrl+V) a screenshot into the selected section
- Rotate with the slider, which appears when you hover over the top of a section, or with the hotkeys below
- Zoom with the mouse wheel (Shift+wheel for fine rotation), pan by dragging
- OCR reads only the part of the image visible in the section, so zoom in to pick one number out of a busy screenshot
- VIN auto-fix: if the check digit fails and exactly one confusable character (8/B, 0/D, 5/S…) fixes it, the fix is applied and flagged for you to verify
- Hover over a value box to see the raw OCR lines and confidence
- Resize sections by dragging the gap between them (double-click the gap to reset)
- Reorder sections by dragging them by their name
- **Jobs:** pick a base folder, then name a job. Each job opens in a tab and gets its own folder,
  `YYYY-MM-DD name`, holding every pasted screenshot plus `values.txt` and `session.json`.
  Tabs are restored the next time you start the app.

## Hotkeys

| Key | Action |
|---|---|
| Ctrl+V | Paste screenshot into the selected section |
| Ctrl+S / Enter | Run OCR on the selected section |
| Ctrl+C | Copy the selected section's value |
| Ctrl+Q | New job (tab + folder) |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous job tab |
| 1–4 | Select a section |
| A / D | Rotate −2° / +2° (hold Shift for 0.5°) |
| R / Shift+R | Rotate ±90° |
| + / − / 0 | Zoom in / out / fit |

## Install and run

Requires [Node.js](https://nodejs.org/) 18 or newer (Windows is the tested platform).

```sh
git clone https://github.com/DanielLeon2143/ScreenShotCanvas-Tool.git
cd ScreenShotCanvas-Tool
npm install
npm start
```

On Windows you can also double-click `Start.vbs` to launch it without a console window.

> With npm 11+, install scripts may be blocked. If Electron fails to start, run
> `npm install-scripts approve electron` (or `npm rebuild electron`).

## Project layout

```
main.js        Electron main process: window, IPC
preload.js     Bridge exposed to the page as window.win
index.html     The whole UI: sections, layout, tabs, hotkeys, parsers
text-ocr.js    PaddleOCR detection + recognition pipeline (onnxruntime-node)
plate-ocr.js   fast-plate-ocr plate recognizer
jobs.js        Job folders: create, save images/values, load
models/        ONNX models (plate model + PaddleOCR det/rec)
```

## Credits

- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) PP-OCRv4 models, ONNX exports from
  [RapidOCR](https://github.com/RapidAI/RapidOCR) (Apache-2.0)
- [fast-plate-ocr](https://github.com/ankandrew/fast-plate-ocr) `cct_s_v2_global` model (MIT)
- [ONNX Runtime](https://onnxruntime.ai/), [Electron](https://www.electronjs.org/)
