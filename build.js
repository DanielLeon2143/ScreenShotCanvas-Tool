// Builds a portable Windows x64 app into dist/ (npm run dist)
const path = require('path');
const fs = require('fs');
const { packager } = require('@electron/packager');

const ORT_BIN = 'node_modules/onnxruntime-node/bin/napi-v3/win32/x64';

packager({
  dir: __dirname,
  name: 'ScreenShotCanvas Tool',
  platform: 'win32',
  arch: 'x64',
  out: 'dist',
  overwrite: true,
  // native code (onnxruntime) can't read files inside app.asar, so keep models + binaries outside it
  asar: { unpackDir: '{models,models/paddle,node_modules/onnxruntime-node/bin/napi-v3/win32/x64}' },
  ignore: [
    /^\/dist/, /^\/\.git/, /^\/Start\.vbs$/, /^\/build\.js$/,
    /onnxruntime-node\/bin\/napi-v3\/(darwin|linux|win32\/arm64)/,
  ],
}).then(([out]) => {
  // packager drops onnxruntime's DLLs; put them next to the binding
  const dest = path.join(out, 'resources', 'app.asar.unpacked', ORT_BIN);
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(ORT_BIN)) fs.copyFileSync(path.join(ORT_BIN, f), path.join(dest, f));
  console.log('Built:', out);
}).catch(e => { console.error(e); process.exit(1); });
