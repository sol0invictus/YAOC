import { useState } from 'react'
import { IonIcon } from '@ionic/react'
import { cloudOutline, cloudDoneOutline, syncOutline, alertCircleOutline, cloudOfflineOutline } from 'ionicons/icons'
import type { SyncProviderType, SyncStatus } from '../storage/types'

interface SyncProviderModalProps {
  isOpen: boolean
  onClose: () => void
  signedIn: boolean
  provider: SyncProviderType | null
  syncStatus: SyncStatus
  onSignIn: (provider: SyncProviderType) => Promise<void>
  onSignOut: () => void
  onManualSync: () => Promise<void>
}

function StatusBadge({ status }: { status: SyncStatus }) {
  return (
    <span className={`sync-status-badge sync-status-badge--${status}`}>
      {status}
    </span>
  )
}

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
  syncStatus,
  onSignIn,
  onSignOut,
  onManualSync,
}: SyncProviderModalProps) {
  const [connecting, setConnecting] = useState<SyncProviderType | null>(null)
  const [syncing, setSyncing] = useState(false)

  if (!isOpen) return null

  const handleConnect = async (p: SyncProviderType) => {
    setConnecting(p)
    try {
      await onSignIn(p)
      onClose()
    } catch (err) {
      console.error('Sign-in failed:', err)
    } finally {
      setConnecting(null)
    }
  }

  const handleDisconnect = () => {
    onSignOut()
    onClose()
  }

  const handleManualSync = async () => {
    setSyncing(true)
    try {
      await onManualSync()
    } finally {
      setSyncing(false)
    }
  }

  const providerLabel = provider === 'onedrive' ? 'Microsoft OneDrive' : 'Google Drive'

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-panel" style={{ maxWidth: 480, width: '90vw' }}>
        <div className="modal-header">
          <span className="modal-title">Cloud Sync</span>
          <button className="modal-close" onClick={onClose} title="Close">×</button>
        </div>

        <div className="modal-body">
          {!signedIn ? (
            <div className="sync-provider-cards">
              {/* Google Drive card */}
              <div className="sync-provider-card">
                <div className="sync-provider-icon">
                  <IonIcon icon={cloudOutline} />
                </div>
                <div className="sync-provider-name">Google Drive</div>
                <div className="sync-provider-desc">
                  Sync via Google Drive. Requires OAuth setup.
                </div>
                <button
                  className="btn btn--primary"
                  onClick={() => handleConnect('gdrive')}
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
                  Sync via OneDrive. Requires Azure app registration.
                </div>
                <button
                  className="btn btn--primary"
                  onClick={() => handleConnect('onedrive')}
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
                <span style={{ flex: 1, fontSize: '0.9rem', color: 'var(--text-normal)', fontWeight: 500 }}>
                  {providerLabel}
                </span>
                <StatusIcon status={syncStatus} />
                <StatusBadge status={syncStatus} />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  className="btn btn--ghost"
                  onClick={handleManualSync}
                  disabled={syncing || syncStatus === 'syncing'}
                >
                  {syncing || syncStatus === 'syncing' ? 'Syncing…' : 'Sync Now'}
                </button>
                <button className="btn btn--danger" onClick={handleDisconnect}>
                  Disconnect
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
