import { useState, useRef, useCallback } from 'react'
import { GDriveAdapter } from '../storage/GDriveAdapter'
import { OneDriveAdapter } from '../storage/OneDriveAdapter'
import { SyncEngine } from '../sync/engine'
import { isSignedIn as isGDriveSignedIn, signIn as gdriveSignIn, signOut as gdriveSignOut } from '../auth/gdrive'
import { isSignedInToOneDrive, signInToOneDrive, signOutFromOneDrive } from '../auth/onedrive'
import type { Conflict, SyncStatus, SyncProviderType } from '../storage/types'

export function useSync() {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [signedIn, setSignedIn] = useState(() => isGDriveSignedIn() || isSignedInToOneDrive())
  const [provider, setProvider] = useState<SyncProviderType | null>(() =>
    isGDriveSignedIn() ? 'gdrive' : isSignedInToOneDrive() ? 'onedrive' : null
  )
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const engineRef = useRef<SyncEngine | null>(null)

  const startSync = useCallback(async (p: SyncProviderType) => {
    const adapter = p === 'gdrive' ? new GDriveAdapter() : new OneDriveAdapter()
    const engine = new SyncEngine(
      adapter,
      setStatus,
      (conflict) => setConflicts((prev) => [...prev, conflict]),
    )
    engineRef.current = engine
    await engine.start()
  }, [])

  const handleSignIn = useCallback(async (p: SyncProviderType) => {
    if (p === 'gdrive') {
      await gdriveSignIn()
    } else {
      await signInToOneDrive()
    }
    setSignedIn(true)
    setProvider(p)
    await startSync(p)
  }, [startSync])

  const handleSignOut = useCallback(() => {
    if (provider === 'gdrive') {
      gdriveSignOut()
    } else if (provider === 'onedrive') {
      signOutFromOneDrive()
    }
    setSignedIn(false)
    setProvider(null)
    engineRef.current?.stop()
    engineRef.current = null
  }, [provider])

  const manualSync = useCallback(async () => {
    await engineRef.current?.sync()
  }, [])

  const resolveConflict = useCallback(async (noteId: string, content: string) => {
    await engineRef.current?.resolveConflict(noteId, content)
    setConflicts((prev) => prev.filter((c) => c.noteId !== noteId))
  }, [])

  const dismissConflict = useCallback((noteId: string) => {
    setConflicts((prev) => prev.filter((c) => c.noteId !== noteId))
  }, [])

  return {
    status,
    signedIn,
    provider,
    conflicts,
    handleSignIn,
    handleSignOut,
    manualSync,
    resolveConflict,
    dismissConflict,
  }
}
