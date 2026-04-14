import { IonIcon } from '@ionic/react'
import { cloudOutline, cloudDoneOutline, syncOutline, alertCircleOutline } from 'ionicons/icons'
import type { NoteRef, SyncStatus, SyncProviderType } from '../storage/types'

interface TitleBarProps {
  activeNote: NoteRef | null
  syncStatus: SyncStatus
  signedIn: boolean
  provider: SyncProviderType | null
  onOpenSync: () => void
}

export default function TitleBar({ activeNote, syncStatus, signedIn, provider, onOpenSync }: TitleBarProps) {
  const pathParts = activeNote
    ? activeNote.path.replace(/\.md$/, '').split('/')
    : null

  const syncTitle = signedIn
    ? provider === 'onedrive'
      ? 'OneDrive sync active'
      : 'Google Drive sync active'
    : 'Set up cloud sync'

  return (
    <div className="title-bar">
      <div className="title-bar-breadcrumb">
        {pathParts ? (
          pathParts.map((part, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && <span className="title-bar-sep">›</span>}
              <span className={i === pathParts.length - 1 ? 'title-bar-note' : 'title-bar-folder'}>
                {part}
              </span>
            </span>
          ))
        ) : (
          <span className="title-bar-vault">YAOA</span>
        )}
      </div>

      <div className="title-bar-actions">
        {syncStatus === 'syncing' && (
          <IonIcon icon={syncOutline} className="title-bar-sync-icon spinning" />
        )}
        {syncStatus === 'conflict' && (
          <IonIcon
            icon={alertCircleOutline}
            style={{ color: 'var(--accent-red)', fontSize: '1.1rem' }}
            title="Sync conflict"
          />
        )}
        <button
          className="title-bar-btn"
          onClick={onOpenSync}
          title={syncTitle}
        >
          <IonIcon icon={signedIn ? cloudDoneOutline : cloudOutline} />
        </button>
      </div>
    </div>
  )
}
