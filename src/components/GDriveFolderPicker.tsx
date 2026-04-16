import { useState, useEffect, useCallback } from 'react'
import { IonIcon } from '@ionic/react'
import { folderOutline, chevronForwardOutline, addOutline, checkmarkOutline } from 'ionicons/icons'
import { GDriveAdapter } from '../storage/GDriveAdapter'

export interface DriveFolder {
  id: string
  name: string
}

interface Props {
  onSelect: (folder: DriveFolder) => void
  onCancel: () => void
}

export default function GDriveFolderPicker({ onSelect, onCancel }: Props) {
  const [stack, setStack] = useState<DriveFolder[]>([{ id: 'root', name: 'My Drive' }])
  const [folders, setFolders] = useState<DriveFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const current = stack[stack.length - 1]

  const load = useCallback(async (parentId: string) => {
    setLoading(true)
    setError(null)
    try {
      const list = await GDriveAdapter.listFolders(parentId)
      setFolders(list)
    } catch {
      setError('Failed to load folders. Check your Drive connection.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(current.id)
  }, [current.id, load])

  const enter = (folder: DriveFolder) => setStack(s => [...s, folder])
  const breadcrumbTo = (i: number) => setStack(s => s.slice(0, i + 1))

  const handleCreate = async () => {
    setCreating(true)
    try {
      const folder = await GDriveAdapter.createFolder(
        'YAOA Notes',
        current.id === 'root' ? undefined : current.id,
      )
      onSelect(folder)
    } catch {
      setError('Failed to create folder.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="folder-picker">
      <div className="folder-picker-title">Select Google Drive folder to sync with</div>

      {/* Breadcrumb */}
      <div className="folder-picker-breadcrumb">
        {stack.map((f, i) => (
          <span key={f.id} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && <span className="folder-picker-sep">›</span>}
            <button
              className={`folder-picker-crumb${i === stack.length - 1 ? ' folder-picker-crumb--active' : ''}`}
              onClick={() => breadcrumbTo(i)}
            >
              {f.name}
            </button>
          </span>
        ))}
      </div>

      {/* Folder list */}
      <div className="folder-picker-list">
        {loading && <div className="folder-picker-status">Loading…</div>}
        {error && <div className="folder-picker-status folder-picker-status--error">{error}</div>}
        {!loading && !error && folders.length === 0 && (
          <div className="folder-picker-status">No subfolders here</div>
        )}
        {!loading && !error && folders.map(f => (
          <div key={f.id} className="folder-picker-item" onClick={() => enter(f)}>
            <IonIcon icon={folderOutline} className="folder-picker-icon" />
            <span className="folder-picker-name">{f.name}</span>
            <IonIcon icon={chevronForwardOutline} className="folder-picker-chevron" />
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="folder-picker-actions">
        <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn--ghost" onClick={handleCreate} disabled={creating || loading}>
          <IonIcon icon={addOutline} style={{ marginRight: 4 }} />
          {creating ? 'Creating…' : 'New "YAOA Notes" here'}
        </button>
        <button
          className="btn btn--primary"
          onClick={() => onSelect(current)}
          disabled={current.id === 'root'}
          title={current.id === 'root' ? 'Navigate into a folder to select it' : `Sync with "${current.name}"`}
        >
          <IonIcon icon={checkmarkOutline} style={{ marginRight: 4 }} />
          Use "{current.name}"
        </button>
      </div>
    </div>
  )
}
