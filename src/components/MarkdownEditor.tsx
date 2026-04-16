import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import EditorToolbar from './EditorToolbar'
import PreviewPane from './PreviewPane'
import FindBar from './FindBar'
import WikilinkAutocomplete, { type AutocompleteState } from './WikilinkAutocomplete'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'
import { useVault } from '../hooks/useVault'
import { fuzzyFilter } from '../utils/fuzzyMatch'

export type ViewMode = 'edit' | 'preview' | 'split'

interface MarkdownEditorProps {
  content: string
  onChange: (value: string) => void
  existingNotes: Set<string>
  onWikilinkClick?: (target: string) => void
  onTagClick?: (tag: string) => void
  onImagePaste?: (blob: Blob, fileName: string) => Promise<string>
  resolveImageSrc?: (src: string) => Promise<string | null>
  onCheckboxToggle?: (index: number) => void
  readNote?: (name: string) => Promise<string | null>
  resolveMedia?: (name: string) => Promise<string | null>
  textareaScrollRef?: React.RefObject<HTMLTextAreaElement | null>
}

// ── Autocomplete helpers ──────────────────────────────────────────────────────

function detectAutocomplete(
  text: string,
  cursorPos: number,
): { mode: 'wikilink' | 'tag'; query: string; triggerStart: number } | null {
  const before = text.slice(0, cursorPos)
  const wikiMatch = before.match(/\[\[([^\]\n]*)$/)
  if (wikiMatch) {
    return { mode: 'wikilink', query: wikiMatch[1], triggerStart: cursorPos - wikiMatch[0].length }
  }
  const tagMatch = before.match(/(^|[\s])#([a-zA-Z][a-zA-Z0-9_/-]*)$/)
  if (tagMatch) {
    return { mode: 'tag', query: tagMatch[2], triggerStart: cursorPos - tagMatch[2].length - 1 }
  }
  return null
}

function getCaretCoords(ta: HTMLTextAreaElement, pos: number): { top: number; left: number } {
  const div = document.createElement('div')
  const style = window.getComputedStyle(ta)
  const props = [
    'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'boxSizing', 'whiteSpace', 'wordBreak', 'overflowWrap',
  ] as const
  for (const prop of props) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(div.style as any)[prop] = style[prop]
  }
  div.style.width = ta.clientWidth + 'px'
  div.style.position = 'absolute'
  div.style.visibility = 'hidden'
  div.style.top = '0'
  div.style.left = '0'
  div.style.whiteSpace = 'pre-wrap'
  div.textContent = ta.value.slice(0, pos)
  const span = document.createElement('span')
  span.textContent = '\u200b'
  div.appendChild(span)
  document.body.appendChild(div)
  const taRect = ta.getBoundingClientRect()
  const divRect = div.getBoundingClientRect()
  const spanRect = span.getBoundingClientRect()
  document.body.removeChild(div)
  const top = taRect.top + (spanRect.top - divRect.top) - ta.scrollTop + span.offsetHeight + 4
  const left = taRect.left + (spanRect.left - divRect.left)
  const vpH = window.innerHeight
  const vpW = window.innerWidth
  return {
    top: Math.min(top, vpH - 240),
    left: Math.min(left, vpW - 328),
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MarkdownEditor({
  content,
  onChange,
  existingNotes,
  onWikilinkClick,
  onTagClick,
  onImagePaste,
  resolveImageSrc,
  onCheckboxToggle,
  readNote,
  resolveMedia,
  textareaScrollRef,
}: MarkdownEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('edit')
  const [findOpen, setFindOpen] = useState(false)
  const internalRef = useRef<HTMLTextAreaElement>(null)
  const textareaRef = (textareaScrollRef as React.RefObject<HTMLTextAreaElement>) ?? internalRef

  const [acState, setAcState] = useState<AutocompleteState>({ mode: null, query: '', anchor: { top: 0, left: 0 } })
  const [acActiveIndex, setAcActiveIndex] = useState(0)

  const { vaultDb } = useVault()
  const [availableTags, setAvailableTags] = useState<string[]>([])
  useEffect(() => {
    vaultDb.tags.toArray().then((rows) => {
      setAvailableTags([...new Set(rows.map((r) => r.tag))].sort())
    })
  }, [vaultDb])

  const noteNames = useMemo(() => [...existingNotes], [existingNotes])

  useKeyboardShortcut('f', () => setFindOpen(true), { ctrl: true })

  // ── Autocomplete ────────────────────────────────────────────────────────────

  const closeAc = useCallback(() => {
    setAcState((s) => s.mode ? { ...s, mode: null } : s)
    setAcActiveIndex(0)
  }, [])

  const updateAc = useCallback((ta: HTMLTextAreaElement) => {
    const pos = ta.selectionStart
    const detected = detectAutocomplete(ta.value, pos)
    if (!detected) { closeAc(); return }
    const anchor = getCaretCoords(ta, pos)
    setAcState({ mode: detected.mode, query: detected.query, anchor })
    setAcActiveIndex(0)
  }, [closeAc])

  const insertCompletion = useCallback((value: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const pos = ta.selectionStart
    const detected = detectAutocomplete(ta.value, pos)
    if (!detected) return
    const before = ta.value.slice(0, detected.triggerStart)
    const after = ta.value.slice(pos)
    let insertion: string
    if (detected.mode === 'wikilink') {
      const hasClose = after.startsWith(']]')
      insertion = `[[${value}${hasClose ? '' : ']]'}`
      onChange(before + insertion + (hasClose ? after.slice(2) : after))
    } else {
      insertion = `#${value} `
      onChange(before + insertion + after)
    }
    const newPos = before.length + insertion.length
    closeAc()
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(newPos, newPos) })
  }, [textareaRef, onChange, closeAc])

  // ── Paste ───────────────────────────────────────────────────────────────────

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onImagePaste) return
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      const item = e.clipboardData.items[i]
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (!blob) return
        const ext = item.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
        const ta = textareaRef.current
        if (!ta) return
        const start = ta.selectionStart
        const before = content.slice(0, start)
        const after = content.slice(ta.selectionEnd)
        const placeholder = '![Uploading image...]()'
        onChange(before + placeholder + after)
        const uri = await onImagePaste(blob, `pasted-image.${ext}`)
        onChange((before + placeholder + after).replace(placeholder, `![image](${uri})`))
        return
      }
    }
  }, [content, onChange, onImagePaste, textareaRef])

  // ── KeyDown: autocomplete nav + smart editing ───────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget
    const { selectionStart: start, selectionEnd: end, value } = ta
    const hasSelection = start !== end
    const selected = value.slice(start, end)

    // Autocomplete keyboard nav
    if (acState.mode) {
      if (e.key === 'Escape') { e.preventDefault(); closeAc(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const items = acState.mode === 'wikilink'
          ? fuzzyFilter(acState.query, noteNames, (s) => s).slice(0, 12).map((r) => r.item)
          : fuzzyFilter(acState.query, availableTags, (s) => s).slice(0, 12).map((r) => r.item)
        setAcActiveIndex((i) => (i + 1) % Math.max(items.length, 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const items = acState.mode === 'wikilink'
          ? fuzzyFilter(acState.query, noteNames, (s) => s).slice(0, 12).map((r) => r.item)
          : fuzzyFilter(acState.query, availableTags, (s) => s).slice(0, 12).map((r) => r.item)
        setAcActiveIndex((i) => (i - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const items = acState.mode === 'wikilink'
          ? (acState.query ? fuzzyFilter(acState.query, noteNames, (s) => s).slice(0, 12).map((r) => r.item) : noteNames.slice(0, 12))
          : (acState.query ? fuzzyFilter(acState.query, availableTags, (s) => s).slice(0, 12).map((r) => r.item) : availableTags.slice(0, 12))
        const selected2 = items[acActiveIndex] ?? items[0]
        if (selected2) { e.preventDefault(); insertCompletion(selected2); return }
      }
    }

    // Auto-pairs (only when no selection for single-char pairs)
    if (!e.altKey && !e.ctrlKey && !e.metaKey) {
      if (e.key === '[') {
        const charBefore = value[start - 1]
        if (charBefore === '[') {
          // [[ → insert ]] after cursor
          e.preventDefault()
          const before = value.slice(0, start)
          const after = value.slice(end)
          onChange(before + (hasSelection ? selected : '') + ']]' + after)
          const newPos = start + (hasSelection ? selected.length : 0)
          requestAnimationFrame(() => { ta.setSelectionRange(newPos, newPos); updateAc(ta) })
          return
        }
        e.preventDefault()
        onChange(value.slice(0, start) + '[' + selected + ']' + value.slice(end))
        const p = start + 1 + selected.length
        requestAnimationFrame(() => ta.setSelectionRange(p, p))
        return
      }
      if (e.key === '*' || e.key === '_' || e.key === '`') {
        e.preventDefault()
        onChange(value.slice(0, start) + e.key + selected + e.key + value.slice(end))
        const p = start + 1 + selected.length
        requestAnimationFrame(() => ta.setSelectionRange(p, p))
        return
      }
      if (e.key === '(') {
        e.preventDefault()
        onChange(value.slice(0, start) + '(' + selected + ')' + value.slice(end))
        const p = start + 1 + selected.length
        requestAnimationFrame(() => ta.setSelectionRange(p, p))
        return
      }
    }

    // Smart Enter: continue lists
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      const currentLine = value.slice(lineStart, start)

      // Task list
      const taskMatch = currentLine.match(/^(\s*[-*+]\s+)\[[ x]\]\s+(.*)/i)
      if (taskMatch) {
        e.preventDefault()
        if (!taskMatch[2]) {
          onChange(value.slice(0, lineStart) + '\n' + value.slice(start))
          requestAnimationFrame(() => ta.setSelectionRange(lineStart + 1, lineStart + 1))
        } else {
          const cont = `\n${taskMatch[1]}[ ] `
          onChange(value.slice(0, start) + cont + value.slice(end))
          const p = start + cont.length
          requestAnimationFrame(() => ta.setSelectionRange(p, p))
        }
        return
      }

      // Unordered list
      const ulMatch = currentLine.match(/^(\s*)([-*+])\s+(.*)$/)
      if (ulMatch) {
        e.preventDefault()
        if (!ulMatch[3]) {
          onChange(value.slice(0, lineStart) + '\n' + value.slice(start))
          requestAnimationFrame(() => ta.setSelectionRange(lineStart + 1, lineStart + 1))
        } else {
          const cont = `\n${ulMatch[1]}${ulMatch[2]} `
          onChange(value.slice(0, start) + cont + value.slice(end))
          requestAnimationFrame(() => ta.setSelectionRange(start + cont.length, start + cont.length))
        }
        return
      }

      // Ordered list
      const olMatch = currentLine.match(/^(\s*)(\d+)\.\s+(.*)$/)
      if (olMatch) {
        e.preventDefault()
        if (!olMatch[3]) {
          onChange(value.slice(0, lineStart) + '\n' + value.slice(start))
          requestAnimationFrame(() => ta.setSelectionRange(lineStart + 1, lineStart + 1))
        } else {
          const cont = `\n${olMatch[1]}${parseInt(olMatch[2], 10) + 1}. `
          onChange(value.slice(0, start) + cont + value.slice(end))
          requestAnimationFrame(() => ta.setSelectionRange(start + cont.length, start + cont.length))
        }
        return
      }
    }

    // Tab / Shift-Tab indent/unindent list items
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      const lineEnd = value.indexOf('\n', start)
      const currentLine = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd)
      if (/^\s*([-*+]|\d+\.)\s/.test(currentLine)) {
        e.preventDefault()
        if (e.shiftKey) {
          const removeCount = Math.min(2, currentLine.match(/^(\s+)/)?.[1].length ?? 0)
          if (removeCount > 0) {
            onChange(value.slice(0, lineStart) + value.slice(lineStart + removeCount))
            const p = Math.max(lineStart, start - removeCount)
            requestAnimationFrame(() => ta.setSelectionRange(p, p))
          }
        } else {
          onChange(value.slice(0, lineStart) + '  ' + value.slice(lineStart))
          requestAnimationFrame(() => ta.setSelectionRange(start + 2, start + 2))
        }
        return
      }
      // Default: insert 2 spaces
      if (!e.shiftKey) {
        e.preventDefault()
        onChange(value.slice(0, start) + '  ' + value.slice(end))
        requestAnimationFrame(() => ta.setSelectionRange(start + 2, start + 2))
      }
    }
  }, [acState, acActiveIndex, noteNames, availableTags, closeAc, insertCompletion, onChange, updateAc])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
    updateAc(e.target)
  }, [onChange, updateAc])

  const handleClick = useCallback(() => {
    const ta = textareaRef.current
    if (ta) updateAc(ta)
  }, [textareaRef, updateAc])

  // ── Render ──────────────────────────────────────────────────────────────────

  const textarea = (
    <textarea
      ref={textareaRef}
      value={content}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onClick={handleClick}
      className="editor-textarea"
      spellCheck={false}
      autoCapitalize="none"
      placeholder="Start writing..."
    />
  )

  const preview = (
    <div className="overflow-y-auto h-full">
      <PreviewPane
        content={content}
        existingNotes={existingNotes}
        onWikilinkClick={onWikilinkClick}
        onTagClick={onTagClick}
        resolveImageSrc={resolveImageSrc}
        onCheckboxToggle={onCheckboxToggle}
        readNote={readNote}
        resolveMedia={resolveMedia}
      />
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="mode-toggle">
        {(['edit', 'split', 'preview'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`mode-toggle-btn ${viewMode === mode ? 'mode-toggle-btn--active' : ''}`}
          >
            {mode}
          </button>
        ))}
      </div>

      {viewMode !== 'preview' && (
        <EditorToolbar textareaRef={textareaRef} onContentChange={onChange} />
      )}

      {findOpen && viewMode !== 'preview' && (
        <FindBar content={content} textareaRef={textareaRef} onClose={() => setFindOpen(false)} />
      )}

      <div className="flex-1 min-h-0">
        {viewMode === 'edit' && textarea}
        {viewMode === 'preview' && preview}
        {viewMode === 'split' && (
          <div className="split-editor">
            {textarea}
            {preview}
          </div>
        )}
      </div>

      {acState.mode && createPortal(
        <WikilinkAutocomplete
          state={acState}
          existingNotes={noteNames}
          availableTags={availableTags}
          activeIndex={acActiveIndex}
          onSelect={insertCompletion}
          onActiveIndexChange={setAcActiveIndex}
        />,
        document.body,
      )}
    </div>
  )
}
