import { db } from '../storage/db'
import type { SyncAdapter, Conflict, SyncStatus } from '../storage/types'
import { isSame, tryMerge } from './diff'

const SYNC_INTERVAL_MS = 30_000

type OnStatusChange = (status: SyncStatus) => void
type OnConflict = (conflict: Conflict) => void

export class SyncEngine {
  private adapter: SyncAdapter
  private pageToken = ''
  private intervalId: ReturnType<typeof setInterval> | null = null
  private onStatus: OnStatusChange
  private onConflict: OnConflict

  constructor(
    adapter: SyncAdapter,
    onStatus: OnStatusChange,
    onConflict: OnConflict,
  ) {
    this.adapter = adapter
    this.onStatus = onStatus
    this.onConflict = onConflict
  }

  async start(): Promise<void> {
    this.pageToken = await this.adapter.getStartToken()
    await this.sync()
    this.intervalId = setInterval(() => this.sync(), SYNC_INTERVAL_MS)
    window.addEventListener('online', () => this.flushOfflineQueue())
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId)
  }

  async sync(): Promise<void> {
    if (!navigator.onLine) {
      this.onStatus('offline')
      return
    }
    this.onStatus('syncing')
    try {
      await this.pushDirtyNotes()
      await this.pullRemoteChanges()
      this.onStatus('idle')
    } catch (e) {
      console.error('[sync]', e)
      this.onStatus('error')
    }
  }

  private async pushDirtyNotes(): Promise<void> {
    const dirty = await db.notes.where('dirty').equals(1).toArray()
    for (const note of dirty) {
      const meta = await db.syncMeta.get(note.id)
      const driveId = meta?.driveFileId ?? `new-${note.id}`
      await this.adapter.write(driveId, note.path, note.content)

      // After successful upload, fetch remote metadata to store modifiedTime
      const remoteList = await this.adapter.list()
      const remote = remoteList.find((r) => r.path === note.path)
      if (remote) {
        await db.syncMeta.put({
          noteId: note.id,
          driveFileId: remote.id,
          driveModifiedTime: remote.lastModified,
          driveContent: note.content,
        })
      }
      await db.notes.update(note.id, { dirty: false })
    }
  }

  private async pullRemoteChanges(): Promise<void> {
    const { changedIds, nextToken } = await this.adapter.pollChanges(this.pageToken)
    this.pageToken = nextToken

    for (const driveId of changedIds) {
      const meta = await db.syncMeta.where('driveFileId').equals(driveId).first()

      const remoteNote = await this.adapter.read(driveId)

      if (!meta) {
        // Brand new note from remote — just save it
        const id = `drive-${driveId}`
        await db.notes.put({
          id,
          path: remoteNote.path,
          name: remoteNote.name,
          content: remoteNote.content,
          lastModified: remoteNote.lastModified,
          dirty: false,
        })
        await db.syncMeta.put({
          noteId: id,
          driveFileId: driveId,
          driveModifiedTime: remoteNote.lastModified,
          driveContent: remoteNote.content,
        })
        continue
      }

      const localNote = await db.notes.get(meta.noteId)
      if (!localNote) continue

      const base = meta.driveContent ?? ''
      const isSameRemote = isSame(remoteNote.content, base)
      const isSameLocal = isSame(localNote.content, base)

      if (isSameRemote) continue  // Remote unchanged

      if (isSameLocal) {
        // Only remote changed — fast-forward
        await db.notes.update(meta.noteId, {
          content: remoteNote.content,
          lastModified: remoteNote.lastModified,
          dirty: false,
        })
        await db.syncMeta.update(meta.noteId, {
          driveModifiedTime: remoteNote.lastModified,
          driveContent: remoteNote.content,
        })
        continue
      }

      // Both changed — try auto-merge
      const merged = tryMerge(base, localNote.content, remoteNote.content)
      if (merged !== null) {
        await db.notes.update(meta.noteId, {
          content: merged,
          dirty: true,
        })
        continue
      }

      // Conflict — surface to UI
      this.onStatus('conflict')
      this.onConflict({
        noteId: meta.noteId,
        localContent: localNote.content,
        remoteContent: remoteNote.content,
        basePath: localNote.path,
        baseContent: base,
      })
    }
  }

  async resolveConflict(noteId: string, resolvedContent: string): Promise<void> {
    await db.notes.update(noteId, { content: resolvedContent, dirty: true })
    await this.sync()
  }

  private async flushOfflineQueue(): Promise<void> {
    const queued = await db.offlineQueue.orderBy('timestamp').toArray()
    for (const item of queued) {
      try {
        await db.notes.update(item.noteId, { content: item.content, dirty: true })
        await db.offlineQueue.delete(item.id!)
      } catch {
        // leave in queue for next attempt
      }
    }
    await this.sync()
  }
}
