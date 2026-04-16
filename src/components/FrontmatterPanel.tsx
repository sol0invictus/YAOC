import { useState, useCallback } from 'react'
import '../styles/frontmatter-panel.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseFrontmatter(
  content: string,
): { data: Record<string, string>; bodyStart: number } | null {
  if (!content.startsWith('---')) return null
  const end = content.indexOf('\n---', 3)
  if (end === -1) return null
  const yaml = content.slice(4, end)
  const bodyStart = end + 4
  const data: Record<string, string> = {}
  for (const line of yaml.split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    if (key) data[key] = value
  }
  return { data, bodyStart }
}

function serializeFrontmatter(data: Record<string, string>): string {
  const lines = Object.entries(data)
    .filter(([k]) => k.trim())
    .map(([k, v]) => `${k}: ${v}`)
  return `---\n${lines.join('\n')}\n---`
}

function updateContent(content: string, newData: Record<string, string>): string {
  const parsed = parseFrontmatter(content)
  const newFm = serializeFrontmatter(newData)
  if (parsed) {
    return newFm + content.slice(parsed.bodyStart)
  }
  return newFm + '\n\n' + content
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  content: string
  onChange: (newContent: string) => void
}

export default function FrontmatterPanel({ content, onChange }: Props) {
  const [open, setOpen] = useState(true)

  const parsed = parseFrontmatter(content)
  const data = parsed?.data ?? {}
  const keys = Object.keys(data)
  const count = keys.length
  const hasFrontmatter = parsed !== null

  const insertFrontmatter = useCallback(() => {
    onChange('---\n\n---\n\n' + content)
  }, [content, onChange])

  const handleValueChange = useCallback(
    (key: string, value: string) => {
      onChange(updateContent(content, { ...data, [key]: value }))
    },
    [content, data, onChange],
  )

  const handleKeyRename = useCallback(
    (oldKey: string, newKey: string) => {
      const trimmed = newKey.trim()
      if (!trimmed || trimmed === oldKey) return
      const next: Record<string, string> = {}
      for (const k of keys) {
        next[k === oldKey ? trimmed : k] = data[k]
      }
      onChange(updateContent(content, next))
    },
    [content, data, keys, onChange],
  )

  const handleDelete = useCallback(
    (key: string) => {
      const next = { ...data }
      delete next[key]
      onChange(updateContent(content, next))
    },
    [content, data, onChange],
  )

  const handleAdd = useCallback(() => {
    let n = 1
    while (data[`property${n}`] !== undefined) n++
    onChange(updateContent(content, { ...data, [`property${n}`]: '' }))
  }, [content, data, onChange])

  if (!hasFrontmatter) {
    return (
      <div className="fm-panel">
        <button className="fm-empty-trigger" onClick={insertFrontmatter}>
          + Add properties
        </button>
      </div>
    )
  }

  return (
    <div className="fm-panel">
      <div className="fm-header" onClick={() => setOpen((o) => !o)}>
        <span className={`fm-chevron${open ? ' open' : ''}`}>▸</span>
        <span className="fm-title">Properties</span>
        {count > 0 && <span className="fm-badge">{count}</span>}
      </div>
      {open && (
        <div className="fm-body">
          {keys.map((key) => (
            <div key={key} className="fm-row">
              <input
                className="fm-key-input"
                defaultValue={key}
                spellCheck={false}
                onBlur={(e) => handleKeyRename(key, e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              />
              <input
                className="fm-value-input"
                value={data[key]}
                spellCheck={false}
                onChange={(e) => handleValueChange(key, e.target.value)}
              />
              <button
                className="fm-delete-btn"
                title="Remove property"
                onClick={() => handleDelete(key)}
              >
                ×
              </button>
            </div>
          ))}
          <button className="fm-add-btn" onClick={handleAdd}>
            + Add property
          </button>
        </div>
      )}
    </div>
  )
}
