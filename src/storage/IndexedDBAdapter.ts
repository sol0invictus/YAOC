import type { VaultAdapter, NoteRef, Note } from './types'
import { NotesDB, db as defaultDb } from './db'

export class IndexedDBAdapter implements VaultAdapter {
  readonly type = 'indexeddb' as const
  private db: NotesDB

  constructor(vaultDb: NotesDB = defaultDb) {
    this.db = vaultDb
  }

  async list(): Promise<NoteRef[]> {
    const notes = await this.db.notes.orderBy('lastModified').reverse().toArray()
    return notes.map(({ id, path, name, lastModified }) => ({ id, path, name, lastModified }))
  }

  async read(id: string): Promise<Note> {
    const note = await this.db.notes.get(id)
    if (!note) throw new Error(`Note not found: ${id}`)
    return note
  }

  async write(id: string, path: string, content: string): Promise<void> {
    const name = path.replace(/^.*\//, '').replace(/\.md$/, '')
    await this.db.notes.put({
      id,
      path,
      name,
      content,
      lastModified: Date.now(),
      dirty: true,
    })
  }

  async delete(id: string): Promise<void> {
    await this.db.notes.delete(id)
    await this.db.syncMeta.delete(id)
  }
}
