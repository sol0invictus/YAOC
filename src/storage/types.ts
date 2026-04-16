export type FileKind = 'markdown' | 'image' | 'text' | 'pdf' | 'audio' | 'video' | 'binary'

export interface NoteRef {
  id: string        // stable unique ID (path or Drive file ID)
  path: string      // e.g. "folder/note.md"
  name: string      // display name (without .md for markdown files)
  lastModified: number  // epoch ms
  fileKind?: FileKind   // undefined → 'markdown' (backward compat)
}

export interface Note extends NoteRef {
  content: string
}

export interface SyncMeta {
  driveFileId?: string
  driveModifiedTime?: number   // epoch ms of last known Drive version
  driveContent?: string        // last synced content from Drive
}

export type SyncStatus = 'idle' | 'syncing' | 'conflict' | 'offline' | 'error'

export type SyncProviderType = 'gdrive' | 'onedrive'

export interface SyncAdapter {
  readonly syncType: SyncProviderType
  list(): Promise<NoteRef[]>
  read(id: string): Promise<Note>
  write(id: string, path: string, content: string): Promise<void>
  delete(id: string): Promise<void>
  getStartToken(): Promise<string>
  pollChanges(token: string): Promise<{ changedIds: string[]; nextToken: string }>
}

export interface Conflict {
  noteId: string
  localContent: string
  remoteContent: string
  basePath: string
  baseContent: string
}

export interface VaultAdapter {
  type: 'indexeddb' | 'local-fs' | 'gdrive' | 'electron-fs'
  list(): Promise<NoteRef[]>
  read(id: string): Promise<Note>
  write(id: string, path: string, content: string): Promise<void>
  delete(id: string): Promise<void>
  /** Read raw bytes — used for images, PDFs, etc. in LocalFS vaults. */
  readBlob?(id: string): Promise<{ blob: Blob; mimeType: string } | null>
  /** Write raw bytes to a path (creates parent dirs as needed). */
  writeBlob?(path: string, blob: Blob): Promise<void>
  watch?(cb: (changed: NoteRef[]) => void): () => void
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
