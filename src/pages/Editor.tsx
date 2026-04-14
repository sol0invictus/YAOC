import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useHistory } from 'react-router-dom'
import { IonAlert, IonSpinner } from '@ionic/react'
import { useVault } from '../hooks/useVault'
import MarkdownEditor from '../components/MarkdownEditor'
import BacklinksPanel from '../components/BacklinksPanel'
import { useActiveNoteContent } from '../context/activeNote'
import { recordRecentNote } from '../components/Sidebar'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'

// Shared scroll position memory across note opens
const scrollPositions = new Map<string, number>()

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

export default function Editor() {
  const { id } = useParams<{ id: string }>()
  const { readNote, saveNote, renameNote, notes, findNoteByName, createNote, saveAttachment, getAttachmentUrl, getAttachmentByName } =
    useVault()
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
  const [loading, setLoading] = useState(true)
  const [createTarget, setCreateTarget] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      setLoading(false)
      // Restore scroll position after render
      const savedScroll = scrollPositions.get(id)
      if (savedScroll !== undefined) {
        requestAnimationFrame(() => {
          if (textareaScrollRef.current) textareaScrollRef.current.scrollTop = savedScroll
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [id, readNote])

  const handleChange = useCallback(
    (value: string) => {
      setContent(value)
      setActiveContent(value)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        saveNote(id, path, value)
      }, 800)
    },
    [id, path, saveNote, setActiveContent],
  )

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      // Save scroll position on unmount
      if (textareaScrollRef.current) {
        scrollPositions.set(id, textareaScrollRef.current.scrollTop)
      }
    }
  }, [id])

  const handleTitleBlur = useCallback(async () => {
    const trimmed = titleDraft.trim()
    if (!trimmed || trimmed === name) return
    await renameNote(id, trimmed)
    setName(trimmed)
  }, [titleDraft, name, id, renameNote])

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') e.currentTarget.blur()
      if (e.key === 'Escape') {
        setTitleDraft(name)
        e.currentTarget.blur()
      }
    },
    [name],
  )

  const existingNotes = useMemo(() => new Set(notes.map((n) => n.name.toLowerCase())), [notes])

  const handleWikilinkClick = useCallback(
    (target: string) => {
      const found = findNoteByName(target)
      if (found) {
        history.push(`/editor/${found.id}`)
      } else {
        setCreateTarget(target)
      }
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
    (tag: string) => {
      history.push(`/home?tag=${encodeURIComponent(tag)}`)
    },
    [history],
  )

  const handleBacklinkNavigate = useCallback(
    (noteId: string) => {
      history.push(`/editor/${noteId}`)
    },
    [history],
  )

  const handleImagePaste = useCallback(
    async (blob: Blob, fileName: string): Promise<string> => {
      return saveAttachment(blob, fileName)
    },
    [saveAttachment],
  )

  const handleReadNoteByName = useCallback(
    async (name: string): Promise<string | null> => {
      const ref = findNoteByName(name)
      if (!ref) return null
      try {
        const note = await readNote(ref.id)
        return note.content
      } catch {
        return null
      }
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

  if (loading) {
    return (
      <div className="editor-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <IonSpinner name="crescent" />
      </div>
    )
  }

  const words = wordCount(content)
  const readingMins = Math.max(1, Math.round(words / 200))

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
        />
      </div>

      <div className="editor-body">
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
      </div>

      <BacklinksPanel noteName={name} onNavigate={handleBacklinkNavigate} />

      <div className="status-bar">
        <span className="status-bar-item status-bar-path">{path}</span>
        <span className="status-bar-item">{words} {words === 1 ? 'word' : 'words'}</span>
        <span className="status-bar-item">{content.length} chars</span>
        <span className="status-bar-item">~{readingMins} min read</span>
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
            handler: () => {
              if (createTarget) handleCreateFromWikilink(createTarget)
            },
          },
        ]}
      />
    </div>
  )
}
