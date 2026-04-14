import Dexie, { type Table } from 'dexie'
import type { Note, SyncMeta } from './types'

export interface DBNote extends Note {
  dirty: boolean  // needs sync to Drive
}

export interface DBSyncMeta extends SyncMeta {
  noteId: string
}

export interface DBOfflineWrite {
  id?: number
  noteId: string
  path: string
  content: string
  timestamp: number
}

export interface DBLink {
  id?: number
  sourceNoteId: string
  targetName: string
}

export interface DBTag {
  id?: number
  noteId: string
  tag: string
}

export interface DBAttachment {
  id: string
  blob: Blob
  mimeType: string
  name: string
  originalName?: string   // original filename as given by the user/paste
  createdAt: number
}

export class NotesDB extends Dexie {
  notes!: Table<DBNote>
  syncMeta!: Table<DBSyncMeta>
  offlineQueue!: Table<DBOfflineWrite>
  links!: Table<DBLink>
  tags!: Table<DBTag>
  attachments!: Table<DBAttachment>

  constructor() {
    super('yaoa-notes')
    this.version(1).stores({
      notes: 'id, path, lastModified, dirty',
      syncMeta: 'noteId',
      offlineQueue: '++id, noteId, timestamp',
    })
    this.version(2).stores({
      notes: 'id, path, lastModified, dirty',
      syncMeta: 'noteId',
      offlineQueue: '++id, noteId, timestamp',
      links: '++id, sourceNoteId, targetName',
      tags: '++id, noteId, tag',
    })
    this.version(3).stores({
      notes: 'id, path, lastModified, dirty',
      syncMeta: 'noteId',
      offlineQueue: '++id, noteId, timestamp',
      links: '++id, sourceNoteId, targetName',
      tags: '++id, noteId, tag',
      attachments: 'id, createdAt',
    })
    this.version(4).stores({
      notes: 'id, path, lastModified, dirty',
      syncMeta: 'noteId',
      offlineQueue: '++id, noteId, timestamp',
      links: '++id, sourceNoteId, targetName',
      tags: '++id, noteId, tag',
      attachments: 'id, createdAt, originalName',
    })
  }
}

export const db = new NotesDB()
