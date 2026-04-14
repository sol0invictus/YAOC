import type { VaultAdapter, NoteRef, Note } from './types'

export class LocalFSAdapter implements VaultAdapter {
  readonly type = 'local-fs' as const
  private dirHandle: FileSystemDirectoryHandle
  private cache = new Map<string, FileSystemFileHandle>()

  constructor(dirHandle: FileSystemDirectoryHandle) {
    this.dirHandle = dirHandle
  }

  static async open(): Promise<LocalFSAdapter> {
    // showDirectoryPicker is a Chrome/Edge-only API (File System Access)
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
      if (handle.kind === 'directory') {
        if (!name.startsWith('.')) {
          await this.walkDir(handle as FileSystemDirectoryHandle, `${prefix}${name}/`, refs)
        }
      } else if (name.endsWith('.md')) {
        const file = await (handle as FileSystemFileHandle).getFile()
        const path = `${prefix}${name}`
        const id = path
        this.cache.set(id, handle as FileSystemFileHandle)
        refs.push({
          id,
          path,
          name: name.replace(/\.md$/, ''),
          lastModified: file.lastModified,
        })
      }
    }
  }

  async read(id: string): Promise<Note> {
    let fh = this.cache.get(id)
    if (!fh) {
      // re-walk to find it
      await this.list()
      fh = this.cache.get(id)
    }
    if (!fh) throw new Error(`File not found: ${id}`)
    const file = await fh.getFile()
    const content = await file.text()
    return {
      id,
      path: id,
      name: id.replace(/^.*\//, '').replace(/\.md$/, ''),
      content,
      lastModified: file.lastModified,
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
}
