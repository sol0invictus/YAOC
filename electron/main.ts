import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Built dist files: renderer is in dist/, main/preload are in dist-electron/
const DIST_ELECTRON = path.join(__dirname)
const DIST = path.join(__dirname, '../dist')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.DIST = DIST
process.env.DIST_ELECTRON = DIST_ELECTRON

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(DIST_ELECTRON, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#1e1e2e',
    show: false,
  })

  win.once('ready-to-show', () => win!.show())

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(DIST, 'index.html'))
  }
}

// ── Application menu ──────────────────────────────────────────────────────────

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+O', click: () => win?.webContents.send('menu:open-folder') },
        { type: 'separator' },
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Learn More', click: () => shell.openExternal('https://github.com/') },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('fs:readDir', async (_event, dirPath: string) => {
  async function walk(dir: string, base: string): Promise<{ relativePath: string; isDir: boolean }[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const results: { relativePath: string; isDir: boolean }[] = []
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      const rel = path.relative(base, full)
      if (entry.isDirectory()) {
        results.push({ relativePath: rel, isDir: true })
        const children = await walk(full, base)
        results.push(...children)
      } else {
        results.push({ relativePath: rel, isDir: false })
      }
    }
    return results
  }
  return walk(dirPath, dirPath)
})

ipcMain.handle('fs:stat', async (_event, absPath: string) => {
  try {
    const s = await fs.stat(absPath)
    return { mtime: s.mtimeMs }
  } catch {
    return null
  }
})

ipcMain.handle('fs:readFile', async (_event, absPath: string) => {
  const content = await fs.readFile(absPath, 'utf8')
  return content
})

ipcMain.handle('fs:writeFile', async (_event, absPath: string, content: string) => {
  await fs.mkdir(path.dirname(absPath), { recursive: true })
  await fs.writeFile(absPath, content, 'utf8')
})

ipcMain.handle('fs:deleteFile', async (_event, absPath: string) => {
  await fs.rm(absPath, { force: true })
})

ipcMain.handle('fs:readBlob', async (_event, absPath: string) => {
  const buf = await fs.readFile(absPath)
  // Return as base64 + mimetype
  const ext = path.extname(absPath).toLowerCase().slice(1)
  const mimeMap: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
    m4a: 'audio/mp4', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    pdf: 'application/pdf',
  }
  const mimeType = mimeMap[ext] ?? 'application/octet-stream'
  return { base64: buf.toString('base64'), mimeType }
})

ipcMain.handle('fs:writeBlob', async (_event, absPath: string, base64: string) => {
  await fs.mkdir(path.dirname(absPath), { recursive: true })
  await fs.writeFile(absPath, Buffer.from(base64, 'base64'))
})

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
