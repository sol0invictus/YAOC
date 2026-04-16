import type { VaultAdapter, NoteRef, Note, FileKind } from './types'

// ── File-kind detection (mirrors LocalFSAdapter) ─────────────────────────────

const IMAGE_EXTS  = new Set(['png','jpg','jpeg','gif','svg','webp','bmp','ico','avif','tiff'])
const AUDIO_EXTS  = new Set(['mp3','wav','ogg','flac','aac','m4a','opus'])
const VIDEO_EXTS  = new Set(['mp4','webm','mov','mkv','avi','m4v'])
const PDF_EXTS    = new Set(['pdf'])
const TEXT_EXTS   = new Set([
  'txt','md','ts','tsx','js','jsx','json','yaml','yml','toml','css','scss',
  'html','xml','sh','bash','zsh','py','rs','go','rb','php','java','c','cpp',
  'h','hpp','cs','swift','kt','r','sql','lua','vim','ini','conf','env',
])

function fileKindFor(ext: string): FileKind {
  if (ext === 'md')            return 'markdown'
  if (IMAGE_EXTS.has(ext))    return 'image'
  if (AUDIO_EXTS.has(ext))    return 'audio'
  if (VIDEO_EXTS.has(ext))    return 'video'
  if (PDF_EXTS.has(ext))      return 'pdf'
  if (TEXT_EXTS.has(ext))     return 'text'
  return 'binary'
}

function nodePath(folderPath: string, relativePath: string): string {
  return `${folderPath}/${relativePath}`.replace(/\/+/g, '/')
}

function basename(p: string): string {
  return p.split('/').pop() ?? p
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.isElectron
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class ElectronFSAdapter implements VaultAdapter {
  readonly type = 'electron-fs' as const
  private api = window.electronAPI! as NonNullable<Window['electronAPI']>
  private _folderPath: string
  private _folderName: string

  constructor(folderPath: string) {
    this._folderPath = folderPath
    this._folderName = basename(folderPath)
  }

  get folderName(): string { return this._folderName }
  get folderPath(): string { return this._folderPath }

  static async open(): Promise<ElectronFSAdapter | null> {
    const path = await window.electronAPI!.openFolder()
    if (!path) return null
    return new ElectronFSAdapter(path)
  }

  async list(): Promise<NoteRef[]> {
    const entries = await this.api.readDir(this._folderPath)
    const refs: NoteRef[] = []
    for (const { relativePath, isDir } of entries) {
      if (isDir) continue
      const name = basename(relativePath)
      const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
      const kind = fileKindFor(ext)
      if (kind === 'binary') continue

      const absPath = nodePath(this._folderPath, relativePath)
      const stat = await this.api.stat(absPath)

      refs.push({
        id: relativePath,
        path: relativePath,
        name: kind === 'markdown' ? name.replace(/\.md$/, '') : name,
        lastModified: stat?.mtime ?? Date.now(),
        fileKind: kind,
      })
    }
    return refs.sort((a, b) => a.path.localeCompare(b.path))
  }

  async read(id: string): Promise<Note> {
    const absPath = nodePath(this._folderPath, id)
    const ext = id.includes('.') ? id.split('.').pop()!.toLowerCase() : ''
    const kind = fileKindFor(ext)
    const name = basename(id)
    const isBinary = kind === 'image' || kind === 'audio' || kind === 'video' || kind === 'pdf'
    const content = isBinary ? '' : await this.api.readFile(absPath)
    const stat = await this.api.stat(absPath)

    return {
      id,
      path: id,
      name: kind === 'markdown' ? name.replace(/\.md$/, '') : name,
      content,
      lastModified: stat?.mtime ?? Date.now(),
      fileKind: kind,
    }
  }

  async write(id: string, _path: string, content: string): Promise<void> {
    // Use id (which IS the relative path) rather than _path
    const absPath = nodePath(this._folderPath, id)
    await this.api.writeFile(absPath, content)
  }

  async delete(id: string): Promise<void> {
    const absPath = nodePath(this._folderPath, id)
    await this.api.deleteFile(absPath)
  }

  async readBlob(id: string): Promise<{ blob: Blob; mimeType: string } | null> {
    try {
      const absPath = nodePath(this._folderPath, id)
      const { base64, mimeType } = await this.api.readBlob(absPath)
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: mimeType })
      return { blob, mimeType }
    } catch {
      return null
    }
  }

  async writeBlob(relativePath: string, blob: Blob): Promise<void> {
    const absPath = nodePath(this._folderPath, relativePath)
    const buffer = await blob.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
    await this.api.writeBlob(absPath, base64)
  }
}
