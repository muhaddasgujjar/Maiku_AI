const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('maiku', {
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  moveWindow: (deltaX, deltaY) => ipcRenderer.send('window-move', { deltaX, deltaY }),
  toggleVisibility: () => ipcRenderer.send('toggle-visibility'),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (data) => ipcRenderer.invoke('save-settings', data),
})
