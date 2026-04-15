import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useHistory } from 'react-router-dom'
import { IonAlert, IonSpinner } from '@ionic/react'
import { useVault } from '../hooks/useVault'
import MarkdownEditor from '../components/MarkdownEditor'
import BacklinksPanel from '../components/BacklinksPanel'
import { useActiveNoteContent } from '../context/activeNote'
import { recordRecentNote } from '../components/Sidebar'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'
import { getSaveDelay, SAVE_DELAY_OPTIONS, setSaveDelay } from '../utils/savePrefs'
import type { FileKind } from '../storage/types'

// Shared scroll position memory across note opens
const scrollPositions = new Map<string, number>()

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

// ── Non-markdown file viewer ─────────────────────────────────────────────────

function FileViewer({ id, fileKind }: { id: string; fileKind: FileKind }) {
  const { adapter } = useVault()
  const [src, setSrc] = useState<string | null>(null)
  const [mimeType, setMimeType] = useState('')

  useEffect(() => {
    if (!adapter.readBlob) return
    adapter.readBlob(id).then((result) => {
      if (!result) return
      const url = URL.createObjectURL(result.blob)
      setSrc(url)
      setMimeType(result.mimeType)
    })
    return () => {
      setSrc((prev) => { if (prev) URL.revokeObjectURL(prev); return null })
    }
  }, [id, adapter])

  if (!src) {
    return (
      <div className="file-viewer-empty">
        <IonSpinner name="crescent" />
      </div>
    )
  }

  if (fileKind === 'image') {
    return (
      <div className="file-viewer">
        <img src={src} alt={id.replace(/^.*\//, '')} className="file-viewer-image" />
      </div>
    )
  }

  if (fileKind === 'audio') {
    return (
      <div className="file-viewer file-viewer--centered">
        <audio controls src={src} className="file-viewer-audio" />
        <div className="file-viewer-label">{id.replace(/^.*\//, '')}</div>
      </div>
    )
  }

  if (fileKind === 'video') {
    return (
      <div className="file-viewer">
        <video controls src={src} className="file-viewer-video" />
      </div>
    )
  }

  if (fileKind === 'pdf') {
    return (
      <div className="file-viewer">
        <object data={src} type={mimeType} className="file-viewer-pdf">
          <a href={src} target="_blank" rel="noreferrer">Open PDF</a>
        </object>
      </div>
    )
  }

  return null
}

// ── Main Editor ──────────────────────────────────────────────────────────────

export default function Editor() {
  const { id } = useParams<{ id: string }>()
  const { readNote, saveNote, renameNote, notes, findNoteByName, createNote,
          saveAttachment, getAttachmentUrl, getAttachmentByName } = useVault()
  const { setActiveContent } = useActiveNoteContent()
  const history = useHistory()
  const textareaScrollRef = useRef<HTMLTextAreaElement>(null)

  // Back/forward navigation (Alt+←/→)
  useKeyboardShortcut('ArrowLeft',  () => history.goBack(),    { alt: true })
  useKeyboardShortcut('ArrowRight', () => history.goForward(), { alt: true })

  const [content, setContent] = useState('')
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [fileKind, setFileKind] = useState<FileKind>('markdown')
  const [loading, setLoading] = useState(true)
  const [createTarget, setCreateTarget] = useState<string | null>(null)

  // Save delay — re-reads from localStorage on each keypress so user can
  // change it without reloading.
  const [saveDelay, setSaveDelayState] = useState(getSaveDelay)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingContent = useRef<{ path: string; content: string } | null>(null)

  // Keep in sync with the preference util
  useEffect(() => {
    const handler = () => setSaveDelayState(getSaveDelay())
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  // ── Load note ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    readNote(id).then((note) => {
      if (cancelled) return
      setContent(note.content)
      setActiveContent(note.content)
      recordRecentNote(id)
      setPath(note.path)
      setName(note.name)
      setTitleDraft(note.name)
      setFileKind(note.fileKind ?? 'markdown')
      setLoading(false)
      const savedScroll = scrollPositions.get(id)
      if (savedScroll !== undefined) {
        requestAnimationFrame(() => {
          if (textareaScrollRef.current) textareaScrollRef.current.scrollTop = savedScroll
        })
      }
    })
    return () => { cancelled = true }
  }, [id, readNote])

  // ── Save logic ─────────────────────────────────────────────────────────────

  const flushSave = useCallback(() => {
    if (!pendingContent.current) return
    const { path: p, content: c } = pendingContent.current
    pendingContent.current = null
    saveNote(id, p, c)
  }, [id, saveNote])

  // Ctrl+S: save immediately
  useKeyboardShortcut('s', () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    flushSave()
  }, { ctrl: true })

  const handleChange = useCallback(
    (value: string) => {
      setContent(value)
      setActiveContent(value)
      pendingContent.current = { path, content: value }

      if (saveTimer.current) clearTimeout(saveTimer.current)

      if (saveDelay === 0) {
        // Manual mode — only save on Ctrl+S
        return
      }
      saveTimer.current = setTimeout(flushSave, saveDelay)
    },
    [path, saveDelay, setActiveContent, flushSave],
  )

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      // Auto-save on unmount even in manual mode so work isn't lost
      if (pendingContent.current) {
        const { path: p, content: c } = pendingContent.current
        saveNote(id, p, c)
      }
      if (textareaScrollRef.current) {
        scrollPositions.set(id, textareaScrollRef.current.scrollTop)
      }
    }
  }, [id, saveNote])

  // ── Rename ─────────────────────────────────────────────────────────────────

  const handleTitleBlur = useCallback(async () => {
    const trimmed = titleDraft.trim()
    if (!trimmed || trimmed === name) return
    await renameNote(id, trimmed)
    setName(trimmed)
  }, [titleDraft, name, id, renameNote])

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') e.currentTarget.blur()
      if (e.key === 'Escape') { setTitleDraft(name); e.currentTarget.blur() }
    },
    [name],
  )

  // ── Preview / wikilinks ────────────────────────────────────────────────────

  const existingNotes = useMemo(
    () => new Set(notes.map((n) => n.name.toLowerCase())),
    [notes],
  )

  const handleWikilinkClick = useCallback(
    (target: string) => {
      const found = findNoteByName(target)
      if (found) history.push(`/editor/${found.id}`)
      else setCreateTarget(target)
    },
    [findNoteByName, history],
  )

  const handleCreateFromWikilink = useCallback(
    async (noteName: string) => {
      const note = await createNote(noteName)
      history.push(`/editor/${note.id}`)
    },
    [createNote, history],
  )

  const handleTagClick = useCallback(
    (tag: string) => history.push(`/home?tag=${encodeURIComponent(tag)}`),
    [history],
  )

  const handleBacklinkNavigate = useCallback(
    (noteId: string) => history.push(`/editor/${noteId}`),
    [history],
  )

  const handleImagePaste = useCallback(
    async (blob: Blob, fileName: string): Promise<string> => saveAttachment(blob, fileName),
    [saveAttachment],
  )

  const handleReadNoteByName = useCallback(
    async (name: string): Promise<string | null> => {
      const ref = findNoteByName(name)
      if (!ref) return null
      try { return (await readNote(ref.id)).content } catch { return null }
    },
    [findNoteByName, readNote],
  )

  const handleCheckboxToggle = useCallback(
    (index: number) => {
      const lines = content.split('\n')
      let count = 0
      const newLines = lines.map((line) => {
        if (/^(\s*[-*+]|\s*\d+\.)\s+\[[ x]\]/i.test(line)) {
          if (count === index) {
            count++
            return line.includes('[ ]')
              ? line.replace('[ ]', '[x]')
              : line.replace(/\[x\]/i, '[ ]')
          }
          count++
        }
        return line
      })
      handleChange(newLines.join('\n'))
    },
    [content, handleChange],
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="editor-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <IonSpinner name="crescent" />
      </div>
    )
  }

  const words = wordCount(content)
  const readingMins = Math.max(1, Math.round(words / 200))
  const isMarkdown = fileKind === 'markdown'
  const isText = fileKind === 'text'
  const canEdit = isMarkdown || isText

  return (
    <div className="editor-page">
      <div className="editor-title-row">
        <input
          className="editor-title-input"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKeyDown}
          placeholder="Untitled"
          spellCheck={false}
          readOnly={!canEdit}
        />
      </div>

      <div className="editor-body">
        {isMarkdown && (
          <MarkdownEditor
            content={content}
            onChange={handleChange}
            existingNotes={existingNotes}
            onWikilinkClick={handleWikilinkClick}
            onTagClick={handleTagClick}
            onImagePaste={handleImagePaste}
            resolveImageSrc={getAttachmentUrl}
            onCheckboxToggle={handleCheckboxToggle}
            readNote={handleReadNoteByName}
            resolveMedia={getAttachmentByName}
            textareaScrollRef={textareaScrollRef}
          />
        )}

        {isText && (
          <textarea
            className="plain-text-editor"
            value={content}
            onChange={(e) => handleChange(e.target.value)}
            spellCheck={false}
          />
        )}

        {!canEdit && (
          <FileViewer id={id} fileKind={fileKind} />
        )}
      </div>

      {isMarkdown && (
        <BacklinksPanel noteName={name} onNavigate={handleBacklinkNavigate} />
      )}

      <div className="status-bar">
        <span className="status-bar-item status-bar-path">{path}</span>
        {canEdit && (
          <>
            <span className="status-bar-item">{words} {words === 1 ? 'word' : 'words'}</span>
            <span className="status-bar-item">{content.length} chars</span>
            {isMarkdown && <span className="status-bar-item">~{readingMins} min read</span>}
          </>
        )}
        {/* Save delay picker */}
        <select
          className="status-bar-save-select"
          value={saveDelay}
          title="Auto-save frequency"
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            setSaveDelay(v)
            setSaveDelayState(v)
          }}
        >
          {SAVE_DELAY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <IonAlert
        isOpen={createTarget !== null}
        onDidDismiss={() => setCreateTarget(null)}
        header="Create Note"
        message={`"${createTarget}" doesn't exist yet. Create it?`}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Create',
            handler: () => { if (createTarget) handleCreateFromWikilink(createTarget) },
          },
        ]}
      />
    </div>
  )
}
