import type { VaultAdapter, NoteRef, Note, FileKind } from './types'

// ── File-kind detection ──────────────────────────────────────────────────────

const IMAGE_EXTS  = new Set(['png','jpg','jpeg','gif','svg','webp','bmp','ico','avif','tiff'])
const AUDIO_EXTS  = new Set(['mp3','wav','ogg','flac','aac','m4a','opus'])
const VIDEO_EXTS  = new Set(['mp4','webm','mov','mkv','avi','m4v'])
const PDF_EXTS    = new Set(['pdf'])
const TEXT_EXTS   = new Set([
  'txt','md','ts','tsx','js','jsx','json','yaml','yml','toml','css','scss',
  'html','xml','sh','bash','zsh','py','rs','go','rb','php','java','c','cpp',
  'h','hpp','cs','swift','kt','r','sql','lua','vim','ini','conf','env',
])

function mimeFor(ext: string): string {
  if (IMAGE_EXTS.has(ext)) {
    const map: Record<string, string> = {
      png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
      gif:'image/gif', svg:'image/svg+xml', webp:'image/webp',
      bmp:'image/bmp', ico:'image/x-icon', avif:'image/avif', tiff:'image/tiff',
    }
    return map[ext] ?? 'image/png'
  }
  if (AUDIO_EXTS.has(ext)) return ext === 'mp3' ? 'audio/mpeg' : `audio/${ext}`
  if (VIDEO_EXTS.has(ext)) return ext === 'mp4' ? 'video/mp4' : `video/${ext}`
  if (PDF_EXTS.has(ext))   return 'application/pdf'
  return 'text/plain'
}

function fileKindFor(ext: string): FileKind {
  if (ext === 'md')            return 'markdown'
  if (IMAGE_EXTS.has(ext))    return 'image'
  if (AUDIO_EXTS.has(ext))    return 'audio'
  if (VIDEO_EXTS.has(ext))    return 'video'
  if (PDF_EXTS.has(ext))      return 'pdf'
  if (TEXT_EXTS.has(ext))     return 'text'
  return 'binary'
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class LocalFSAdapter implements VaultAdapter {
  readonly type = 'local-fs' as const
  private dirHandle: FileSystemDirectoryHandle
  private cache = new Map<string, FileSystemFileHandle>()

  constructor(dirHandle: FileSystemDirectoryHandle) {
    this.dirHandle = dirHandle
  }

  get folderName(): string {
    return this.dirHandle.name
  }

  static async open(): Promise<LocalFSAdapter> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' }) as FileSystemDirectoryHandle
    return new LocalFSAdapter(handle)
  }

  async list(): Promise<NoteRef[]> {
    const refs: NoteRef[] = []
    await this.walkDir(this.dirHandle, '', refs)
    return refs.sort((a, b) => a.path.localeCompare(b.path))
  }

  private async walkDir(
    dir: FileSystemDirectoryHandle,
    prefix: string,
    refs: NoteRef[],
  ): Promise<void> {
    for await (const [name, handle] of dir) {
      if (name.startsWith('.')) continue  // skip hidden entries

      if (handle.kind === 'directory') {
        await this.walkDir(handle as FileSystemDirectoryHandle, `${prefix}${name}/`, refs)
      } else {
        const fh = handle as FileSystemFileHandle
        const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
        const kind = fileKindFor(ext)

        // Skip binary files we can't do anything useful with
        if (kind === 'binary') continue

        const file = await fh.getFile()
        const path = `${prefix}${name}`
        const id = path
        this.cache.set(id, fh)

        refs.push({
          id,
          path,
          // For markdown, strip extension from display name
          name: kind === 'markdown' ? name.replace(/\.md$/, '') : name,
          lastModified: file.lastModified,
          fileKind: kind,
        })
      }
    }
  }

  async read(id: string): Promise<Note> {
    const fh = await this._getHandle(id)
    const file = await fh.getFile()
    const ext = id.includes('.') ? id.split('.').pop()!.toLowerCase() : ''
    const kind = fileKindFor(ext)
    // For binary-ish files, return empty content — use readBlob() instead
    const content = (kind === 'image' || kind === 'audio' || kind === 'video' || kind === 'pdf')
      ? ''
      : await file.text()
    return {
      id,
      path: id,
      name: kind === 'markdown' ? id.replace(/^.*\//, '').replace(/\.md$/, '') : id.replace(/^.*\//, ''),
      content,
      lastModified: file.lastModified,
      fileKind: kind,
    }
  }

  async readBlob(id: string): Promise<{ blob: Blob; mimeType: string } | null> {
    try {
      const fh = await this._getHandle(id)
      const file = await fh.getFile()
      const ext = id.includes('.') ? id.split('.').pop()!.toLowerCase() : ''
      return { blob: file, mimeType: mimeFor(ext) }
    } catch {
      return null
    }
  }

  async write(id: string, path: string, content: string): Promise<void> {
    const parts = path.split('/')
    const filename = parts.pop()!
    let dir = this.dirHandle
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create: true })
    }
    const fh = await dir.getFileHandle(filename, { create: true })
    this.cache.set(id, fh)
    const writable = await fh.createWritable()
    await writable.write(content)
    await writable.close()
  }

  async delete(id: string): Promise<void> {
    const fh = this.cache.get(id)
    if (!fh) return
    const parts = id.split('/')
    parts.pop()
    let dir = this.dirHandle
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part)
    }
    await dir.removeEntry(fh.name)
    this.cache.delete(id)
  }

  private async _getHandle(id: string): Promise<FileSystemFileHandle> {
    let fh = this.cache.get(id)
    if (!fh) {
      await this.list()  // re-walk to populate cache
      fh = this.cache.get(id)
    }
    if (!fh) throw new Error(`File not found: ${id}`)
    return fh
  }
}
