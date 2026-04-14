import { useRef, useState, useCallback } from 'react'
import EditorToolbar from './EditorToolbar'
import PreviewPane from './PreviewPane'
import FindBar from './FindBar'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'

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

  useKeyboardShortcut('f', () => setFindOpen(true), { ctrl: true })

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onImagePaste) return
    const items = e.clipboardData.items
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (!blob) return
        const ext = item.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
        const fileName = `pasted-image.${ext}`
        const ta = textareaRef.current
        if (!ta) return
        const start = ta.selectionStart
        const before = content.slice(0, start)
        const after = content.slice(ta.selectionEnd)
        const placeholder = '![Uploading image...]()'
        onChange(before + placeholder + after)
        const uri = await onImagePaste(blob, fileName)
        const markdown = `![image](${uri})`
        onChange((before + placeholder + after).replace(placeholder, markdown))
        return
      }
    }
  }, [content, onChange, onImagePaste])

  const textarea = (
    <textarea
      ref={textareaRef}
      value={content}
      onChange={(e) => onChange(e.target.value)}
      onPaste={handlePaste}
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
      {/* Mode toggle */}
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

      {/* Find bar */}
      {findOpen && viewMode !== 'preview' && (
        <FindBar content={content} textareaRef={textareaRef} onClose={() => setFindOpen(false)} />
      )}

      {/* Editor content */}
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
    </div>
  )
}
