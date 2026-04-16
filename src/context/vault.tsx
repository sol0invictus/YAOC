/**
 * VaultContext — provides the active vault's adapter, DB, and all note
 * operations to the component tree.  Components call useVault() to access
 * these; AppShell wraps everything in <VaultProvider>.
 *
 * Using a context (instead of each component calling useVault() independently)
 * means every component shares the same notes list and a single refresh cycle.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import type { VaultAdapter, NoteRef, Note } from '../storage/types'
import { type NotesDB, db as defaultDb } from '../storage/db'
import { nanoid } from '../util/nanoid'
import { indexNote } from '../utils/linkIndex'
// (indexNote is also used by renameNote for updating wikilinks)

// Blob URL cache — lives at module scope so it survives vault switches
// (avoids duplicate object URLs for the same attachment ID).
const blobUrlCache = new Map<string, string>()

// ── Context value type ──────────────────────────────────────────────────────

export interface VaultContextValue {
  adapter: VaultAdapter
  vaultDb: NotesDB
  notes: NoteRef[]
  loading: boolean
  localFolderName: string | null
  noteAliases: Set<string>
  refresh: () => Promise<void>
  createNote: (name: string, folderPath?: string) => Promise<Note>
  saveNote: (id: string, path: string, content: string) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  renameNote: (id: string, newName: string) => Promise<void>
  readNote: (id: string) => Promise<Note>
  findNoteByName: (name: string) => Promise<NoteRef | undefined>
  saveAttachment: (blob: Blob, fileName: string) => Promise<string>
  getAttachmentUrl: (uri: string) => Promise<string | null>
  getAttachmentByName: (fileName: string) => Promise<string | null>
  importFromDrive: (note: Note) => Promise<void>
}

export const VaultContext = createContext<VaultContextValue | null>(null)

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext)
  if (!ctx) throw new Error('useVault must be used inside <VaultProvider>')
  return ctx
}

// ── Provider ────────────────────────────────────────────────────────────────

interface VaultProviderProps {
  adapter: VaultAdapter
  vaultDb: NotesDB
  localFolderName: string | null
  children: ReactNode
}

export function VaultProvider({
  adapter,
  vaultDb,
  localFolderName,
  children,
}: VaultProviderProps) {
  const [notes, setNotes] = useState<NoteRef[]>([])
  const [loading, setLoading] = useState(false)
  const [noteAliases, setNoteAliases] = useState<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await adapter.list()
      setNotes(list)
      const aliasRows = await vaultDb.aliases.toArray()
      setNoteAliases(new Set(aliasRows.map((a) => a.alias.toLowerCase())))
    } finally {
      setLoading(false)
    }
  }, [adapter, vaultDb])

  // Load notes whenever the adapter changes (vault switch or initial mount)
  useEffect(() => {
    refresh()
  }, [refresh])

  // ── Note CRUD ─────────────────────────────────────────────────────────────

  const createNote = useCallback(
    async (name: string, folderPath?: string): Promise<Note> => {
      const id = nanoid()
      const filename = name.endsWith('.md') ? name : `${name}.md`
      const path = folderPath ? `${folderPath}/${filename}` : filename
      const content = `# ${name.replace(/\.md$/, '')}\n\n`
      await adapter.write(id, path, content)
      await indexNote(id, content, vaultDb)
      await refresh()
      return adapter.read(id)
    },
    [adapter, vaultDb, refresh],
  )

  const saveNote = useCallback(
    async (id: string, path: string, content: string) => {
      await adapter.write(id, path, content)
      await indexNote(id, content, vaultDb)
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, lastModified: Date.now() } : n)),
      )
    },
    [adapter, vaultDb],
  )

  const deleteNote = useCallback(
    async (id: string) => {
      await adapter.delete(id)
      await vaultDb.links.where('sourceNoteId').equals(id).delete()
      await vaultDb.tags.where('noteId').equals(id).delete()
      await refresh()
    },
    [adapter, vaultDb, refresh],
  )

  const readNote = useCallback(
    (id: string): Promise<Note> => adapter.read(id),
    [adapter],
  )

  const renameNote = useCallback(
    async (id: string, newName: string) => {
      const note = await adapter.read(id)
      const oldName = note.name
      const folderPrefix = note.path.includes('/')
        ? note.path.substring(0, note.path.lastIndexOf('/') + 1)
        : ''
      const newPath =
        folderPrefix + (newName.endsWith('.md') ? newName : `${newName}.md`)
      await adapter.write(id, newPath, note.content)

      // Update [[OldName]] wikilinks in all other notes
      if (oldName !== newName) {
        const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const wikilinkRe = new RegExp(`\\[\\[${escaped}(\\]\\]|#|\\|)`, 'gi')
        const allNotes = await adapter.list()
        for (const ref of allNotes) {
          if (ref.id === id) continue
          try {
            const other = await adapter.read(ref.id)
            if (!wikilinkRe.test(other.content)) continue
            wikilinkRe.lastIndex = 0
            const updated = other.content.replace(wikilinkRe, `[[${newName}$1`)
            await adapter.write(ref.id, other.path, updated)
            await indexNote(ref.id, updated, vaultDb)
          } catch {
            // skip notes that can't be read
          }
        }
      }

      await refresh()
    },
    [adapter, vaultDb, refresh],
  )

  const findNoteByName = useCallback(
    async (name: string): Promise<NoteRef | undefined> => {
      const lower = name.toLowerCase()
      // Direct name/path match
      const direct = notes.find(
        (n) =>
          n.name.toLowerCase() === lower ||
          n.path.toLowerCase() === `${lower}.md` ||
          n.path.toLowerCase().endsWith(`/${lower}.md`),
      )
      if (direct) return direct
      // Alias lookup
      const aliasRow = await vaultDb.aliases
        .filter((a) => a.alias.toLowerCase() === lower)
        .first()
      if (aliasRow) return notes.find((n) => n.id === aliasRow.noteId)
      return undefined
    },
    [notes, vaultDb],
  )

  // ── Attachments ───────────────────────────────────────────────────────────

  /**
   * Save a pasted/dropped media blob into the vault's `images/` subfolder.
   *
   * - LocalFS vaults: writes a real file to disk via adapter.writeBlob.
   * - IndexedDB vaults: stores the blob in the attachments table keyed by path.
   *
   * Returns a vault-relative path like `images/abc123.png` which is embedded
   * directly in markdown as `![image](images/abc123.png)`.
   */
  const saveAttachment = useCallback(
    async (blob: Blob, fileName: string): Promise<string> => {
      const ext = (blob.type.split('/')[1] ?? fileName.split('.').pop() ?? 'png')
        .replace('jpeg', 'jpg')
      const id = nanoid()
      const path = `images/${id}.${ext}`

      if (adapter.writeBlob) {
        // LocalFS: write to disk; IndexedDB: write to attachments table
        await adapter.writeBlob(path, blob)
      } else {
        // Fallback for adapters that don't implement writeBlob (GDrive etc.)
        await defaultDb.attachments.put({
          id,
          blob,
          mimeType: blob.type || `image/${ext}`,
          name: `${id}.${ext}`,
          originalName: fileName,
          createdAt: Date.now(),
        })
        return `yaoa://attachments/${id}.${ext}`
      }

      return path
    },
    [adapter],
  )

  /**
   * Resolve any image reference to a blob URL.
   * Handles:
   *   - New relative paths:  "images/abc.png"
   *   - Legacy URIs:         "yaoa://attachments/abc"
   */
  const getAttachmentUrl = useCallback(async (uri: string): Promise<string | null> => {
    // ── Legacy yaoa:// URIs ───────────────────────────────────────────────
    if (uri.startsWith('yaoa://attachments/')) {
      const m = uri.match(/^yaoa:\/\/attachments\/([^.]+)/)
      if (!m) return null
      const id = m[1]
      if (blobUrlCache.has(id)) return blobUrlCache.get(id)!
      const att = await defaultDb.attachments.get(id)
      if (!att) return null
      const url = URL.createObjectURL(att.blob)
      blobUrlCache.set(id, url)
      return url
    }

    // ── Relative paths (images/abc.png, etc.) ────────────────────────────
    const cacheKey = `rel:${uri}`
    if (blobUrlCache.has(cacheKey)) return blobUrlCache.get(cacheKey)!

    // For LocalFS: read the real file from disk
    if (adapter.readBlob) {
      const result = await adapter.readBlob(uri)
      if (result) {
        const url = URL.createObjectURL(result.blob)
        blobUrlCache.set(cacheKey, url)
        return url
      }
    }

    // For IndexedDB: look up the blob stored by path
    const att = await vaultDb.attachments.get(uri)
    if (!att) return null
    const url = URL.createObjectURL(att.blob)
    blobUrlCache.set(cacheKey, url)
    return url
  }, [adapter, vaultDb])

  const getAttachmentByName = useCallback(
    async (fileName: string): Promise<string | null> => {
      // Try path-based lookup first (new style: images/abc.png)
      const pathKey = `images/${fileName}`
      const cacheKey = `rel:${pathKey}`
      if (blobUrlCache.has(cacheKey)) return blobUrlCache.get(cacheKey)!

      if (adapter.readBlob) {
        const result = await adapter.readBlob(pathKey)
        if (result) {
          const url = URL.createObjectURL(result.blob)
          blobUrlCache.set(cacheKey, url)
          return url
        }
      }

      // Fall back to legacy originalName search in attachments table
      const byOriginal = await defaultDb.attachments
        .where('originalName')
        .equals(fileName)
        .first()
      if (byOriginal) {
        if (blobUrlCache.has(byOriginal.id)) return blobUrlCache.get(byOriginal.id)!
        const url = URL.createObjectURL(byOriginal.blob)
        blobUrlCache.set(byOriginal.id, url)
        return url
      }
      const all = await defaultDb.attachments.toArray()
      const lower = fileName.toLowerCase()
      const match = all.find(
        (a) => a.originalName?.toLowerCase() === lower || a.name.toLowerCase() === lower,
      )
      if (!match) return null
      if (blobUrlCache.has(match.id)) return blobUrlCache.get(match.id)!
      const url = URL.createObjectURL(match.blob)
      blobUrlCache.set(match.id, url)
      return url
    },
    [adapter],
  )

  // ── Drive import ──────────────────────────────────────────────────────────

  const importFromDrive = useCallback(
    async (driveNote: Note) => {
      await vaultDb.notes.put({
        id: driveNote.id,
        path: driveNote.path,
        name: driveNote.name,
        content: driveNote.content,
        lastModified: driveNote.lastModified,
        dirty: false,
      })
      await indexNote(driveNote.id, driveNote.content, vaultDb)
      setNotes((prev) => {
        const existing = prev.find((n) => n.id === driveNote.id)
        if (existing) {
          return prev.map((n) =>
            n.id === driveNote.id
              ? { ...n, lastModified: driveNote.lastModified }
              : n,
          )
        }
        return [
          ...prev,
          {
            id: driveNote.id,
            path: driveNote.path,
            name: driveNote.name,
            lastModified: driveNote.lastModified,
          },
        ]
      })
    },
    [vaultDb],
  )

  // ── Assemble context value ────────────────────────────────────────────────

  const value: VaultContextValue = {
    adapter,
    vaultDb,
    notes,
    loading,
    localFolderName,
    noteAliases,
    refresh,
    createNote,
    saveNote,
    deleteNote,
    renameNote,
    readNote,
    findNoteByName,
    saveAttachment,
    getAttachmentUrl,
    getAttachmentByName,
    importFromDrive,
  }

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}
