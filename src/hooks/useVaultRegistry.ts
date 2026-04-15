/**
 * useVaultRegistry — manages the list of known vaults, the active vault, and
 * the construction of the correct VaultAdapter + NotesDB for that vault.
 *
 * Exported values are consumed by AppShell which then passes adapter/db down
 * into <VaultProvider>.
 */

import { useState, useCallback, useEffect } from 'react'
import { nanoid } from '../util/nanoid'
import {
  listVaults,
  upsertVault,
  removeVaultEntry,
  getActiveVaultId,
  setActiveVaultId,
  storeHandle,
  loadHandle,
  type VaultEntry,
} from '../storage/vaultRegistry'
import { IndexedDBAdapter } from '../storage/IndexedDBAdapter'
import { LocalFSAdapter } from '../storage/LocalFSAdapter'
import { getVaultDB, type NotesDB } from '../storage/db'
import type { VaultAdapter } from '../storage/types'

export type { VaultEntry }

interface AdapterState {
  adapter: VaultAdapter
  vaultDb: NotesDB
  localFolderName: string | null
}

/**
 * Ensures a "default" IndexedDB vault is registered on first run so existing
 * users don't see the vault picker on upgrade.
 */
function ensureDefaultVault(): void {
  const vaults = listVaults()
  if (vaults.length === 0) {
    upsertVault({
      id: 'default',
      name: 'My Vault',
      type: 'indexeddb',
      createdAt: Date.now(),
      lastOpenedAt: Date.now(),
    })
    setActiveVaultId('default')
  }
}

export function useVaultRegistry() {
  // Ensure legacy users always have a vault registered
  const [vaults, setVaults] = useState<VaultEntry[]>(() => {
    ensureDefaultVault()
    return listVaults()
  })

  const [activeVaultId, setActiveVaultIdState] = useState<string | null>(
    () => getActiveVaultId(),
  )

  // The ready adapter+db, or null while we're asynchronously loading a local-fs handle
  const [adapterState, setAdapterState] = useState<AdapterState | null>(null)

  const activeVault = vaults.find((v) => v.id === activeVaultId) ?? null

  // ── Build adapter whenever the active vault changes ───────────────────────

  useEffect(() => {
    setAdapterState(null)

    if (!activeVault) return

    if (activeVault.type === 'indexeddb') {
      const vaultDb = getVaultDB(activeVault.id)
      setAdapterState({
        adapter: new IndexedDBAdapter(vaultDb),
        vaultDb,
        localFolderName: null,
      })
      return
    }

    // local-fs: try to restore the handle from IDB, then check permission
    loadHandle(activeVault.id).then(async (handle) => {
      if (!handle) {
        // Handle not found — need user to re-open via the picker
        return
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const perm = await (handle as any).queryPermission({ mode: 'readwrite' })
        if (perm === 'granted') {
          setAdapterState({
            adapter: new LocalFSAdapter(handle),
            vaultDb: getVaultDB('default'), // LocalFS uses default DB for links/tags
            localFolderName: handle.name,
          })
        }
        // If 'prompt' or 'denied', adapterState stays null → picker stays open
      } catch {
        // queryPermission not supported in this browser
      }
    })
  }, [activeVault?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Vault CRUD ────────────────────────────────────────────────────────────

  const _syncVaults = useCallback(() => setVaults(listVaults()), [])

  const createIndexedDBVault = useCallback(
    async (name: string): Promise<VaultEntry> => {
      const id = nanoid()
      const entry: VaultEntry = {
        id,
        name,
        type: 'indexeddb',
        createdAt: Date.now(),
        lastOpenedAt: Date.now(),
      }
      upsertVault(entry)
      setActiveVaultId(id)
      setActiveVaultIdState(id)
      _syncVaults()
      return entry
    },
    [_syncVaults],
  )

  /**
   * Opens a native directory picker.  The chosen folder is registered as a
   * local-fs vault and the adapter is built immediately (permission is
   * implicitly granted by the picker interaction).
   */
  const openFolderVault = useCallback(async (): Promise<VaultEntry | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (window as any).showDirectoryPicker !== 'function') {
      alert('File System Access API is not available in this browser. Use Chrome or Edge.')
      return null
    }
    let handle: FileSystemDirectoryHandle
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
    } catch {
      // User cancelled
      return null
    }

    const folderName = handle.name
    // Re-use existing vault entry if the same folder name was opened before
    const existing = listVaults().find(
      (v) => v.type === 'local-fs' && v.name === folderName,
    )
    const entry: VaultEntry = existing
      ? { ...existing, lastOpenedAt: Date.now() }
      : {
          id: nanoid(),
          name: folderName,
          type: 'local-fs',
          createdAt: Date.now(),
          lastOpenedAt: Date.now(),
        }

    await storeHandle(entry.id, handle)
    upsertVault(entry)
    setActiveVaultId(entry.id)
    setActiveVaultIdState(entry.id)
    _syncVaults()

    // Build adapter right away — permission was just granted by the picker
    setAdapterState({
      adapter: new LocalFSAdapter(handle),
      vaultDb: getVaultDB('default'),
      localFolderName: folderName,
    })

    return entry
  }, [_syncVaults])

  /**
   * Re-opens a local-fs vault by requesting permission for its stored handle.
   * Must be called from a user-gesture handler (button click).
   */
  const reopenLocalFSVault = useCallback(
    async (vaultId: string): Promise<boolean> => {
      const handle = await loadHandle(vaultId)
      if (!handle) return false
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const perm = await (handle as any).requestPermission({ mode: 'readwrite' })
        if (perm !== 'granted') return false
      } catch {
        return false
      }
      const vaultEntry = listVaults().find((v) => v.id === vaultId)
      upsertVault({ ...vaultEntry!, lastOpenedAt: Date.now() })
      setActiveVaultId(vaultId)
      setActiveVaultIdState(vaultId)
      _syncVaults()
      setAdapterState({
        adapter: new LocalFSAdapter(handle),
        vaultDb: getVaultDB('default'),
        localFolderName: handle.name,
      })
      return true
    },
    [_syncVaults],
  )

  const switchVault = useCallback(
    (id: string) => {
      const v = listVaults().find((vault) => vault.id === id)
      if (!v) return
      upsertVault({ ...v, lastOpenedAt: Date.now() })
      setActiveVaultId(id)
      setActiveVaultIdState(id)
      _syncVaults()
    },
    [_syncVaults],
  )

  const deleteVault = useCallback(
    (id: string) => {
      removeVaultEntry(id)
      _syncVaults()
      if (activeVaultId === id) {
        const remaining = listVaults()
        const next = remaining[0]?.id ?? null
        setActiveVaultId(next)
        setActiveVaultIdState(next)
      }
    },
    [activeVaultId, _syncVaults],
  )

  return {
    vaults,
    activeVault,
    adapterState,
    createIndexedDBVault,
    openFolderVault,
    reopenLocalFSVault,
    switchVault,
    deleteVault,
  }
}
