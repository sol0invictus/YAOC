import { useState, useRef, useCallback } from 'react'
import { GDriveAdapter } from '../storage/GDriveAdapter'
import { OneDriveAdapter } from '../storage/OneDriveAdapter'
import { SyncEngine } from '../sync/engine'
import { initGDriveAuth, isSignedIn as isGDriveSignedIn, signIn as gdriveSignIn, signOut as gdriveSignOut } from '../auth/gdrive'
import { isSignedInToOneDrive, signInToOneDrive, signOutFromOneDrive } from '../auth/onedrive'
import type { Conflict, SyncStatus, SyncProviderType } from '../storage/types'

const FOLDER_ID_KEY = 'yaoa_gdrive_folder_id'
const FOLDER_NAME_KEY = 'yaoa_gdrive_folder_name'

export interface DriveFolder {
  id: string
  name: string
}

export function useSync(gdriveClientId?: string) {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [signedIn, setSignedIn] = useState(() => isGDriveSignedIn() || isSignedInToOneDrive())
  const [provider, setProvider] = useState<SyncProviderType | null>(() =>
    isGDriveSignedIn() ? 'gdrive' : isSignedInToOneDrive() ? 'onedrive' : null
  )
  const [gDriveFolderName, setGDriveFolderName] = useState<string | null>(
    () => localStorage.getItem(FOLDER_NAME_KEY),
  )
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const engineRef = useRef<SyncEngine | null>(null)

  const startEngine = useCallback(async (p: SyncProviderType, folderId?: string) => {
    engineRef.current?.stop()
    const adapter = p === 'gdrive'
      ? new GDriveAdapter(folderId ?? localStorage.getItem(FOLDER_ID_KEY) ?? undefined)
      : new OneDriveAdapter()
    const engine = new SyncEngine(
      adapter,
      setStatus,
      (conflict) => setConflicts(prev => [...prev, conflict]),
    )
    engineRef.current = engine
    await engine.start()
  }, [])

  /** Step 1: OAuth sign-in only — does NOT start the sync engine. */
  const authenticate = useCallback(async (p: SyncProviderType) => {
    if (p === 'gdrive') {
      if (gdriveClientId) initGDriveAuth(gdriveClientId)
      await gdriveSignIn()
    } else {
      await signInToOneDrive()
    }
    setSignedIn(true)
    setProvider(p)
  }, [gdriveClientId])

  /** Step 2: Store the selected folder and start syncing. */
  const connect = useCallback(async (p: SyncProviderType, folder?: DriveFolder) => {
    if (folder) {
      localStorage.setItem(FOLDER_ID_KEY, folder.id)
      localStorage.setItem(FOLDER_NAME_KEY, folder.name)
      setGDriveFolderName(folder.name)
    }
    await startEngine(p, folder?.id)
  }, [startEngine])

  /** Change the GDrive folder for an already-connected session. */
  const changeGDriveFolder = useCallback(async (folder: DriveFolder) => {
    localStorage.setItem(FOLDER_ID_KEY, folder.id)
    localStorage.setItem(FOLDER_NAME_KEY, folder.name)
    setGDriveFolderName(folder.name)
    await startEngine('gdrive', folder.id)
  }, [startEngine])

  const handleSignOut = useCallback(() => {
    if (provider === 'gdrive') {
      gdriveSignOut()
      localStorage.removeItem(FOLDER_ID_KEY)
      localStorage.removeItem(FOLDER_NAME_KEY)
      setGDriveFolderName(null)
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
    setConflicts(prev => prev.filter(c => c.noteId !== noteId))
  }, [])

  const dismissConflict = useCallback((noteId: string) => {
    setConflicts(prev => prev.filter(c => c.noteId !== noteId))
  }, [])

  return {
    status,
    signedIn,
    provider,
    gDriveFolderName,
    conflicts,
    authenticate,
    connect,
    changeGDriveFolder,
    handleSignOut,
    manualSync,
    resolveConflict,
    dismissConflict,
  }
}
