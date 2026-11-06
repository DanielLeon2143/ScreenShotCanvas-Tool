const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('win', {
  minimize: () => ipcRenderer.send('win:minimize'),
  close: () => ipcRenderer.send('win:close'),
  toggleTop: () => ipcRenderer.invoke('win:toggle-top'),
  plateSpec: () => ipcRenderer.invoke('plate:spec'),
  plateOcr: (rgb) => ipcRenderer.invoke('plate:ocr', rgb),
  textOcr: (img) => ipcRenderer.invoke('text:ocr', img),
  jobPickBase: (current) => ipcRenderer.invoke('job:pickBase', current),
  jobCreate: (base, name, date) => ipcRenderer.invoke('job:create', base, name, date),
  jobSaveImage: (dir, label, bytes, ext) => ipcRenderer.invoke('job:saveImage', dir, label, bytes, ext),
  jobSave: (dir, session, valuesText) => ipcRenderer.invoke('job:save', dir, session, valuesText),
  jobLoad: (dir) => ipcRenderer.invoke('job:load', dir),
  jobOpen: (dir) => ipcRenderer.invoke('job:open', dir),
});
