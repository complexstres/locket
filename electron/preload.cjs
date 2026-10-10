const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('locketDesktop', {
  isDesktop: true,
  platform: process.platform,
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onState: (cb) => {
    const handler = (_e, state) => cb(state)
    ipcRenderer.on('window-state', handler)
    return () => ipcRenderer.removeListener('window-state', handler)
  },
})
