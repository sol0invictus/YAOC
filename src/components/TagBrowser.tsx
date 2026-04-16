import { useState, useEffect } from 'react'
import { useHistory } from 'react-router-dom'
import { useVault } from '../hooks/useVault'
import '../styles/tag-tree.css'

interface TagCount {
  tag: string
  count: number
}

interface TagNode {
  name: string
  fullPath: string
  count: number
  children: Map<string, TagNode>
}

function buildTagTree(tags: TagCount[]): Map<string, TagNode> {
  const root = new Map<string, TagNode>()
  for (const { tag, count } of tags) {
    const parts = tag.split('/')
    let current = root
    let fullPath = ''
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      fullPath = fullPath ? `${fullPath}/${part}` : part
      if (!current.has(part)) {
        current.set(part, { name: part, fullPath, count: 0, children: new Map() })
      }
      if (i === parts.length - 1) {
        current.get(part)!.count += count
      }
      current = current.get(part)!.children
    }
  }
  return root
}

function TagTreeNode({
  node,
  depth,
  onTagClick,
}: {
  node: TagNode
  depth: number
  onTagClick: (fullPath: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const hasChildren = node.children.size > 0
  const children = [...node.children.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  )

  return (
    <div style={depth > 0 ? undefined : undefined}>
      <div className="tag-tree-row">
        {hasChildren ? (
          <button
            className="tag-tree-toggle"
            onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x) }}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="tag-tree-indent" />
        )}
        <span
          className="tag-link"
          style={{ fontSize: '0.72rem', cursor: 'pointer' }}
          onClick={() => onTagClick(node.fullPath)}
        >
          #{node.name}
        </span>
        {node.count > 0 && <span className="tag-count">{node.count}</span>}
      </div>
      {expanded && hasChildren && (
        <div className="tag-tree-children">
          {children.map((child) => (
            <TagTreeNode
              key={child.fullPath}
              node={child}
              depth={depth + 1}
              onTagClick={onTagClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const INITIAL_SHOW = 8

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

  const tree = buildTagTree(tags)
  const topLevel = [...tree.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  const displayed = expanded ? topLevel : topLevel.slice(0, INITIAL_SHOW)

  const handleTagClick = (fullPath: string) => {
    history.push(`/home?tag=${encodeURIComponent(fullPath)}`)
  }

  return (
    <div>
      <div className="sidebar-section-label">Tags</div>
      <div className="tag-tree-section">
        {displayed.map((node) => (
          <TagTreeNode
            key={node.fullPath}
            node={node}
            depth={0}
            onTagClick={handleTagClick}
          />
        ))}
      </div>
      {topLevel.length > INITIAL_SHOW && (
        <button
          className="tag-tree-more"
          style={{ paddingLeft: 12 }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : `+${topLevel.length - INITIAL_SHOW} more`}
        </button>
      )}
    </div>
  )
}
