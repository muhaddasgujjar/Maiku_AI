const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('maiku', {
  // Get the WebSocket URL for the Python backend
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),

  // Move the frameless window by dragging
  moveWindow: (deltaX, deltaY) => ipcRenderer.send('window-move', { deltaX, deltaY }),

  // Toggle overlay visibility (also mapped to global hotkey)
  toggleVisibility: () => ipcRenderer.send('toggle-visibility'),
})
