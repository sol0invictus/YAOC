import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { IonIcon } from '@ionic/react'
import { searchOutline } from 'ionicons/icons'
import '../styles/command-palette.css'

export interface Command {
  id: string
  label: string
  description?: string
  icon?: string
  action: () => void
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  commands: Command[]
}

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  return qi === q.length
}

export default function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return commands
    return commands.filter((cmd) =>
      fuzzyMatch(q, cmd.label + (cmd.description ? ' ' + cmd.description : ''))
    )
  }, [query, commands])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setActiveIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(filtered.length - 1, 0)))
  }, [filtered.length])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const active = list.querySelector('.cp-item--active') as HTMLElement | null
    active?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const execute = useCallback((cmd: Command) => {
    onClose()
    setTimeout(() => cmd.action(), 10)
  }, [onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % Math.max(filtered.length, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = filtered[activeIndex]
      if (cmd) execute(cmd)
    }
  }, [filtered, activeIndex, execute, onClose])

  if (!isOpen) return null

  return (
    <div
      className="cp-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="cp-panel" role="dialog" aria-modal="true" aria-label="Command Palette">
        <div className="cp-input-row">
          <IonIcon icon={searchOutline} className="cp-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            className="cp-input"
            type="text"
            placeholder="Type a command..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0) }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div ref={listRef} className="cp-list" role="listbox">
          {filtered.length === 0 && (
            <div className="cp-empty">No matching commands</div>
          )}
          {filtered.map((cmd, idx) => (
            <div
              key={cmd.id}
              role="option"
              aria-selected={idx === activeIndex}
              className={`cp-item${idx === activeIndex ? ' cp-item--active' : ''}`}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={(e) => { e.preventDefault(); execute(cmd) }}
            >
              {cmd.icon && (
                <span className="cp-item-icon" aria-hidden="true">
                  <IonIcon icon={cmd.icon} />
                </span>
              )}
              <span className="cp-item-text">
                <span className="cp-item-label">{cmd.label}</span>
                {cmd.description && (
                  <span className="cp-item-desc">{cmd.description}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
