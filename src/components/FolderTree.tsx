import { useState, useEffect, useRef, useCallback } from 'react'
import type { TreeNode } from '../utils/pathTree'
import {
  folderOutline, folderOpenOutline, documentTextOutline,
  chevronForward, chevronDown,
  imageOutline, musicalNotesOutline, videocamOutline,
  documentOutline, codeSlashOutline,
} from 'ionicons/icons'
import { IonIcon } from '@ionic/react'
import { useHistory } from 'react-router-dom'
import { useVault } from '../hooks/useVault'
import type { FileKind } from '../storage/types'

function fileIcon(kind?: FileKind) {
  switch (kind) {
    case 'image':    return imageOutline
    case 'audio':    return musicalNotesOutline
    case 'video':    return videocamOutline
    case 'pdf':      return documentOutline
    case 'text':     return codeSlashOutline
    default:         return documentTextOutline
  }
}

interface FolderTreeProps {
  nodes: TreeNode[]
  activeNoteId: string | null
  collapseSignal: number
  expandSignal: number
}

interface ContextMenu {
  x: number
  y: number
  noteId: string
  noteName: string
}

function TreeItem({
  node,
  activeNoteId,
  triggerRename,
  collapseSignal,
  expandSignal,
  onContextMenu,
}: {
  node: TreeNode
  activeNoteId: string | null
  triggerRename: boolean
  collapseSignal: number
  expandSignal: number
  onContextMenu: (e: React.MouseEvent, noteId: string, noteName: string) => void
}) {
  const [expanded, setExpanded] = useState(true)

  useEffect(() => { if (collapseSignal > 0) setExpanded(false) }, [collapseSignal])
  useEffect(() => { if (expandSignal > 0) setExpanded(true) }, [expandSignal])
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const { renameNote } = useVault()
  const history = useHistory()
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (triggerRename && !renaming) {
      setRenameDraft(node.name)
      setRenaming(true)
      setTimeout(() => {
        renameInputRef.current?.focus()
        renameInputRef.current?.select()
      }, 0)
    }
  }, [triggerRename]) // eslint-disable-line react-hooks/exhaustive-deps

  const commitRename = useCallback(async () => {
    setRenaming(false)
    const trimmed = renameDraft.trim()
    if (trimmed && trimmed !== node.name && node.noteId) {
      await renameNote(node.noteId, trimmed)
    }
  }, [renameDraft, node.name, node.noteId, renameNote])

  if (node.isFolder) {
    return (
      <div>
        <div className="folder-tree-item" onClick={() => setExpanded(!expanded)}>
          <IonIcon
            icon={expanded ? chevronDown : chevronForward}
            style={{ fontSize: '0.6rem', color: 'var(--text-faint)', width: 10 }}
          />
          <IonIcon icon={expanded ? folderOpenOutline : folderOutline} />
          <span>{node.name}</span>
        </div>
        {expanded && node.children.length > 0 && (
          <div className="folder-tree-children">
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                activeNoteId={activeNoteId}
                triggerRename={false}
                collapseSignal={collapseSignal}
                expandSignal={expandSignal}
                onContextMenu={onContextMenu}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  const isActive = node.noteId != null && node.noteId === activeNoteId
  const isMarkdown = !node.fileKind || node.fileKind === 'markdown'

  return (
    <div
      className={`folder-tree-item ${isActive ? 'folder-tree-item--active' : ''} ${!isMarkdown ? 'folder-tree-item--asset' : ''}`}
      onClick={() => !renaming && node.noteId && history.push(`/editor/${node.noteId}`)}
      onContextMenu={(e) => node.noteId && isMarkdown && onContextMenu(e, node.noteId, node.name)}
      onDoubleClick={() => {
        if (!isMarkdown) return
        setRenameDraft(node.name)
        setRenaming(true)
        setTimeout(() => { renameInputRef.current?.focus(); renameInputRef.current?.select() }, 0)
      }}
    >
      <span style={{ width: 10 }} />
      <IonIcon icon={fileIcon(node.fileKind)} style={{ flexShrink: 0, color: !isMarkdown ? 'var(--accent-secondary)' : undefined }} />
      {renaming ? (
        <input
          ref={renameInputRef}
          className="folder-tree-rename-input"
          value={renameDraft}
          onChange={(e) => setRenameDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') { setRenaming(false) }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span>{node.name}</span>
      )}
    </div>
  )
}

function FlatTreeItem({
  nodes,
  activeNoteId,
  renameTargetId,
  collapseSignal,
  expandSignal,
  onContextMenu,
}: {
  nodes: TreeNode[]
  activeNoteId: string | null
  renameTargetId: string | null
  collapseSignal: number
  expandSignal: number
  onContextMenu: (e: React.MouseEvent, noteId: string, noteName: string) => void
}) {
  return (
    <>
      {nodes.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          activeNoteId={activeNoteId}
          triggerRename={!node.isFolder && node.noteId === renameTargetId}
          collapseSignal={collapseSignal}
          expandSignal={expandSignal}
          onContextMenu={onContextMenu}
        />
      ))}
    </>
  )
}

export default function FolderTree({ nodes, activeNoteId, collapseSignal, expandSignal }: FolderTreeProps) {
  const [menu, setMenu] = useState<ContextMenu | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null)
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null)
  const { deleteNote } = useVault()

  const openMenu = useCallback((e: React.MouseEvent, noteId: string, noteName: string) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, noteId, noteName })
  }, [])

  const closeMenu = useCallback(() => setMenu(null), [])

  useEffect(() => {
    if (!menu) return
    const handler = () => closeMenu()
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [menu, closeMenu])

  // Clear rename target after one render cycle so triggerRename fires once
  useEffect(() => {
    if (renameTargetId) {
      const t = setTimeout(() => setRenameTargetId(null), 100)
      return () => clearTimeout(t)
    }
  }, [renameTargetId])

  const handleDelete = useCallback(async () => {
    if (confirmDelete) {
      await deleteNote(confirmDelete.id)
      setConfirmDelete(null)
    }
  }, [confirmDelete, deleteNote])

  return (
    <div className="folder-tree">
      <FlatTreeItem
        nodes={nodes}
        activeNoteId={activeNoteId}
        renameTargetId={renameTargetId}
        collapseSignal={collapseSignal}
        expandSignal={expandSignal}
        onContextMenu={openMenu}
      />

      {/* Context menu */}
      {menu && (
        <div
          className="context-menu"
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="context-menu-item"
            onClick={() => { setRenameTargetId(menu.noteId); closeMenu() }}
          >
            Rename
          </button>
          <div className="context-menu-sep" />
          <button
            className="context-menu-item context-menu-item--danger"
            onClick={() => { setConfirmDelete({ id: menu.noteId, name: menu.noteName }); closeMenu() }}
          >
            Delete
          </button>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Delete note?</div>
            <div className="modal-body">
              <strong>{confirmDelete.name}</strong> will be permanently deleted.
            </div>
            <div className="modal-actions">
              <button className="modal-btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="modal-btn modal-btn--danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
