import { IonIcon } from '@ionic/react'
import { documentTextOutline } from 'ionicons/icons'

export default function Home() {
  return (
    <div className="welcome-page">
      <IonIcon icon={documentTextOutline} className="welcome-icon" />
      <div className="welcome-title">No note open</div>
      <div className="welcome-sub">
        Select a note from the sidebar, or create a new one with the <strong>+</strong> button.
      </div>
      <div className="welcome-shortcuts">
        <span className="kbd">Ctrl</span>+<span className="kbd">K</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>to quick-open</span>
      </div>
    </div>
  )
}
