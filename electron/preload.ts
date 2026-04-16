import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  isElectron: true
  openFolder: () => Promise<string | null>
  readDir: (dirPath: string) => Promise<{ relativePath: string; isDir: boolean }[]>
  stat: (absPath: string) => Promise<{ mtime: number } | null>
  readFile: (absPath: string) => Promise<string>
  writeFile: (absPath: string, content: string) => Promise<void>
  deleteFile: (absPath: string) => Promise<void>
  readBlob: (absPath: string) => Promise<{ base64: string; mimeType: string }>
  writeBlob: (absPath: string, base64: string) => Promise<void>
  onMenuOpenFolder: (cb: () => void) => () => void
}

const api: ElectronAPI = {
  isElectron: true,

  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  readDir: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath),
  stat: (absPath) => ipcRenderer.invoke('fs:stat', absPath),
  readFile: (absPath) => ipcRenderer.invoke('fs:readFile', absPath),
  writeFile: (absPath, content) => ipcRenderer.invoke('fs:writeFile', absPath, content),
  deleteFile: (absPath) => ipcRenderer.invoke('fs:deleteFile', absPath),
  readBlob: (absPath) => ipcRenderer.invoke('fs:readBlob', absPath),
  writeBlob: (absPath, base64) => ipcRenderer.invoke('fs:writeBlob', absPath, base64),

  onMenuOpenFolder: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('menu:open-folder', handler)
    return () => ipcRenderer.removeListener('menu:open-folder', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
