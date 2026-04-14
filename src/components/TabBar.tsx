import { IonIcon } from '@ionic/react'
import { closeOutline, documentTextOutline } from 'ionicons/icons'
import type { NoteRef } from '../storage/types'

interface TabBarProps {
  tabs: string[]
  activeId: string | null
  notes: NoteRef[]
  onSelect: (id: string) => void
  onClose: (id: string) => void
}

export default function TabBar({ tabs, activeId, notes, onSelect, onClose }: TabBarProps) {
  if (tabs.length === 0) return null

  const noteMap = new Map(notes.map((n) => [n.id, n]))

  return (
    <div className="tab-bar">
      {tabs.map((id) => {
        const note = noteMap.get(id)
        const isActive = id === activeId
        return (
          <div
            key={id}
            className={`tab ${isActive ? 'tab--active' : ''}`}
            onClick={() => onSelect(id)}
          >
            <IonIcon icon={documentTextOutline} className="tab-icon" />
            <span className="tab-name">{note?.name ?? '…'}</span>
            <button
              className="tab-close"
              onClick={(e) => { e.stopPropagation(); onClose(id) }}
              title="Close tab"
            >
              <IonIcon icon={closeOutline} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
