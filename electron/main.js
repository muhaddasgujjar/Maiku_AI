const { app, BrowserWindow, ipcMain, screen, globalShortcut, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { spawn } = require('child_process')

const isDev = process.env.NODE_ENV !== 'production'
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || '8765', 10)
const POLL_TIMEOUT_MS = isDev ? 60000 : 120000   // dev: 1 min, prod: 2 min

let mainWindow = null
let splashWindow = null
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

ipcMain.on('set-opacity', (_, val) => {
  if (mainWindow) mainWindow.setOpacity(Math.min(1, Math.max(0.1, val)))
})

ipcMain.handle('save-session', (_, data) => {
  const sessionsDir = path.join(app.getPath('userData'), 'sessions')
  if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const file = path.join(sessionsDir, `session-${stamp}.json`)
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
  return { ok: true, file }
})

// ── Splash window ─────────────────────────────────────────────
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 360,
    height: 260,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    center: true,
    resizable: false,
    hasShadow: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  splashWindow.loadFile(path.join(__dirname, 'splash.html'))
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.destroy()
    splashWindow = null
  }
}

// ── Main overlay window ───────────────────────────────────────
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
    show: false,           // don't show until ready-to-show fires
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // THE KEY FEATURE: hide from screen sharing / capture
  mainWindow.setContentProtection(true)

  const saved = loadSettingsFromDisk()
  if (saved.opacity != null) mainWindow.setOpacity(Math.min(1, Math.max(0.1, saved.opacity)))

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Show the window only when it's fully painted — eliminates white flash
  mainWindow.once('ready-to-show', () => {
    closeSplash()
    mainWindow.show()
  })

  ipcMain.on('window-move', (_, { deltaX, deltaY }) => {
    if (!mainWindow) return
    const [x, y] = mainWindow.getPosition()
    mainWindow.setPosition(x + deltaX, y + deltaY)
  })

  ipcMain.on('toggle-visibility', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) mainWindow.hide()
    else mainWindow.show()
  })

  const WINDOW_SIZES = {
    'answer-only': [480, 260],
    compact: [480, 480],
    normal: [480, 660],
  }

  ipcMain.on('window-resize', (_, preset) => {
    if (!mainWindow) return
    const size = WINDOW_SIZES[preset] || WINDOW_SIZES.normal
    mainWindow.setSize(size[0], size[1], true)
  })

  ipcMain.handle('get-backend-url', () => `ws://localhost:${BACKEND_PORT}/ws`)
}

// ── Backend launch ────────────────────────────────────────────
function getBackendEnv() {
  const settings = loadSettingsFromDisk()
  const userData = app.getPath('userData')
  return {
    ...process.env,
    BACKEND_PORT: String(BACKEND_PORT),
    CHROMA_PERSIST_DIR: path.join(userData, 'chroma_db'),
    HF_HOME: path.join(userData, 'models'),
    SENTENCE_TRANSFORMERS_HOME: path.join(userData, 'models'),
    TRANSFORMERS_CACHE: path.join(userData, 'models'),
    ...(settings.groqApiKey ? { GROQ_API_KEY: settings.groqApiKey } : {}),
    ...(settings.llmModel ? { LLM_MODEL: settings.llmModel } : {}),
  }
}

function startBackend() {
  let cmd, args

  if (isDev) {
    cmd = process.platform === 'win32' ? 'python' : 'python3'
    args = [path.join(__dirname, '../backend/main.py')]
  } else {
    const exeName = process.platform === 'win32' ? 'maiku_backend.exe' : 'maiku_backend'
    cmd = path.join(process.resourcesPath, 'backend', 'maiku_backend', exeName)
    args = []
  }

  backendProcess = spawn(cmd, args, {
    env: getBackendEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,    // prevents any console window flash on Windows
  })

  backendProcess.stdout.on('data', (d) => console.log('[backend]', d.toString().trim()))
  backendProcess.stderr.on('data', (d) => console.error('[backend]', d.toString().trim()))
  backendProcess.on('close', (code) => console.log(`[backend] exited with code ${code}`))
  backendProcess.on('error', (err) => {
    console.error('[backend] failed to start:', err.message)
  })
}

// ── Is backend already running? ───────────────────────────────
function isBackendAlreadyRunning() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, (res) => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(800, () => { req.destroy(); resolve(false) })
  })
}

// ── Poll until backend is ready ───────────────────────────────
function pollHealth(maxMs) {
  return new Promise((resolve) => {
    const deadline = Date.now() + maxMs

    function attempt() {
      if (Date.now() > deadline) { resolve(false); return }
      const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, (res) => {
        if (res.statusCode === 200) { resolve(true); return }
        // Drain response body so socket closes properly
        res.resume()
        setTimeout(attempt, 800)
      })
      req.on('error', () => setTimeout(attempt, 800))
      req.setTimeout(800, () => { req.destroy(); setTimeout(attempt, 800) })
    }

    attempt()
  })
}

// ── App lifecycle ─────────────────────────────────────────────
app.whenReady().then(async () => {
  // Show splash immediately so the user sees something right away
  createSplashWindow()

  const alreadyUp = await isBackendAlreadyRunning()
  if (!alreadyUp) {
    console.log('[main] Starting backend process...')
    startBackend()
  } else {
    console.log('[main] Backend already running — skipping spawn')
  }

  console.log('[main] Waiting for backend to be ready...')
  const ready = await pollHealth(POLL_TIMEOUT_MS)

  if (!ready) {
    closeSplash()

    const msg = isDev
      ? 'Development mode: make sure Python is installed and run:\n  pip install -r backend/requirements.txt\n\nThen restart the app.'
      : 'Maiku AI could not start the AI backend.\n\nPossible fixes:\n• Restart the app\n• Run as Administrator\n• Check your antivirus isn\'t blocking Maiku AI\n• Reinstall from the official installer\n\nFor support: muhaddasbasit260@gmail.com'

    dialog.showErrorBox('Maiku AI — Failed to start', msg)
    app.quit()
    return
  }

  console.log('[main] Backend ready — creating window')
  createWindow()  // splash is closed inside ready-to-show

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
