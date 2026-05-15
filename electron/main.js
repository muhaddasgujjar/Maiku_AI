const { app, BrowserWindow, ipcMain, screen, globalShortcut, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { spawn } = require('child_process')

// ── THE correct dev/prod detection ────────────────────────────
// process.env.NODE_ENV is NOT reliable in packaged apps.
// app.isPackaged is the Electron-recommended way.
const isDev = !app.isPackaged

const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || '8765', 10)

let mainWindow = null
let splashWindow = null
let backendProcess = null

// ── Settings persistence ──────────────────────────────────────
const getSettingsPath = () => path.join(app.getPath('userData'), 'maiku-settings.json')

function loadSettingsFromDisk() {
  try { return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf-8')) }
  catch { return {} }
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
    transparent: false,
    backgroundColor: '#09090b',
    alwaysOnTop: true,
    skipTaskbar: false,
    center: true,
    resizable: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  // Use __dirname which points to electron/ folder inside asar (works correctly)
  splashWindow.loadFile(path.join(__dirname, 'splash.html'))
  splashWindow.once('ready-to-show', () => splashWindow && splashWindow.show())
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
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.setContentProtection(true)

  const saved = loadSettingsFromDisk()
  if (saved.opacity != null) mainWindow.setOpacity(Math.min(1, Math.max(0.1, saved.opacity)))

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Destroy splash and show main window only when fully painted — no flash
  mainWindow.once('ready-to-show', () => {
    closeSplash()
    mainWindow.show()
    mainWindow.focus()
  })

  ipcMain.on('window-move', (_, { deltaX, deltaY }) => {
    if (!mainWindow) return
    const [x, y] = mainWindow.getPosition()
    mainWindow.setPosition(x + deltaX, y + deltaY)
  })

  ipcMain.on('toggle-visibility', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) mainWindow.hide()
    else { mainWindow.show(); mainWindow.focus() }
  })

  const WINDOW_SIZES = {
    'answer-only': [480, 260],
    compact: [480, 480],
    normal: [480, 660],
  }
  ipcMain.on('window-resize', (_, preset) => {
    if (!mainWindow) return
    const [w, h] = WINDOW_SIZES[preset] || WINDOW_SIZES.normal
    mainWindow.setSize(w, h, true)
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
    // Development: run via Python interpreter
    cmd = process.platform === 'win32' ? 'python' : 'python3'
    args = [path.join(__dirname, '../backend/main.py')]
    console.log('[main] DEV mode — running Python backend:', cmd, args[0])
  } else {
    // Production: run PyInstaller-bundled exe inside extraResources
    const exeName = 'maiku_backend.exe'
    cmd = path.join(process.resourcesPath, 'backend', 'maiku_backend', exeName)
    args = []
    console.log('[main] PROD mode — running bundled backend:', cmd)

    // Safety check: if exe doesn't exist, fail early with a clear message
    if (!fs.existsSync(cmd)) {
      console.error('[main] CRITICAL: bundled backend exe not found at', cmd)
      dialog.showErrorBox(
        'Maiku AI — Installation Corrupted',
        `The AI backend could not be found.\n\nExpected: ${cmd}\n\nPlease reinstall Maiku AI from the official installer.\n\nContact: muhaddasbasit260@gmail.com`
      )
      app.quit()
      return false
    }
  }

  backendProcess = spawn(cmd, args, {
    env: getBackendEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  backendProcess.stdout.on('data', d => console.log('[backend]', d.toString().trimEnd()))
  backendProcess.stderr.on('data', d => console.error('[backend]', d.toString().trimEnd()))
  backendProcess.on('error', err => console.error('[backend] spawn error:', err.message))
  backendProcess.on('close', code => console.log(`[backend] exited code=${code}`))
  return true
}

// ── Is backend already up? ────────────────────────────────────
function isBackendAlreadyRunning() {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, res => {
      res.resume()
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(800, () => { req.destroy(); resolve(false) })
  })
}

// ── Poll until backend responds on /health ────────────────────
function pollHealth(maxMs) {
  return new Promise(resolve => {
    const deadline = Date.now() + maxMs

    function attempt() {
      if (Date.now() > deadline) { resolve(false); return }
      const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, res => {
        res.resume()
        if (res.statusCode === 200) { resolve(true); return }
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
  // Show splash immediately — user sees something right away
  createSplashWindow()

  const alreadyUp = await isBackendAlreadyRunning()
  if (!alreadyUp) {
    const started = startBackend()
    if (!started) return  // startBackend showed its own error dialog
  } else {
    console.log('[main] Backend already running, skipping spawn')
  }

  // Production: PyInstaller needs time to extract on first run (up to 60s)
  // Development: Python startup is fast (30s should be plenty)
  const timeoutMs = isDev ? 30000 : 90000
  console.log(`[main] Waiting for backend (timeout=${timeoutMs / 1000}s, isDev=${isDev})...`)
  const ready = await pollHealth(timeoutMs)

  if (!ready) {
    closeSplash()
    const title = 'Maiku AI — Could Not Start'
    const msg = isDev
      ? 'Backend did not respond in 30 s.\n\nCheck that Python is running:\n  python backend/main.py'
      : 'The AI backend took too long to start.\n\nPossible fixes:\n\n' +
        '• Your antivirus may be blocking Maiku AI.\n  Open Windows Security → Virus & threat protection → Exclusions → Add Maiku AI\n\n' +
        '• Try running Maiku AI as Administrator (right-click → Run as administrator)\n\n' +
        '• Reinstall Maiku AI\n\n' +
        'Support: muhaddasbasit260@gmail.com'
    dialog.showErrorBox(title, msg)
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
