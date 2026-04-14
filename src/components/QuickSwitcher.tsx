import { useState, useMemo, useCallback } from 'react'
import { useHistory } from 'react-router-dom'
import {
  IonModal,
  IonSearchbar,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
} from '@ionic/react'
import { documentTextOutline, addCircleOutline } from 'ionicons/icons'
import type { NoteRef } from '../storage/types'
import { fuzzyFilter } from '../utils/fuzzyMatch'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'

interface QuickSwitcherProps {
  notes: NoteRef[]
  onCreateNote: (name: string) => void
}

export default function QuickSwitcher({ notes, onCreateNote }: QuickSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const history = useHistory()

  const open = useCallback(() => {
    setQuery('')
    setIsOpen(true)
  }, [])

  useKeyboardShortcut('k', open, { ctrl: true })

  const results = useMemo(() => {
    if (!query.trim()) {
      return notes.slice(0, 10).map((n) => ({ item: n, score: 0 }))
    }
    return fuzzyFilter(query, notes, (n) => n.name + ' ' + n.path).slice(0, 15)
  }, [query, notes])

  const handleSelect = (noteId: string) => {
    setIsOpen(false)
    history.push(`/editor/${noteId}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && results.length === 0 && query.trim()) {
      setIsOpen(false)
      onCreateNote(query.trim())
    }
  }

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={() => setIsOpen(false)}
      initialBreakpoint={0.6}
      breakpoints={[0, 0.6, 0.9]}
      className="quick-switcher-modal"
    >
      <div style={{ padding: '8px 4px 0' }} onKeyDown={handleKeyDown}>
        <IonSearchbar
          value={query}
          onIonInput={(e) => setQuery(e.detail.value ?? '')}
          placeholder="Quick open..."
          debounce={0}
          autoFocus
        />
        <IonList className="qs-results">
          {results.map(({ item }) => (
            <IonItem key={item.id} button onClick={() => handleSelect(item.id)}>
              <IonIcon icon={documentTextOutline} slot="start" style={{ fontSize: '0.95rem', color: 'var(--text-faint)', marginInlineEnd: 10 }} />
              <IonLabel>
                <h3>{item.name}</h3>
                <p>{item.path}</p>
              </IonLabel>
            </IonItem>
          ))}
          {results.length === 0 && query.trim() && (
            <IonItem button onClick={() => { setIsOpen(false); onCreateNote(query.trim()) }}>
              <IonIcon icon={addCircleOutline} slot="start" style={{ fontSize: '0.95rem', color: 'var(--accent-primary)', marginInlineEnd: 10 }} />
              <IonLabel>
                <h3 className="qs-create-hint">Create "{query.trim()}"</h3>
                <p>Press Enter to create a new note</p>
              </IonLabel>
            </IonItem>
          )}
        </IonList>
      </div>
    </IonModal>
  )
}
