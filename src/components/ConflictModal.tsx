import { useState, useMemo } from 'react'
import type { Conflict } from '../storage/types'

interface ConflictModalProps {
  conflict: Conflict
  onResolve: (noteId: string, content: string) => Promise<void>
  onDismiss: (noteId: string) => void
}

function computeDiff(local: string, remote: string): {
  localLines: { text: string; onlyLocal: boolean }[]
  remoteLines: { text: string; onlyRemote: boolean }[]
} {
  const localArr = local.split('\n')
  const remoteArr = remote.split('\n')
  const remoteSet = new Set(remoteArr)
  const localSet = new Set(localArr)

  return {
    localLines: localArr.map((line) => ({ text: line, onlyLocal: !remoteSet.has(line) })),
    remoteLines: remoteArr.map((line) => ({ text: line, onlyRemote: !localSet.has(line) })),
  }
}

export default function ConflictModal({ conflict, onResolve, onDismiss }: ConflictModalProps) {
  const [result, setResult] = useState(conflict.localContent)
  const [saving, setSaving] = useState(false)

  const { localLines, remoteLines } = useMemo(
    () => computeDiff(conflict.localContent, conflict.remoteContent),
    [conflict.localContent, conflict.remoteContent],
  )

  const handleSave = async () => {
    setSaving(true)
    try {
      await onResolve(conflict.noteId, result)
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = () => {
    onDismiss(conflict.noteId)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-panel" style={{ maxWidth: 900, width: '90vw', maxHeight: '85vh' }}>
        <div className="modal-header">
          <span className="conflict-path">{conflict.basePath}</span>
          <span className="conflict-badge">Sync Conflict</span>
          <div style={{ flex: 1 }} />
          <button className="modal-close" onClick={handleSkip} title="Skip">×</button>
        </div>

        <div className="modal-body">
          <div className="conflict-columns">
            <div className="conflict-col">
              <div className="conflict-col-label">Your version</div>
              <pre className="conflict-pre">
                {localLines.map((line, i) => (
                  <span
                    key={i}
                    className={line.onlyLocal ? 'conflict-diff-line-local' : undefined}
                    style={{ display: 'block' }}
                  >
                    {line.text || '\u200b'}
                  </span>
                ))}
              </pre>
            </div>

            <div className="conflict-col">
              <div className="conflict-col-label">Remote version</div>
              <pre className="conflict-pre">
                {remoteLines.map((line, i) => (
                  <span
                    key={i}
                    className={line.onlyRemote ? 'conflict-diff-line-remote' : undefined}
                    style={{ display: 'block' }}
                  >
                    {line.text || '\u200b'}
                  </span>
                ))}
              </pre>
            </div>
          </div>

          <div className="conflict-result-label">Result</div>
          <textarea
            className="conflict-result-area"
            value={result}
            onChange={(e) => setResult(e.target.value)}
          />
        </div>

        <div className="modal-footer">
          <button className="btn btn--ghost" onClick={() => setResult(conflict.localContent)}>
            Use Mine
          </button>
          <button className="btn btn--ghost" onClick={() => setResult(conflict.remoteContent)}>
            Use Theirs
          </button>
          <button className="btn btn--ghost" onClick={handleSkip}>
            Skip
          </button>
          <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
