// Job folders: one folder per tab, named "<YYYY-MM-DD> <name>", holding the pasted screenshots,
// values.txt (the four values, human readable) and session.json (used to restore the tab).
const fs = require('fs/promises');
const path = require('path');
const { dialog, shell, ipcMain } = require('electron');

const SESSION = 'session.json';
const VALUES = 'values.txt';
const IMAGE_EXT = /^(png|jpg|jpeg|gif|webp|bmp)$/;

// Make a string safe to use as a Windows file/folder name
const clean = s => String(s || '')
  .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/[. ]+$/, '')
  .slice(0, 100);

const exists = p => fs.access(p).then(() => true, () => false);

async function uniquePath(dir, base, ext) {
  let name = `${base}${ext}`;
  for (let i = 2; await exists(path.join(dir, name)); i++) name = `${base} (${i})${ext}`;
  return name;
}

function register(getWindow) {
  ipcMain.handle('job:pickBase', async (_e, current) => {
    const r = await dialog.showOpenDialog(getWindow(), {
      title: 'Choose where job folders are saved',
      defaultPath: current || undefined,
      properties: ['openDirectory', 'createDirectory'],
    });
    return r.canceled ? null : r.filePaths[0];
  });

  // Creates "<base>/<date> <name>" (adds " (2)" etc. if it already exists) and returns its path
  ipcMain.handle('job:create', async (_e, base, name, date) => {
    const n = clean(name);
    if (!n) throw new Error('Name is empty');
    if (!base) throw new Error('No save folder chosen');
    await fs.mkdir(base, { recursive: true });
    const folder = await uniquePath(base, `${clean(date)} ${n}`, '');
    const dir = path.join(base, folder);
    await fs.mkdir(dir);
    return dir;
  });

  // Saves a pasted screenshot as "<label>.png", "<label> (2).png", ... and returns the file name
  ipcMain.handle('job:saveImage', async (_e, dir, label, bytes, ext) => {
    await fs.mkdir(dir, { recursive: true });
    const e = IMAGE_EXT.test(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'png';
    const name = await uniquePath(dir, clean(label) || 'image', `.${e}`);
    await fs.writeFile(path.join(dir, name), Buffer.from(bytes));
    return name;
  });

  ipcMain.handle('job:save', async (_e, dir, session, valuesText) => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, SESSION), JSON.stringify(session, null, 2), 'utf8');
    await fs.writeFile(path.join(dir, VALUES), valuesText, 'utf8');
    return true;
  });

  // Returns the saved session plus the bytes of each section's latest screenshot
  ipcMain.handle('job:load', async (_e, dir) => {
    let session = null;
    try { session = JSON.parse(await fs.readFile(path.join(dir, SESSION), 'utf8')); } catch { /* new or missing */ }
    const images = {};
    for (const [key, s] of Object.entries((session && session.sections) || {})) {
      if (!s || !s.image) continue;
      try { images[key] = await fs.readFile(path.join(dir, path.basename(s.image))); } catch { /* file removed */ }
    }
    return { session, images, exists: await exists(dir) };
  });

  ipcMain.handle('job:open', (_e, dir) => shell.openPath(dir));
}

module.exports = { register };
