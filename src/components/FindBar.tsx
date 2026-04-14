import { useState, useRef, useCallback, useEffect } from 'react'
import { IonIcon } from '@ionic/react'
import { closeOutline, chevronUpOutline, chevronDownOutline } from 'ionicons/icons'

interface FindBarProps {
  content: string
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onClose: () => void
}

export default function FindBar({ content, textareaRef, onClose }: FindBarProps) {
  const [query, setQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const matches = useCallback((): number[] => {
    if (!query) return []
    const positions: number[] = []
    const lower = content.toLowerCase()
    const q = query.toLowerCase()
    let idx = 0
    while (idx < lower.length) {
      const pos = lower.indexOf(q, idx)
      if (pos === -1) break
      positions.push(pos)
      idx = pos + 1
    }
    return positions
  }, [content, query])

  const positions = matches()
  const count = positions.length
  const safeIndex = count > 0 ? ((matchIndex % count) + count) % count : 0

  const scrollToMatch = useCallback((idx: number) => {
    const ta = textareaRef.current
    if (!ta || positions.length === 0) return
    const pos = positions[idx]
    // Estimate line and scroll position by counting newlines before pos
    const before = content.slice(0, pos)
    const lineNum = (before.match(/\n/g) || []).length
    const lineHeight = 24 // approximate px per line at 0.85rem/1.75
    ta.scrollTop = Math.max(0, lineNum * lineHeight - ta.clientHeight / 3)
    ta.focus()
    ta.setSelectionRange(pos, pos + query.length)
  }, [positions, content, query, textareaRef])

  const goNext = useCallback(() => {
    const next = count > 0 ? (safeIndex + 1) % count : 0
    setMatchIndex(next)
    scrollToMatch(next)
  }, [safeIndex, count, scrollToMatch])

  const goPrev = useCallback(() => {
    const prev = count > 0 ? ((safeIndex - 1) + count) % count : 0
    setMatchIndex(prev)
    scrollToMatch(prev)
  }, [safeIndex, count, scrollToMatch])

  useEffect(() => {
    setMatchIndex(0)
    if (positions.length > 0) scrollToMatch(0)
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.shiftKey ? goPrev() : goNext() }
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="find-bar">
      <input
        ref={inputRef}
        className="find-bar-input"
        placeholder="Find in note..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <span className="find-bar-count">
        {count > 0 ? `${safeIndex + 1}/${count}` : query ? '0 matches' : ''}
      </span>
      <button className="find-bar-btn" onClick={goPrev} title="Previous match (Shift+Enter)">
        <IonIcon icon={chevronUpOutline} />
      </button>
      <button className="find-bar-btn" onClick={goNext} title="Next match (Enter)">
        <IonIcon icon={chevronDownOutline} />
      </button>
      <button className="find-bar-btn" onClick={onClose} title="Close (Escape)">
        <IonIcon icon={closeOutline} />
      </button>
    </div>
  )
}
