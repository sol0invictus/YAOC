import { IonIcon } from '@ionic/react'
import { cloudOutline, cloudDoneOutline, syncOutline } from 'ionicons/icons'
import type { NoteRef, SyncStatus } from '../storage/types'

interface TitleBarProps {
  activeNote: NoteRef | null
  syncStatus: SyncStatus
  signedIn: boolean
  onSignIn: () => void
  onSignOut: () => void
}

export default function TitleBar({ activeNote, syncStatus, signedIn, onSignIn, onSignOut }: TitleBarProps) {
  const pathParts = activeNote
    ? activeNote.path.replace(/\.md$/, '').split('/')
    : null

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
        <button
          className="title-bar-btn"
          onClick={signedIn ? onSignOut : onSignIn}
          title={signedIn ? 'Signed in to Google Drive — click to sign out' : 'Sign in to Google Drive'}
        >
          <IonIcon icon={signedIn ? cloudDoneOutline : cloudOutline} />
        </button>
      </div>
    </div>
  )
}
