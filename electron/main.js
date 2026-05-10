const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

const isDev = process.env.NODE_ENV !== 'production'
const BACKEND_PORT = process.env.BACKEND_PORT || 8765

let mainWindow = null
let backendProcess = null

// ── Settings persistence ──────────────────────────────────────
const getSettingsPath = () => path.join(app.getPath('userData'), 'maiku-settings.json')

function loadSettingsFromDisk() {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf-8'))
  } catch {
    return {}
  }
}

function saveSettingsToDisk(data) {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(data, null, 2), 'utf-8')
}

ipcMain.handle('load-settings', () => loadSettingsFromDisk())
ipcMain.handle('save-settings', (_, data) => { saveSettingsToDisk(data); return { ok: true } })

function createWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: 480,
    height: 600,
    x: Math.floor(width / 2 - 240),
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // THE KEY FEATURE: hide this window from screen sharing / capture
  // On Windows: calls SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)
  // On macOS: sets NSWindow sharingType to NSWindowSharingNone
  mainWindow.setContentProtection(true)

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Allow dragging the frameless window via IPC
  ipcMain.on('window-move', (_, { deltaX, deltaY }) => {
    if (!mainWindow) return
    const [x, y] = mainWindow.getPosition()
    mainWindow.setPosition(x + deltaX, y + deltaY)
  })

  // Toggle visibility hotkey handler
  ipcMain.on('toggle-visibility', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
    }
  })

  // Relay backend connection status to renderer
  ipcMain.handle('get-backend-url', () => `ws://localhost:${BACKEND_PORT}/ws`)
}

function startBackend() {
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
  const backendPath = isDev
    ? path.join(__dirname, '../backend/main.py')
    : path.join(process.resourcesPath, 'backend/main.py')

  backendProcess = spawn(pythonCmd, [backendPath], {
    env: { ...process.env, BACKEND_PORT: String(BACKEND_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  backendProcess.stdout.on('data', (data) => {
    console.log('[backend]', data.toString().trim())
  })

  backendProcess.stderr.on('data', (data) => {
    console.error('[backend]', data.toString().trim())
  })

  backendProcess.on('close', (code) => {
    console.log(`[backend] exited with code ${code}`)
  })
}

app.whenReady().then(() => {
  // Only auto-spawn backend in production — in dev, start it manually
  if (!isDev) {
    startBackend()
    setTimeout(createWindow, 1500)
  } else {
    createWindow()
  }

  // Global hotkey: Ctrl+Alt+M → toggle overlay
  globalShortcut.register('CommandOrControl+Alt+M', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) mainWindow.hide()
    else { mainWindow.show(); mainWindow.focus() }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
