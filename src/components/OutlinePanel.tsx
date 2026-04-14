import { useMemo, useState } from 'react'
import { useActiveNoteContent } from '../context/activeNote'

interface Heading {
  level: number
  text: string
  slug: string
}

function parseHeadings(content: string): Heading[] {
  const lines = content.split('\n')
  const headings: Heading[] = []
  let inFence = false
  for (const line of lines) {
    if (line.startsWith('```')) { inFence = !inFence; continue }
    if (inFence) continue
    const m = line.match(/^(#{1,6})\s+(.+)/)
    if (m) {
      headings.push({
        level: m[1].length,
        text: m[2].trim(),
        slug: m[2].trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, ''),
      })
    }
  }
  return headings
}

export default function OutlinePanel() {
  const { content } = useActiveNoteContent()
  const [open, setOpen] = useState(true)
  const headings = useMemo(() => parseHeadings(content), [content])

  if (headings.length === 0) return null

  const scrollToHeading = (slug: string) => {
    // Try to scroll the preview pane heading into view
    const el = document.querySelector(`[data-heading-slug="${slug}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 4 }}>
      <div
        className="sidebar-section-label"
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 12 }}
        onClick={() => setOpen((o) => !o)}
      >
        <span>Outline</span>
        <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '2px 6px 8px' }}>
          {headings.map((h, i) => (
            <div
              key={i}
              className="outline-item"
              style={{ paddingLeft: (h.level - 1) * 10 }}
              onClick={() => scrollToHeading(h.slug)}
              title={h.text}
            >
              {h.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
