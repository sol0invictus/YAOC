import { useState, useRef, useCallback } from 'react'
import { GDriveAdapter } from '../storage/GDriveAdapter'
import { SyncEngine } from '../sync/engine'
import { isSignedIn, signIn, signOut } from '../auth/gdrive'
import type { Conflict, SyncStatus } from '../storage/types'

export function useSync() {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [signedIn, setSignedIn] = useState(isSignedIn)
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const engineRef = useRef<SyncEngine | null>(null)
  const driveRef = useRef<GDriveAdapter | null>(null)

  const startSync = useCallback(async () => {
    const drive = new GDriveAdapter()
    driveRef.current = drive
    const engine = new SyncEngine(
      drive,
      setStatus,
      (conflict) => setConflicts((prev) => [...prev, conflict]),
    )
    engineRef.current = engine
    await engine.start()
  }, [])

  const handleSignIn = useCallback(async () => {
    await signIn()
    setSignedIn(true)
    await startSync()
  }, [startSync])

  const handleSignOut = useCallback(() => {
    signOut()
    setSignedIn(false)
    engineRef.current?.stop()
    engineRef.current = null
  }, [])

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
    conflicts,
    handleSignIn,
    handleSignOut,
    manualSync,
    resolveConflict,
    dismissConflict,
  }
}
