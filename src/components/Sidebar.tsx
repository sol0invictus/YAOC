import { IonIcon, IonSearchbar } from '@ionic/react'
import {
  addOutline,
  chevronBackOutline,
  chevronForwardOutline,
  chevronDownOutline,
  chevronForward,
  swapHorizontalOutline,
  folderOutline,
  cloudOutline,
  documentTextOutline,
  refreshOutline,
} from 'ionicons/icons'
import { useState, useMemo, useCallback } from 'react'
import { useHistory } from 'react-router-dom'
import { useVault } from '../hooks/useVault'
import type { NoteRef } from '../storage/types'
import { buildPathTree } from '../utils/pathTree'
import FolderTree from './FolderTree'
import TagBrowser from './TagBrowser'
import OutlinePanel from './OutlinePanel'
import GraphView from './GraphView'
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

// ── Collapsible section header (VSCode-style) ────────────────────────────────

function SectionHeader({
  label,
  open,
  onToggle,
  actions,
}: {
  label: string
  open: boolean
  onToggle: () => void
  actions?: React.ReactNode
}) {
  return (
    <div className="sidebar-section-header" onClick={onToggle}>
      <IonIcon
        icon={open ? chevronDownOutline : chevronForward}
        className="sidebar-section-chevron"
      />
      <span className="sidebar-section-title">{label}</span>
      {actions && (
        <div className="sidebar-section-actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  )
}

// ── Main Sidebar ─────────────────────────────────────────────────────────────

export default function Sidebar({
  notes, activeVault, onCreateNote, onSwitchVault, collapsed, onToggle, activeNoteId,
}: SidebarProps) {
  const [filter, setFilter] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>(
    () => (localStorage.getItem('file-sort') as SortMode) ?? 'name-asc',
  )
  const [collapseSignal, setCollapseSignal] = useState(0)
  const [expandSignal, setExpandSignal]     = useState(0)
  const [width, setWidth] = useState(
    () => parseInt(localStorage.getItem('sidebar-width') || '260', 10),
  )

  // VSCode-style collapsible sections — persist state
  const [recentOpen, setRecentOpen] = useState(
    () => localStorage.getItem('sidebar-recent-open') !== 'false',
  )
  const [filesOpen, setFilesOpen] = useState(
    () => localStorage.getItem('sidebar-files-open') !== 'false',
  )

  const history = useHistory()
  const { refresh } = useVault()

  const recentNoteIds = useMemo(() => loadRecentNotes(), [activeNoteId])
  const recentNotes = useMemo(
    () => recentNoteIds.map((id) => notes.find((n) => n.id === id)).filter(Boolean) as NoteRef[],
    [recentNoteIds, notes],
  )

  const sortedNotes = useMemo(() => {
    const sorted = [...notes]
    if (sortMode === 'name-asc')      sorted.sort((a, b) => a.name.localeCompare(b.name))
    else if (sortMode === 'name-desc') sorted.sort((a, b) => b.name.localeCompare(a.name))
    else if (sortMode === 'modified-desc') sorted.sort((a, b) => b.lastModified - a.lastModified)
    else if (sortMode === 'modified-asc')  sorted.sort((a, b) => a.lastModified - b.lastModified)
    return sorted
  }, [notes, sortMode])

  const filteredNotes = useMemo(() => {
    if (!filter) return sortedNotes
    const q = filter.toLowerCase()
    return sortedNotes.filter(
      (n) => n.name.toLowerCase().includes(q) || n.path.toLowerCase().includes(q),
    )
  }, [sortedNotes, filter])

  const tree = useMemo(() => buildPathTree(filteredNotes), [filteredNotes])

  const handleSortChange = useCallback((mode: SortMode) => {
    setSortMode(mode)
    localStorage.setItem('file-sort', mode)
  }, [])

  const toggleRecent = useCallback(() => {
    setRecentOpen((v) => { localStorage.setItem('sidebar-recent-open', String(!v)); return !v })
  }, [])

  const toggleFiles = useCallback(() => {
    setFilesOpen((v) => { localStorage.setItem('sidebar-files-open', String(!v)); return !v })
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

  const [showGraph, setShowGraph] = useState(false)
  const sidebarStyle = collapsed ? undefined : { width, minWidth: width }

  return (
    <div className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`} style={sidebarStyle}>
      <button
        className="sidebar-toggle"
        onClick={onToggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <IonIcon icon={collapsed ? chevronForwardOutline : chevronBackOutline} />
      </button>

      {!collapsed && (
        <>
          <div className="sidebar-inner">
            {/* Vault header */}
            <div className="sidebar-vault-header">
              <button className="sidebar-vault-btn" onClick={onSwitchVault} title="Switch vault">
                <IonIcon
                  icon={activeVault?.type === 'local-fs' ? folderOutline : cloudOutline}
                  className="sidebar-vault-icon"
                />
                <span className="sidebar-vault-name">{activeVault?.name ?? 'No vault'}</span>
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
                placeholder="Filter files..."
                debounce={150}
              />
            </div>

            <div className="sidebar-scroll">

              {/* ── RECENT section ── */}
              {!filter && recentNotes.length > 0 && (
                <div className="sidebar-section">
                  <SectionHeader
                    label="Recent"
                    open={recentOpen}
                    onToggle={toggleRecent}
                  />
                  {recentOpen && (
                    <div className="sidebar-section-body">
                      {recentNotes.slice(0, 8).map((n) => (
                        <div
                          key={n.id}
                          className={`folder-tree-item ${n.id === activeNoteId ? 'folder-tree-item--active' : ''}`}
                          onClick={() => history.push(`/editor/${n.id}`)}
                        >
                          <span style={{ width: 10 }} />
                          <IonIcon icon={documentTextOutline} style={{ flexShrink: 0 }} />
                          <span>{n.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── FILES section ── */}
              <div className="sidebar-section">
                <SectionHeader
                  label="Files"
                  open={filesOpen}
                  onToggle={toggleFiles}
                  actions={
                    <>
                      <button
                        className="sidebar-action-btn"
                        title="Refresh files"
                        style={{ fontSize: '0.8rem', padding: '2px 4px' }}
                        onClick={() => refresh()}
                      >
                        <IonIcon icon={refreshOutline} />
                      </button>
                      <button
                        className="sidebar-action-btn"
                        title="Collapse all folders"
                        style={{ fontSize: '0.55rem', padding: '2px 4px' }}
                        onClick={() => setCollapseSignal((s) => s + 1)}
                      >⊟</button>
                      <button
                        className="sidebar-action-btn"
                        title="Expand all folders"
                        style={{ fontSize: '0.55rem', padding: '2px 4px' }}
                        onClick={() => setExpandSignal((s) => s + 1)}
                      >⊞</button>
                      <select
                        className="sidebar-sort-select"
                        value={sortMode}
                        onChange={(e) => handleSortChange(e.target.value as SortMode)}
                        title="Sort files"
                        style={{ fontSize: '0.65rem' }}
                      >
                        {(Object.keys(SORT_LABELS) as SortMode[]).map((k) => (
                          <option key={k} value={k}>{SORT_LABELS[k]}</option>
                        ))}
                      </select>
                    </>
                  }
                />
                {filesOpen && (
                  <div className="sidebar-section-body">
                    {tree.length > 0 ? (
                      <FolderTree
                        nodes={tree}
                        activeNoteId={activeNoteId}
                        collapseSignal={collapseSignal}
                        expandSignal={expandSignal}
                      />
                    ) : (
                      <div style={{ padding: '6px 14px', fontSize: '0.75rem', color: 'var(--text-faint)' }}>
                        {filter ? 'No matches' : 'No files yet'}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── TAGS section ── */}
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 4 }}>
                <TagBrowser />
              </div>

              <OutlinePanel />

              {/* ── Graph view button ── */}
              <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={() => setShowGraph(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'none', border: '1px solid var(--border-color)',
                    borderRadius: 4, padding: '4px 10px', cursor: 'pointer',
                    color: 'var(--text-muted)', fontSize: '0.75rem', width: '100%',
                    justifyContent: 'center',
                  }}
                >
                  ⬡ Graph view
                </button>
              </div>
            </div>
          </div>

          <GraphView
            isOpen={showGraph}
            onClose={() => setShowGraph(false)}
            activeNoteId={activeNoteId}
            onNavigate={(id) => { history.push(`/editor/${id}`); setShowGraph(false) }}
          />

          <div className="sidebar-resize-handle" onMouseDown={handleResizeMouseDown} />
        </>
      )}
    </div>
  )
}
