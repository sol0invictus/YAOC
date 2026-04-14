import { useBacklinks } from '../hooks/useBacklinks'

interface BacklinksPanelProps {
  noteName: string
  onNavigate: (noteId: string) => void
}

export default function BacklinksPanel({ noteName, onNavigate }: BacklinksPanelProps) {
  const backlinks = useBacklinks(noteName)

  if (backlinks.length === 0) return null

  return (
    <details className="backlinks-panel" open>
      <summary>{backlinks.length} backlink{backlinks.length !== 1 ? 's' : ''}</summary>
      <div style={{ marginTop: 6 }}>
        {backlinks.map((bl) => (
          <div
            key={bl.noteId}
            className="backlink-item"
            onClick={() => onNavigate(bl.noteId)}
          >
            <div className="backlink-item-name">{bl.noteName}</div>
            <div className="backlink-item-context">{bl.context}</div>
          </div>
        ))}
      </div>
    </details>
  )
}
