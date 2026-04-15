import { useState, useEffect } from 'react'
import { useHistory } from 'react-router-dom'
import { useVault } from '../hooks/useVault'

interface TagCount {
  tag: string
  count: number
}

export default function TagBrowser() {
  const { vaultDb } = useVault()
  const [tags, setTags] = useState<TagCount[]>([])
  const [expanded, setExpanded] = useState(false)
  const history = useHistory()

  useEffect(() => {
    async function loadTags() {
      const allTags = await vaultDb.tags.toArray()
      const counts = new Map<string, Set<string>>()
      for (const t of allTags) {
        if (!counts.has(t.tag)) counts.set(t.tag, new Set())
        counts.get(t.tag)!.add(t.noteId)
      }
      const sorted = [...counts.entries()]
        .map(([tag, noteIds]) => ({ tag, count: noteIds.size }))
        .sort((a, b) => b.count - a.count)
      setTags(sorted)
    }
    loadTags()
  }, [vaultDb])

  if (tags.length === 0) return null

  const displayed = expanded ? tags : tags.slice(0, 8)

  return (
    <div>
      <div className="sidebar-section-label">Tags</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '2px 12px 8px' }}>
        {displayed.map(({ tag, count }) => (
          <span
            key={tag}
            className="tag-link"
            style={{ fontSize: '0.72rem' }}
            onClick={() => history.push(`/home?tag=${encodeURIComponent(tag)}`)}
          >
            #{tag}
            <span style={{
              marginLeft: 4,
              fontSize: '0.6rem',
              opacity: 0.6,
              fontWeight: 400,
            }}>
              {count}
            </span>
          </span>
        ))}
      </div>
      {tags.length > 8 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '0.68rem',
            color: 'var(--text-faint)',
            cursor: 'pointer',
            padding: '0 12px 6px',
          }}
        >
          {expanded ? 'Show less' : `+${tags.length - 8} more`}
        </button>
      )}
    </div>
  )
}
