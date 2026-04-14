import { useState, useCallback, useRef } from 'react'
import type { VaultAdapter, NoteRef, Note } from '../storage/types'
import { IndexedDBAdapter } from '../storage/IndexedDBAdapter'
import { LocalFSAdapter } from '../storage/LocalFSAdapter'
import { db } from '../storage/db'
import { nanoid } from '../util/nanoid'
import { indexNote } from '../utils/linkIndex'

const idbAdapter = new IndexedDBAdapter()

// Cache blob URLs so we don't create duplicates
const blobUrlCache = new Map<string, string>()

export function useVault() {
  const [adapter, setAdapter] = useState<VaultAdapter>(idbAdapter)
  const [notes, setNotes] = useState<NoteRef[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (a: VaultAdapter = adapter) => {
    setLoading(true)
    try {
      const list = await a.list()
      setNotes(list)
    } finally {
      setLoading(false)
    }
  }, [adapter])

  const openLocalFolder = useCallback(async () => {
    if (typeof (window as any).showDirectoryPicker !== 'function') {
      console.warn('File System Access API is not available in this environment')
      return
    }
    const fsAdapter = await LocalFSAdapter.open()
    setAdapter(fsAdapter)
    await refresh(fsAdapter)
  }, [refresh])

  const createNote = useCallback(
    async (name: string): Promise<Note> => {
      const id = nanoid()
      const path = name.endsWith('.md') ? name : `${name}.md`
      const content = `# ${name.replace(/\.md$/, '')}\n\n`
      await adapter.write(id, path, content)
      await indexNote(id, content)
      await refresh()
      const note = await adapter.read(id)
      return note
    },
    [adapter, refresh],
  )

  const saveNote = useCallback(
    async (id: string, path: string, content: string) => {
      await adapter.write(id, path, content)
      await indexNote(id, content)
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, lastModified: Date.now() } : n)),
      )
    },
    [adapter],
  )

  const deleteNote = useCallback(
    async (id: string) => {
      await adapter.delete(id)
      await db.links.where('sourceNoteId').equals(id).delete()
      await db.tags.where('noteId').equals(id).delete()
      await refresh()
    },
    [adapter, refresh],
  )

  const readNote = useCallback(
    (id: string): Promise<Note> => adapter.read(id),
    [adapter],
  )

  const findNoteByName = useCallback(
    (name: string): NoteRef | undefined => {
      const lower = name.toLowerCase()
      return notes.find(
        (n) => n.name.toLowerCase() === lower ||
               n.path.toLowerCase() === `${lower}.md` ||
               n.path.toLowerCase().endsWith(`/${lower}.md`),
      )
    },
    [notes],
  )

  /** Save an image blob as an attachment. Returns the yaoa:// URI to embed. */
  const saveAttachment = useCallback(async (blob: Blob, fileName: string): Promise<string> => {
    const id = nanoid()
    const ext = fileName.split('.').pop() || 'png'
    const name = `${id}.${ext}`
    await db.attachments.put({
      id,
      blob,
      mimeType: blob.type || 'image/png',
      name,
      originalName: fileName,
      createdAt: Date.now(),
    })
    return `yaoa://attachments/${id}.${ext}`
  }, [])

  /** Resolve a vault media filename (e.g. "photo.png") to a blob URL, or null if not found. */
  const getAttachmentByName = useCallback(async (fileName: string): Promise<string | null> => {
    // First try exact originalName match
    const byOriginal = await db.attachments.where('originalName').equals(fileName).first()
    if (byOriginal) {
      if (blobUrlCache.has(byOriginal.id)) return blobUrlCache.get(byOriginal.id)!
      const url = URL.createObjectURL(byOriginal.blob)
      blobUrlCache.set(byOriginal.id, url)
      return url
    }
    // Fallback: case-insensitive search across all attachments
    const all = await db.attachments.toArray()
    const lower = fileName.toLowerCase()
    const match = all.find(
      (a) =>
        a.originalName?.toLowerCase() === lower ||
        a.name.toLowerCase() === lower,
    )
    if (!match) return null
    if (blobUrlCache.has(match.id)) return blobUrlCache.get(match.id)!
    const url = URL.createObjectURL(match.blob)
    blobUrlCache.set(match.id, url)
    return url
  }, [])

  /** Resolve a yaoa://attachments/ID.ext URI to a blob URL for rendering. */
  const getAttachmentUrl = useCallback(async (uri: string): Promise<string | null> => {
    const match = uri.match(/^yaoa:\/\/attachments\/([^.]+)/)
    if (!match) return null
    const id = match[1]

    if (blobUrlCache.has(id)) return blobUrlCache.get(id)!

    const att = await db.attachments.get(id)
    if (!att) return null

    const url = URL.createObjectURL(att.blob)
    blobUrlCache.set(id, url)
    return url
  }, [])

  const importFromDrive = useCallback(async (driveNote: Note) => {
    await db.notes.put({
      id: driveNote.id,
      path: driveNote.path,
      name: driveNote.name,
      content: driveNote.content,
      lastModified: driveNote.lastModified,
      dirty: false,
    })
    await indexNote(driveNote.id, driveNote.content)
    setNotes((prev) => {
      const existing = prev.find((n) => n.id === driveNote.id)
      if (existing) {
        return prev.map((n) =>
          n.id === driveNote.id ? { ...n, lastModified: driveNote.lastModified } : n,
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
  }, [])

  const renameNote = useCallback(
    async (id: string, newName: string) => {
      const note = await adapter.read(id)
      const folderPrefix = note.path.includes('/')
        ? note.path.substring(0, note.path.lastIndexOf('/') + 1)
        : ''
      const newPath = folderPrefix + (newName.endsWith('.md') ? newName : `${newName}.md`)
      await adapter.write(id, newPath, note.content)
      await refresh()
    },
    [adapter, refresh],
  )

  return {
    adapter,
    notes,
    loading,
    refresh,
    openLocalFolder,
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
}
