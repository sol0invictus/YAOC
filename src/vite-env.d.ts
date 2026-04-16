/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GDRIVE_CLIENT_ID: string
  readonly VITE_ONEDRIVE_CLIENT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Electron contextBridge API — available only when running inside Electron
interface Window {
  electronAPI?: {
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
}
