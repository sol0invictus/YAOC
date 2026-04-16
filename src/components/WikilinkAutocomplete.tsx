import { useEffect, useRef } from 'react'
import { fuzzyFilter } from '../utils/fuzzyMatch'
import '../styles/autocomplete.css'

export type AutocompleteMode = 'wikilink' | 'tag' | null

export interface AutocompleteState {
  mode: AutocompleteMode
  query: string
  anchor: { top: number; left: number }
}

interface WikilinkAutocompleteProps {
  state: AutocompleteState
  existingNotes: string[]
  availableTags: string[]
  activeIndex: number
  onSelect: (value: string) => void
  onActiveIndexChange: (index: number) => void
}

function highlight(label: string, query: string): React.ReactNode {
  if (!query) return label
  const q = query.toLowerCase()
  const t = label.toLowerCase()
  const parts: React.ReactNode[] = []
  let last = 0
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (ti > last) parts.push(label.slice(last, ti))
      parts.push(<mark key={ti}>{label[ti]}</mark>)
      last = ti + 1
      qi++
    }
  }
  if (last < label.length) parts.push(label.slice(last))
  return <>{parts}</>
}

export default function WikilinkAutocomplete({
  state,
  existingNotes,
  availableTags,
  activeIndex,
  onSelect,
  onActiveIndexChange,
}: WikilinkAutocompleteProps) {
  const listRef = useRef<HTMLDivElement>(null)

  const items: string[] =
    state.mode === 'wikilink'
      ? (state.query
          ? fuzzyFilter(state.query, existingNotes, (s) => s).slice(0, 12).map((r) => r.item)
          : existingNotes.slice(0, 12))
      : state.mode === 'tag'
      ? (state.query
          ? fuzzyFilter(state.query, availableTags, (s) => s).slice(0, 12).map((r) => r.item)
          : availableTags.slice(0, 12))
      : []

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector('.autocomplete-item--active') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!state.mode || items.length === 0) return null

  return (
    <div
      className="autocomplete-dropdown"
      style={{ top: state.anchor.top, left: state.anchor.left }}
      ref={listRef}
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map((item, i) => (
        <div
          key={item}
          className={`autocomplete-item${i === activeIndex ? ' autocomplete-item--active' : ''}`}
          onMouseEnter={() => onActiveIndexChange(i)}
          onClick={() => onSelect(item)}
        >
          <span className="autocomplete-item__icon">
            {state.mode === 'wikilink' ? '📄' : '#'}
          </span>
          <span className="autocomplete-item__label">
            {highlight(item, state.query)}
          </span>
        </div>
      ))}
    </div>
  )
}
