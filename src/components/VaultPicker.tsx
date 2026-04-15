/**
 * VaultPicker — shown when:
 *   1. No vault is selected yet (fresh install), or
 *   2. The user clicks "Switch vault" from the sidebar.
 *
 * It lets users create a new in-app vault, open a local folder as a vault,
 * or switch to / re-open an existing vault.
 */

import { useState } from 'react'
import { IonIcon } from '@ionic/react'
import {
  folderOpenOutline,
  addCircleOutline,
  cloudOutline,
  desktopOutline,
  checkmarkCircleOutline,
  trashOutline,
} from 'ionicons/icons'
import type { VaultEntry } from '../hooks/useVaultRegistry'

interface VaultPickerProps {
  /** Existing vaults the user can switch to */
  vaults: VaultEntry[]
  /** ID of the currently active vault (to show a checkmark) */
  activeVaultId: string | null
  /** Whether the picker is blocking (no vault active) vs dismissible modal */
  dismissible: boolean
  onClose: () => void
  onCreateVault: (name: string) => Promise<void>
  onOpenFolder: () => Promise<void>
  onSwitchVault: (id: string) => void
  onReopenLocalFS: (id: string) => Promise<boolean>
  onDeleteVault: (id: string) => void
}

function typeLabel(v: VaultEntry) {
  return v.type === 'local-fs' ? 'Local folder' : 'In-app storage'
}

function typeIcon(v: VaultEntry) {
  return v.type === 'local-fs' ? desktopOutline : cloudOutline
}

export default function VaultPicker({
  vaults,
  activeVaultId,
  dismissible,
  onClose,
  onCreateVault,
  onOpenFolder,
  onSwitchVault,
  onReopenLocalFS,
  onDeleteVault,
}: VaultPickerProps) {
  const [newVaultName, setNewVaultName] = useState('')
  const [creatingNew, setCreatingNew] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    const name = newVaultName.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      await onCreateVault(name)
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleOpenFolder() {
    setBusy(true)
    setError(null)
    try {
      await onOpenFolder()
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleSwitch(v: VaultEntry) {
    if (v.type === 'local-fs') {
      setBusy(true)
      const ok = await onReopenLocalFS(v.id)
      setBusy(false)
      if (ok) { onClose(); return }
      setError(`Could not open "${v.name}". Try "Open folder" to pick it again.`)
      return
    }
    onSwitchVault(v.id)
    onClose()
  }

  const sortedVaults = [...vaults].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)

  return (
    <div className="vault-picker-overlay" onClick={dismissible ? onClose : undefined}>
      <div
        className="vault-picker-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="vault-picker-header">
          <span className="vault-picker-title">Vaults</span>
          {dismissible && (
            <button className="vault-picker-close" onClick={onClose}>✕</button>
          )}
        </div>

        {/* Existing vaults */}
        {sortedVaults.length > 0 && (
          <div className="vault-picker-section">
            <div className="vault-picker-section-label">Your vaults</div>
            {sortedVaults.map((v) => (
              <div
                key={v.id}
                className={`vault-picker-item ${v.id === activeVaultId ? 'vault-picker-item--active' : ''}`}
              >
                <button
                  className="vault-picker-item-main"
                  onClick={() => handleSwitch(v)}
                  disabled={busy}
                >
                  <IonIcon icon={typeIcon(v)} className="vault-picker-item-icon" />
                  <div className="vault-picker-item-info">
                    <span className="vault-picker-item-name">{v.name}</span>
                    <span className="vault-picker-item-type">{typeLabel(v)}</span>
                  </div>
                  {v.id === activeVaultId && (
                    <IonIcon
                      icon={checkmarkCircleOutline}
                      className="vault-picker-item-check"
                    />
                  )}
                </button>
                {v.id !== activeVaultId && (
                  <button
                    className="vault-picker-item-delete"
                    title="Remove vault"
                    onClick={() => onDeleteVault(v.id)}
                  >
                    <IonIcon icon={trashOutline} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Divider */}
        <div className="vault-picker-divider" />

        {/* Actions */}
        <div className="vault-picker-section">
          <div className="vault-picker-section-label">Add vault</div>

          {/* Open folder */}
          <button
            className="vault-picker-action"
            onClick={handleOpenFolder}
            disabled={busy}
          >
            <IonIcon icon={folderOpenOutline} />
            <div>
              <div className="vault-picker-action-title">Open folder</div>
              <div className="vault-picker-action-sub">
                Use an existing folder on your computer
              </div>
            </div>
          </button>

          {/* Create in-app vault */}
          {!creatingNew ? (
            <button
              className="vault-picker-action"
              onClick={() => setCreatingNew(true)}
              disabled={busy}
            >
              <IonIcon icon={addCircleOutline} />
              <div>
                <div className="vault-picker-action-title">Create new vault</div>
                <div className="vault-picker-action-sub">
                  Store notes in the browser (no folder needed)
                </div>
              </div>
            </button>
          ) : (
            <div className="vault-picker-create-form">
              <input
                autoFocus
                className="vault-picker-input"
                placeholder="Vault name"
                value={newVaultName}
                onChange={(e) => setNewVaultName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') { setCreatingNew(false); setNewVaultName('') }
                }}
              />
              <div className="vault-picker-create-actions">
                <button
                  className="vault-picker-btn vault-picker-btn--ghost"
                  onClick={() => { setCreatingNew(false); setNewVaultName('') }}
                >
                  Cancel
                </button>
                <button
                  className="vault-picker-btn vault-picker-btn--primary"
                  onClick={handleCreate}
                  disabled={busy || !newVaultName.trim()}
                >
                  Create
                </button>
              </div>
            </div>
          )}
        </div>

        {error && <div className="vault-picker-error">{error}</div>}
      </div>
    </div>
  )
}
