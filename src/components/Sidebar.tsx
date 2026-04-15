import { IonIcon, IonSearchbar } from '@ionic/react'
import {
  addOutline,
  chevronBackOutline,
  chevronForwardOutline,
  timeOutline,
  documentTextOutline,
  swapHorizontalOutline,
  folderOutline,
  cloudOutline,
} from 'ionicons/icons'
import { useState, useMemo, useCallback } from 'react'
import { useHistory } from 'react-router-dom'
import type { NoteRef } from '../storage/types'
import { buildPathTree } from '../utils/pathTree'
import FolderTree from './FolderTree'
import TagBrowser from './TagBrowser'
import OutlinePanel from './OutlinePanel'
import type { VaultEntry } from '../hooks/useVaultRegistry'

type SortMode = 'name-asc' | 'name-desc' | 'modified-desc' | 'modified-asc'

const SORT_LABELS: Record<SortMode, string> = {
  'name-asc': 'Name A→Z',
  'name-desc': 'Name Z→A',
  'modified-desc': 'Modified ↓',
  'modified-asc': 'Modified ↑',
}

function loadRecentNotes(): string[] {
  try { return JSON.parse(localStorage.getItem('recent-notes') ?? '[]') } catch { return [] }
}

export function recordRecentNote(id: string) {
  const recent = loadRecentNotes().filter((r) => r !== id)
  localStorage.setItem('recent-notes', JSON.stringify([id, ...recent].slice(0, 10)))
}

interface SidebarProps {
  notes: NoteRef[]
  activeVault: VaultEntry | null
  onCreateNote: () => void
  onSwitchVault: () => void
  collapsed: boolean
  onToggle: () => void
  activeNoteId: string | null
}

export default function Sidebar({ notes, activeVault, onCreateNote, onSwitchVault, collapsed, onToggle, activeNoteId }: SidebarProps) {
  const [filter, setFilter] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>(() =>
    (localStorage.getItem('file-sort') as SortMode) ?? 'name-asc',
  )
  const [collapseSignal, setCollapseSignal] = useState(0)
  const [expandSignal, setExpandSignal] = useState(0)
  const [width, setWidth] = useState(() =>
    parseInt(localStorage.getItem('sidebar-width') || '260', 10),
  )
  const history = useHistory()

  const recentNoteIds = useMemo(() => loadRecentNotes(), [activeNoteId]) // recompute when active note changes
  const recentNotes = useMemo(
    () => recentNoteIds.map((id) => notes.find((n) => n.id === id)).filter(Boolean) as NoteRef[],
    [recentNoteIds, notes],
  )

  const sortedNotes = useMemo(() => {
    const sorted = [...notes]
    if (sortMode === 'name-asc') sorted.sort((a, b) => a.name.localeCompare(b.name))
    else if (sortMode === 'name-desc') sorted.sort((a, b) => b.name.localeCompare(a.name))
    else if (sortMode === 'modified-desc') sorted.sort((a, b) => b.lastModified - a.lastModified)
    else if (sortMode === 'modified-asc') sorted.sort((a, b) => a.lastModified - b.lastModified)
    return sorted
  }, [notes, sortMode])

  const filteredNotes = useMemo(() => {
    if (!filter) return sortedNotes
    const q = filter.toLowerCase()
    return sortedNotes.filter((n) => n.name.toLowerCase().includes(q) || n.path.toLowerCase().includes(q))
  }, [sortedNotes, filter])

  const tree = useMemo(() => buildPathTree(filteredNotes), [filteredNotes])

  const handleSortChange = useCallback((mode: SortMode) => {
    setSortMode(mode)
    localStorage.setItem('file-sort', mode)
  }, [])

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.min(480, Math.max(160, ev.clientX))
      setWidth(newWidth)
      localStorage.setItem('sidebar-width', String(newWidth))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const sidebarStyle = collapsed ? undefined : { width, minWidth: width }

  return (
    <div className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`} style={sidebarStyle}>
      <button className="sidebar-toggle" onClick={onToggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        <IonIcon icon={collapsed ? chevronForwardOutline : chevronBackOutline} />
      </button>

      {!collapsed && (
        <>
          <div className="sidebar-inner">
            {/* Vault header */}
            <div className="sidebar-vault-header">
              <button
                className="sidebar-vault-btn"
                onClick={onSwitchVault}
                title="Switch vault"
              >
                <IonIcon
                  icon={activeVault?.type === 'local-fs' ? folderOutline : cloudOutline}
                  className="sidebar-vault-icon"
                />
                <span className="sidebar-vault-name">
                  {activeVault?.name ?? 'No vault'}
                </span>
                <IonIcon icon={swapHorizontalOutline} className="sidebar-vault-switch-icon" />
              </button>
              <button className="sidebar-action-btn" onClick={onCreateNote} title="New note">
                <IonIcon icon={addOutline} />
              </button>
            </div>

            {/* Search */}
            <div style={{ padding: '0 6px' }}>
              <IonSearchbar
                value={filter}
                onIonInput={(e) => setFilter(e.detail.value ?? '')}
                placeholder="Filter notes..."
                debounce={150}
              />
            </div>

            <div className="sidebar-scroll">
              {/* Recent notes */}
              {!filter && recentNotes.length > 0 && (
                <div>
                  <div className="sidebar-section-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <IonIcon icon={timeOutline} style={{ fontSize: '0.65rem' }} />
                    Recent
                  </div>
                  <div style={{ padding: '0 6px 4px' }}>
                    {recentNotes.slice(0, 5).map((n) => (
                      <div
                        key={n.id}
                        className={`folder-tree-item ${n.id === activeNoteId ? 'folder-tree-item--active' : ''}`}
                        onClick={() => history.push(`/editor/${n.id}`)}
                      >
                        <IonIcon icon={documentTextOutline} />
                        <span>{n.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Files header with sort + collapse/expand */}
              <div className="sidebar-section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 6 }}>
                <span>Files</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button
                    className="sidebar-action-btn"
                    title="Collapse all folders"
                    style={{ fontSize: '0.55rem', padding: '2px 4px' }}
                    onClick={() => setCollapseSignal((s) => s + 1)}
                  >
                    ⊟
                  </button>
                  <button
                    className="sidebar-action-btn"
                    title="Expand all folders"
                    style={{ fontSize: '0.55rem', padding: '2px 4px' }}
                    onClick={() => setExpandSignal((s) => s + 1)}
                  >
                    ⊞
                  </button>
                  <select
                    className="sidebar-sort-select"
                    value={sortMode}
                    onChange={(e) => handleSortChange(e.target.value as SortMode)}
                    title="Sort files"
                  >
                    {(Object.keys(SORT_LABELS) as SortMode[]).map((k) => (
                      <option key={k} value={k}>{SORT_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* File tree */}
              {tree.length > 0 ? (
                <FolderTree
                  nodes={tree}
                  activeNoteId={activeNoteId}
                  collapseSignal={collapseSignal}
                  expandSignal={expandSignal}
                />
              ) : (
                <div style={{ padding: '8px 16px', fontSize: '0.75rem', color: 'var(--text-faint)' }}>
                  {filter ? 'No matches' : 'No notes yet'}
                </div>
              )}

              {/* Tags */}
              <div style={{ marginTop: 8, borderTop: '1px solid var(--border-subtle)', paddingTop: 4 }}>
                <TagBrowser />
              </div>

              {/* Outline */}
              <OutlinePanel />
            </div>
          </div>

          <div className="sidebar-resize-handle" onMouseDown={handleResizeMouseDown} />
        </>
      )}
    </div>
  )
}
