/**
 * Vault registry — persists the list of known vaults and LocalFS directory
 * handles across page reloads.
 *
 * - Vault list lives in localStorage (fast, synchronous, no blobs).
 * - FileSystemDirectoryHandle objects live in a tiny IndexedDB ("yaoa-registry")
 *   because they cannot be serialised to JSON.
 */

import Dexie from 'dexie'

export interface VaultEntry {
  id: string
  name: string
  type: 'indexeddb' | 'local-fs'
  createdAt: number
  lastOpenedAt: number
}

const VAULTS_KEY = 'yaoa-vaults'
const ACTIVE_KEY = 'yaoa-active-vault'

// ── Vault list (localStorage) ───────────────────────────────────────────────

export function listVaults(): VaultEntry[] {
  try {
    return JSON.parse(localStorage.getItem(VAULTS_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function upsertVault(entry: VaultEntry): void {
  const rest = listVaults().filter((v) => v.id !== entry.id)
  localStorage.setItem(VAULTS_KEY, JSON.stringify([...rest, entry]))
}

export function removeVaultEntry(id: string): void {
  localStorage.setItem(
    VAULTS_KEY,
    JSON.stringify(listVaults().filter((v) => v.id !== id)),
  )
}

// ── Active vault ────────────────────────────────────────────────────────────

export function getActiveVaultId(): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}

export function setActiveVaultId(id: string | null): void {
  if (id == null) localStorage.removeItem(ACTIVE_KEY)
  else localStorage.setItem(ACTIVE_KEY, id)
}

// ── FS handles (stored in IDB so they survive page reload) ──────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HandleRow = { vaultId: string; handle: any }

class RegistryDB extends Dexie {
  handles!: Dexie.Table<HandleRow, string>
  constructor() {
    super('yaoa-registry')
    this.version(1).stores({ handles: 'vaultId' })
  }
}

let _regDB: RegistryDB | null = null
function regDB(): RegistryDB {
  if (!_regDB) _regDB = new RegistryDB()
  return _regDB
}

export async function storeHandle(
  vaultId: string,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  await regDB().handles.put({ vaultId, handle })
}

export async function loadHandle(
  vaultId: string,
): Promise<FileSystemDirectoryHandle | null> {
  const row = await regDB().handles.get(vaultId)
  return (row?.handle as FileSystemDirectoryHandle) ?? null
}
