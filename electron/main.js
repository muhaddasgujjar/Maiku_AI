const { app, BrowserWindow, ipcMain, screen, globalShortcut, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { spawn } = require('child_process')

const isDev = process.env.NODE_ENV !== 'production'
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || '8765', 10)

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

// ── Window creation ───────────────────────────────────────────
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

  // THE KEY FEATURE: hide from screen sharing / capture
  // Windows: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)
  // macOS: NSWindowSharingNone
  mainWindow.setContentProtection(true)

  const saved = loadSettingsFromDisk()
  if (saved.opacity != null) mainWindow.setOpacity(Math.min(1, Math.max(0.1, saved.opacity)))

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

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
    // Model cache inside userData so it survives app moves
    HF_HOME: path.join(userData, 'models'),
    // Inject saved API key & model into backend env
    ...(settings.groqApiKey ? { GROQ_API_KEY: settings.groqApiKey } : {}),
    ...(settings.llmModel ? { LLM_MODEL: settings.llmModel } : {}),
  }
}

function startBackend() {
  let cmd, args

  if (isDev) {
    // Dev: run via Python interpreter
    cmd = process.platform === 'win32' ? 'python' : 'python3'
    args = [path.join(__dirname, '../backend/main.py')]
  } else {
    // Production: use PyInstaller-built exe bundled in extraResources
    const exeName = process.platform === 'win32' ? 'maiku_backend.exe' : 'maiku_backend'
    cmd = path.join(process.resourcesPath, 'backend', 'maiku_backend', exeName)
    args = []
  }

  backendProcess = spawn(cmd, args, {
    env: getBackendEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  backendProcess.stdout.on('data', (d) => console.log('[backend]', d.toString().trim()))
  backendProcess.stderr.on('data', (d) => console.error('[backend]', d.toString().trim()))
  backendProcess.on('close', (code) => console.log(`[backend] exited with code ${code}`))
}

// ── Quick check — is backend already running? ─────────────────
function isBackendAlreadyRunning() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, (res) => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(800, () => { req.destroy(); resolve(false) })
  })
}

// ── Health poll — wait until backend responds ─────────────────
function pollHealth(maxMs = 90000) {
  return new Promise((resolve) => {
    const deadline = Date.now() + maxMs
    let dots = 0

    function attempt() {
      if (Date.now() > deadline) { resolve(false); return }
      dots++
      if (dots % 5 === 0) console.log(`[main] waiting for backend${'.'.repeat(dots % 4 + 1)}`)

      const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, (res) => {
        if (res.statusCode === 200) resolve(true)
        else setTimeout(attempt, 800)
      })
      req.on('error', () => setTimeout(attempt, 800))
      req.setTimeout(800, () => { req.destroy(); setTimeout(attempt, 800) })
    }

    attempt()
  })
}

// ── App lifecycle ─────────────────────────────────────────────
app.whenReady().then(async () => {
  const alreadyUp = await isBackendAlreadyRunning()
  if (!alreadyUp) {
    console.log('[main] Starting backend process...')
    startBackend()
  } else {
    console.log('[main] Backend already running — skipping spawn')
  }

  // Both dev AND production wait for backend health before showing UI
  // This prevents the "Error" status on first load
  console.log('[main] Waiting for backend to be ready...')
  const ready = await pollHealth(90000)

  if (!ready) {
    dialog.showErrorBox(
      'Maiku AI — Backend failed to start',
      'The Python backend did not respond within 90 seconds.\n\n' +
      'Make sure Python is installed and run:\n' +
      '  pip install -r backend/requirements.txt\n\n' +
      'Then restart the app.'
    )
    app.quit()
    return
  }

  console.log('[main] Backend ready — creating window')
  createWindow()

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
