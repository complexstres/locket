const { app, BrowserWindow, shell, Menu, Tray, nativeImage, ipcMain, globalShortcut, screen } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')
const http = require('node:http')
const fs = require('node:fs')

app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-gpu-sandbox')

const ROOT = path.join(__dirname, '..')
const isDev = !app.isPackaged && process.env.LOCKET_DEV !== '0'
const API_PORT = Number(process.env.LOCKET_PORT || 3847)
const DEV_URL = process.env.LOCKET_DEV_URL || 'http://localhost:5173'
const PROD_URL = `http://127.0.0.1:${API_PORT}`
const HOTKEY = process.env.LOCKET_HOTKEY || 'CommandOrControl+Shift+Space'

let mainWindow = null
let pickerWindow = null
let tray = null
let apiProcess = null

function iconPath() {
  const p = path.join(ROOT, 'build', 'icon.png')
  return fs.existsSync(p) ? p : undefined
}

function waitForUrl(url, timeoutMs = 45000, ok = (res) => res.statusCode >= 200 && res.statusCode < 500) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume()
        if (ok(res)) resolve(true)
        else if (Date.now() - start > timeoutMs) reject(new Error(`Bad status ${res.statusCode} for ${url}`))
        else setTimeout(tick, 250)
      })
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`Timeout waiting for ${url}`))
        else setTimeout(tick, 250)
      })
    }
    tick()
  })
}

function ensureDist() {
  const index = path.join(ROOT, 'dist', 'index.html')
  if (fs.existsSync(index)) return
  throw new Error(
    'UI build missing (dist/index.html). From the project folder run: npm run build && npm run desktop',
  )
}

function nodeBin() {
  const home = process.env.HOME || ''
  const candidates = [
    path.join(home, '.nvm/versions/node/v22.23.1/bin/node'),
    path.join(home, '.local/share/fnm/node-versions/v22.23.1/installation/bin/node'),
    'node',
    '/usr/local/bin/node',
    '/usr/bin/node',
  ]
  const { spawnSync } = require('node:child_process')
  for (const c of candidates) {
    try {
      const r = spawnSync(c, ['-v'], { encoding: 'utf8' })
      if (r.status !== 0) continue
      const ver = String(r.stdout || '').trim().replace(/^v/, '')
      const major = Number(ver.split('.')[0] || 0)
      if (major >= 20) return c
    } catch {
      /* try next */
    }
  }
  return process.execPath
}

function startApi() {
  if (isDev) return Promise.resolve()
  ensureDist()

  // Reuse healthy local API if already running (e.g. after tests / prior launch)
  return waitForUrl(`${PROD_URL}/api/status`, 1200, (res) => res.statusCode === 200)
    .catch(() => {
      const entry = path.join(ROOT, 'server', 'index.ts')
      const tsxCli = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs')
      const bin = nodeBin()
      const env = {
        ...process.env,
        LOCKET_DESKTOP: '1',
        LOCKET_PORT: String(API_PORT),
      }
      if (bin === process.execPath) env.ELECTRON_RUN_AS_NODE = '1'

      apiProcess = spawn(bin, [tsxCli, entry], {
        cwd: ROOT,
        env,
        stdio: 'inherit',
      })
      return waitForUrl(`${PROD_URL}/api/status`, 45000, (res) => res.statusCode === 200)
    })
}

function baseUrl() {
  return isDev ? DEV_URL : PROD_URL
}

function createWindow() {
  const ico = iconPath()
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#121214',
    title: 'Locket',
    icon: ico,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  Menu.setApplicationMenu(null)
  mainWindow.loadURL(baseUrl())

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window-state', { maximized: true }))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window-state', { maximized: false }))
}

function pickerUrl() {
  return isDev ? `${DEV_URL}/picker.html` : `${PROD_URL}/picker.html`
}

function togglePicker() {
  if (pickerWindow && !pickerWindow.isDestroyed()) {
    if (pickerWindow.isVisible()) {
      pickerWindow.hide()
      return
    }
    pickerWindow.show()
    pickerWindow.focus()
    return
  }

  const display = screen.getPrimaryDisplay()
  const width = 440
  const height = 520
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2)
  const y = Math.round(display.workArea.y + display.workArea.height * 0.18)

  pickerWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#121214',
    title: 'Locket Quick',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  pickerWindow.setAlwaysOnTop(true, 'screen-saver')
  pickerWindow.loadURL(pickerUrl())
  pickerWindow.once('ready-to-show', () => {
    pickerWindow.show()
    pickerWindow.focus()
  })
  pickerWindow.on('blur', () => {
    if (pickerWindow && !pickerWindow.isDestroyed()) pickerWindow.hide()
  })
  pickerWindow.on('closed', () => {
    pickerWindow = null
  })
}

function registerHotkeys() {
  const ok = globalShortcut.register(HOTKEY, () => togglePicker())
  if (!ok) console.error('Hotkey failed:', HOTKEY)
  // secondary
  globalShortcut.register('CommandOrControl+Alt+L', () => togglePicker())
}

ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return false
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
  return mainWindow.isMaximized()
})
ipcMain.handle('window:close', () => mainWindow?.close())
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)
ipcMain.handle('picker:toggle', () => {
  togglePicker()
  return true
})

function createTray() {
  const ico = iconPath()
  if (!ico) return
  try {
    tray = new Tray(nativeImage.createFromPath(ico).resize({ width: 24, height: 24 }))
    tray.setToolTip('Locket')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Show',
          click: () => {
            if (mainWindow) {
              mainWindow.show()
              mainWindow.focus()
            } else createWindow()
          },
        },
        {
          label: `Quick search (${HOTKEY})`,
          click: () => togglePicker(),
        },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
      ]),
    )
    tray.on('click', () => {
      if (!mainWindow) return createWindow()
      if (mainWindow.isVisible()) mainWindow.hide()
      else {
        mainWindow.show()
        mainWindow.focus()
      }
    })
  } catch {
    /* optional */
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    try {
      if (isDev) await waitForUrl(DEV_URL)
      else await startApi()
    } catch (e) {
      console.error(e)
      const { dialog } = require('electron')
      dialog.showErrorBox('Locket', e instanceof Error ? e.message : String(e))
      app.quit()
      return
    }
    createWindow()
    createTray()
    registerHotkeys()
  })
}

app.on('window-all-closed', () => {
  // keep running for hotkey / tray
  if (process.platform !== 'darwin' && !tray) app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('before-quit', () => {
  if (apiProcess && !apiProcess.killed) {
    apiProcess.kill('SIGTERM')
    apiProcess = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
