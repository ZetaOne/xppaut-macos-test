// XPPAUT desktop app (Electron). It shows the XPPAUT-Web page, served from the
// app's own files under app://xppaut/, so it works offline and runs the fast
// (JSPI) WebAssembly build of Chrome. Mac extras: .ode files open from Finder,
// a File menu, normal save dialogs for exports, and a warning before closing
// a running XPP.
const { app, BrowserWindow, Menu, dialog, net, protocol, shell } = require('electron')
const { readFileSync } = require('node:fs')
const { basename, join, normalize, sep } = require('node:path')
const { pathToFileURL } = require('node:url')

const HOST = 'xppaut'
const HOME = `app://${HOST}/index.html`
const SITE = app.isPackaged ? join(process.resourcesPath, 'site') : join(__dirname, 'site')
const WEBSITE = 'https://zetaone.github.io/XPPAUT-Web/'

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
])

/** @type {BrowserWindow | null} */
let win = null
/** files to open once the page is ready (Finder can send them before that) */
let pending = []
let pageReady = false
/** set when the app itself restarts the page (it already asked) */
let skipLeavePrompt = false

function serveSite() {
  protocol.handle('app', (req) => {
    const url = new URL(req.url)
    if (url.host !== HOST) return new Response('not found', { status: 404 })
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
    const file = normalize(join(SITE, rel))
    if (file !== SITE && !file.startsWith(SITE + sep)) return new Response('forbidden', { status: 403 })
    return net.fetch(pathToFileURL(file).toString())
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 640,
    minHeight: 480,
    title: 'XPPAUT',
    backgroundColor: '#ffffff',
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  })
  pageReady = false
  win.webContents.on('did-start-loading', () => (pageReady = false))
  win.webContents.on('did-finish-load', () => {
    pageReady = true
    skipLeavePrompt = false
    flushPending()
  })

  // pop-out XPP windows and the output window are pages of the app; web links
  // open in the browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`app://${HOST}/`) || url === 'about:blank' || url === '') {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } }
    }
    if (/^(https?|mailto):/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`app://${HOST}/`)) {
      e.preventDefault()
      if (/^(https?|mailto):/.test(url)) void shell.openExternal(url)
    }
  })

  // the page's "Leave page? XPP is running" warning: a browser asks, Electron
  // would just refuse to close, so ask here
  win.webContents.on('will-prevent-unload', (e) => {
    if (skipLeavePrompt) {
      skipLeavePrompt = false
      e.preventDefault()
      return
    }
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Leave', 'Stay'],
      defaultId: 1,
      cancelId: 1,
      message: 'XPP is still running.',
      detail: 'Leave anyway? Unsaved work in XPP is lost.',
    })
    if (choice === 0) e.preventDefault()
  })
  win.on('closed', () => (win = null))
  void win.loadURL(HOME)
}

/** start XPP with these files (an .ode plus any files it reads) */
async function openPaths(paths) {
  if (!paths.length) return
  if (!win) createWindow()
  pending = paths
  if (pageReady) await flushPending()
}

async function flushPending() {
  if (!win || !pageReady || !pending.length) return
  const paths = pending
  pending = []
  const running = await win.webContents.executeJavaScript('!!(window.xpp && window.xpp.running)').catch(() => false)
  if (running) {
    const name = basename(paths.find((p) => /\.ode$/i.test(p)) ?? paths[0])
    const choice = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Restart XPP', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: `Open ${name}?`,
      detail: 'XPP is running. Opening this model restarts it; unsaved work is lost.',
    })
    if (choice.response !== 0) return
    pending = paths
    skipLeavePrompt = true
    void win.loadURL(HOME) // did-finish-load opens them
    return
  }
  const files = paths.map((p) => ({ name: basename(p), b64: readFileSync(p).toString('base64') }))
  // the same way the page's own "Open .ode file…" button does it
  await win.webContents.executeJavaScript(`(() => {
    const files = ${JSON.stringify(files)}
    const input = document.getElementById('upload')
    if (!input) return false
    const dt = new DataTransfer()
    for (const f of files) dt.items.add(new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name))
    input.files = dt.files
    input.dispatchEvent(new Event('change'))
    return true
  })()`)
  if (win.isMinimized()) win.restore()
  win.focus()
}

async function openDialog() {
  const r = await dialog.showOpenDialog(win ?? undefined, {
    title: 'Open an XPP model',
    message: 'Pick the .ode file, plus any files it reads (tables, .set files)',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'XPP models', extensions: ['ode'] }, { name: 'All files', extensions: ['*'] }],
  })
  if (!r.canceled) await openPaths(r.filePaths)
}

function buildMenu() {
  const mac = process.platform === 'darwin'
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    ...(mac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open .ode file…', accelerator: 'CmdOrCtrl+O', click: () => void openDialog() },
        {
          label: 'Start page',
          click: () => win && void win.loadURL(HOME),
        },
        { type: 'separator' },
        mac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'XPPAUT-Web website', click: () => void shell.openExternal(WEBSITE) },
        { label: 'Report a problem', click: () => void shell.openExternal('https://github.com/ZetaOne/XPPAUT-Web/issues') },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// macOS: Finder "Open" / double-click / drop on the Dock icon; can come before 'ready'
app.on('open-file', (e, path) => {
  e.preventDefault()
  if (app.isReady()) void openPaths([path])
  else pending.push(path)
})

// one app instance: a second launch (Linux/Windows "open with") passes its files here
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const files = argv.slice(1).filter((a) => /\.ode$/i.test(a))
    if (files.length) void openPaths(files)
    else if (win) win.focus()
  })
  app.whenReady().then(() => {
    serveSite()
    buildMenu()
    if (process.platform !== 'darwin') {
      pending.push(...process.argv.slice(1).filter((a) => /\.ode$/i.test(a)))
    }
    createWindow()
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow()
    })
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
