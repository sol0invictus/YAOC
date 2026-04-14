import { useState, useCallback, useRef } from 'react'
import { useHistory } from 'react-router-dom'
import { IonIcon } from '@ionic/react'
import { closeOutline, searchOutline } from 'ionicons/icons'
import { db } from '../storage/db'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'

interface SearchHit {
  noteId: string
  noteName: string
  notePath: string
  snippet: string
  matchCount: number
}

function buildSnippet(content: string, query: string, snippetLen = 120): string {
  const lower = content.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx === -1) return content.slice(0, snippetLen)
  const start = Math.max(0, idx - 40)
  const end = Math.min(content.length, idx + query.length + 80)
  const raw = (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '')
  // Highlight the match
  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  return raw.replace(re, (m) => `<mark class="search-mark">${m}</mark>`)
}

function countMatches(content: string, query: string): number {
  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  return (content.match(re) || []).length
}

export default function FullTextSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const history = useHistory()
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openSearch = useCallback(() => {
    setOpen(true)
    setQuery('')
    setHits([])
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  useKeyboardShortcut('f', openSearch, { ctrl: true, shift: true })

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setHits([]); return }
    setSearching(true)
    const allNotes = await db.notes.toArray()
    const results: SearchHit[] = []
    for (const note of allNotes) {
      const content = note.content ?? ''
      if (content.toLowerCase().includes(q.toLowerCase()) || note.name.toLowerCase().includes(q.toLowerCase())) {
        results.push({
          noteId: note.id,
          noteName: note.name,
          notePath: note.path,
          snippet: buildSnippet(content, q),
          matchCount: countMatches(content, q),
        })
      }
    }
    results.sort((a, b) => b.matchCount - a.matchCount)
    setHits(results.slice(0, 30))
    setSearching(false)
  }, [])

  const handleInput = (q: string) => {
    setQuery(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => runSearch(q), 200)
  }

  const handleSelect = (noteId: string) => {
    setOpen(false)
    history.push(`/editor/${noteId}`)
  }

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={() => setOpen(false)}>
      <div className="fts-panel" onClick={(e) => e.stopPropagation()}>
        <div className="fts-header">
          <IonIcon icon={searchOutline} className="fts-search-icon" />
          <input
            ref={inputRef}
            className="fts-input"
            placeholder="Search all notes..."
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          />
          <button className="find-bar-btn" onClick={() => setOpen(false)} title="Close">
            <IonIcon icon={closeOutline} />
          </button>
        </div>

        <div className="fts-results">
          {searching && (
            <div className="fts-status">Searching…</div>
          )}
          {!searching && query && hits.length === 0 && (
            <div className="fts-status">No results for "{query}"</div>
          )}
          {hits.map((hit) => (
            <div key={hit.noteId} className="fts-hit" onClick={() => handleSelect(hit.noteId)}>
              <div className="fts-hit-name">
                {hit.noteName}
                <span className="fts-hit-count">{hit.matchCount} {hit.matchCount === 1 ? 'match' : 'matches'}</span>
              </div>
              <div className="fts-hit-path">{hit.notePath}</div>
              <div
                className="fts-hit-snippet"
                dangerouslySetInnerHTML={{ __html: hit.snippet }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
