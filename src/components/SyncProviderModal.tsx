import { useState } from 'react'
import { IonIcon } from '@ionic/react'
import {
  cloudOutline, cloudDoneOutline, syncOutline, alertCircleOutline,
  cloudOfflineOutline, folderOpenOutline, hardwareChipOutline,
} from 'ionicons/icons'
import type { SyncProviderType, SyncStatus } from '../storage/types'
import GDriveFolderPicker, { type DriveFolder } from './GDriveFolderPicker'

interface SyncProviderModalProps {
  isOpen: boolean
  onClose: () => void
  signedIn: boolean
  provider: SyncProviderType | null
  gDriveFolderName: string | null
  syncStatus: SyncStatus
  localFolderName: string | null
  onAuthenticate: (provider: SyncProviderType) => Promise<void>
  onConnect: (provider: SyncProviderType, folder?: DriveFolder) => Promise<void>
  onChangeGDriveFolder: (folder: DriveFolder) => Promise<void>
  onSignOut: () => void
  onManualSync: () => Promise<void>
  onOpenLocalFolder: () => Promise<void>
}

type Step = 'main' | 'gdrive-folder'

function StatusIcon({ status }: { status: SyncStatus }) {
  if (status === 'syncing') return <IonIcon icon={syncOutline} className="spinning" />
  if (status === 'conflict' || status === 'error') return <IonIcon icon={alertCircleOutline} />
  if (status === 'offline') return <IonIcon icon={cloudOfflineOutline} />
  return <IonIcon icon={cloudDoneOutline} />
}

export default function SyncProviderModal({
  isOpen,
  onClose,
  signedIn,
  provider,
  gDriveFolderName,
  syncStatus,
  localFolderName,
  onAuthenticate,
  onConnect,
  onChangeGDriveFolder,
  onSignOut,
  onManualSync,
  onOpenLocalFolder,
}: SyncProviderModalProps) {
  const [step, setStep] = useState<Step>('main')
  const [connecting, setConnecting] = useState<SyncProviderType | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [openingFolder, setOpeningFolder] = useState(false)

  if (!isOpen) return null

  const handleConnectGDrive = async () => {
    setConnecting('gdrive')
    try {
      await onAuthenticate('gdrive')
      // Check if we already have a saved folder — if so, connect directly
      const savedId = localStorage.getItem('yaoa_gdrive_folder_id')
      if (savedId) {
        await onConnect('gdrive')
        onClose()
      } else {
        // First time: show folder picker
        setStep('gdrive-folder')
      }
    } catch (err) {
      console.error('GDrive auth failed:', err)
    } finally {
      setConnecting(null)
    }
  }

  const handleConnectOneDrive = async () => {
    setConnecting('onedrive')
    try {
      await onAuthenticate('onedrive')
      await onConnect('onedrive')
      onClose()
    } catch (err) {
      console.error('OneDrive auth failed:', err)
    } finally {
      setConnecting(null)
    }
  }

  const handleFolderSelect = async (folder: DriveFolder) => {
    try {
      if (signedIn && provider === 'gdrive') {
        await onChangeGDriveFolder(folder)
      } else {
        await onConnect('gdrive', folder)
      }
      setStep('main')
      onClose()
    } catch (err) {
      console.error('Folder connect failed:', err)
    }
  }

  const handleFolderPickerCancel = () => {
    setStep('main')
    // If we just authenticated but cancelled folder selection, sign out
    if (!signedIn) onSignOut()
  }

  const handleOpenLocalFolder = async () => {
    setOpeningFolder(true)
    try {
      await onOpenLocalFolder()
      onClose()
    } finally {
      setOpeningFolder(false)
    }
  }

  const handleManualSync = async () => {
    setSyncing(true)
    try { await onManualSync() } finally { setSyncing(false) }
  }

  const providerLabel = provider === 'onedrive' ? 'Microsoft OneDrive' : 'Google Drive'

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-panel" style={{ maxWidth: 500, width: '90vw' }}>
        <div className="modal-header">
          <span className="modal-title">
            {step === 'gdrive-folder' ? 'Choose sync folder' : 'Vault & Sync'}
          </span>
          <button className="modal-close" onClick={onClose} title="Close">×</button>
        </div>

        <div className="modal-body" style={{ padding: 0 }}>
          {step === 'gdrive-folder' ? (
            <GDriveFolderPicker
              onSelect={handleFolderSelect}
              onCancel={handleFolderPickerCancel}
            />
          ) : (
            <>
              {/* ── Local Vault ── */}
              <div className="sync-section">
                <div className="sync-section-label">Local vault</div>
                <div className="sync-vault-row">
                  <span className="sync-vault-icon">
                    <IonIcon icon={localFolderName ? folderOpenOutline : hardwareChipOutline} />
                  </span>
                  <div className="sync-vault-info">
                    <span className="sync-vault-name">
                      {localFolderName ?? 'IndexedDB (built-in)'}
                    </span>
                    <span className="sync-vault-desc">
                      {localFolderName
                        ? 'Notes stored in a local folder'
                        : 'Notes stored in browser storage'}
                    </span>
                  </div>
                  <button
                    className="btn btn--ghost"
                    onClick={handleOpenLocalFolder}
                    disabled={openingFolder}
                    title="Open a local folder as your vault (Chrome/Edge only)"
                  >
                    {openingFolder ? 'Opening…' : 'Open folder…'}
                  </button>
                </div>
              </div>

              <div className="sync-divider" />

              {/* ── Cloud Sync ── */}
              <div className="sync-section">
                <div className="sync-section-label">Cloud sync</div>

                {!signedIn ? (
                  <div className="sync-provider-cards">
                    {/* Google Drive card */}
                    <div className="sync-provider-card">
                      <div className="sync-provider-icon">
                        <IonIcon icon={cloudOutline} />
                      </div>
                      <div className="sync-provider-name">Google Drive</div>
                      <div className="sync-provider-desc">
                        Sync notes to a Google Drive folder.
                      </div>
                      <button
                        className="btn btn--primary"
                        onClick={handleConnectGDrive}
                        disabled={connecting !== null}
                      >
                        {connecting === 'gdrive' ? 'Connecting…' : 'Connect'}
                      </button>
                    </div>

                    {/* OneDrive card */}
                    <div className="sync-provider-card">
                      <div className="sync-provider-icon">
                        <IonIcon icon={cloudOutline} style={{ color: 'var(--accent-primary)' }} />
                      </div>
                      <div className="sync-provider-name">Microsoft OneDrive</div>
                      <div className="sync-provider-desc">
                        Sync notes to OneDrive via Microsoft Graph.
                      </div>
                      <button
                        className="btn btn--primary"
                        onClick={handleConnectOneDrive}
                        disabled={connecting !== null}
                      >
                        {connecting === 'onedrive' ? 'Connecting…' : 'Connect'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="sync-status-row">
                      <span style={{ fontSize: '1.4rem', color: 'var(--accent-secondary)' }}>
                        <IonIcon icon={cloudDoneOutline} />
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-normal)' }}>
                          {providerLabel}
                        </div>
                        {provider === 'gdrive' && gDriveFolderName && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            Folder: {gDriveFolderName}
                          </div>
                        )}
                      </div>
                      <StatusIcon status={syncStatus} />
                      <span className={`sync-status-badge sync-status-badge--${syncStatus}`}>
                        {syncStatus}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                      {provider === 'gdrive' && (
                        <button
                          className="btn btn--ghost"
                          onClick={() => setStep('gdrive-folder')}
                          title="Choose a different Drive folder"
                        >
                          Change folder
                        </button>
                      )}
                      <button
                        className="btn btn--ghost"
                        onClick={handleManualSync}
                        disabled={syncing || syncStatus === 'syncing'}
                      >
                        {syncing || syncStatus === 'syncing' ? 'Syncing…' : 'Sync Now'}
                      </button>
                      <button className="btn btn--danger" onClick={onSignOut}>
                        Disconnect
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
