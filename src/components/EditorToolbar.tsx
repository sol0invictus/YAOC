interface EditorToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onContentChange: (value: string) => void
}

interface ToolbarAction {
  label: string
  title: string
  prefix: string
  suffix: string
  block?: boolean
}

interface Separator {
  sep: true
}

type ToolbarItem = ToolbarAction | Separator

const items: ToolbarItem[] = [
  { label: 'B', title: 'Bold (Ctrl+B)', prefix: '**', suffix: '**' },
  { label: 'I', title: 'Italic (Ctrl+I)', prefix: '_', suffix: '_' },
  { label: 'S', title: 'Strikethrough', prefix: '~~', suffix: '~~' },
  { sep: true },
  { label: 'H1', title: 'Heading 1', prefix: '# ', suffix: '', block: true },
  { label: 'H2', title: 'Heading 2', prefix: '## ', suffix: '', block: true },
  { label: 'H3', title: 'Heading 3', prefix: '### ', suffix: '', block: true },
  { sep: true },
  { label: '—', title: 'Horizontal rule', prefix: '\n---\n', suffix: '', block: false },
  { label: '> ', title: 'Blockquote', prefix: '> ', suffix: '', block: true },
  { label: '`', title: 'Inline code', prefix: '`', suffix: '`' },
  { label: '```', title: 'Code block', prefix: '```\n', suffix: '\n```' },
  { sep: true },
  { label: '- ', title: 'Bullet list', prefix: '- ', suffix: '', block: true },
  { label: '1. ', title: 'Numbered list', prefix: '1. ', suffix: '', block: true },
  { label: '[ ]', title: 'Task / checkbox', prefix: '- [ ] ', suffix: '', block: true },
  { sep: true },
  { label: '[↗]', title: 'Link', prefix: '[', suffix: '](url)' },
  { label: '[[', title: 'Wikilink', prefix: '[[', suffix: ']]' },
]

export default function EditorToolbar({ textareaRef, onContentChange }: EditorToolbarProps) {
  const applyAction = (action: ToolbarAction) => {
    const ta = textareaRef.current
    if (!ta) return

    const start = ta.selectionStart
    const end = ta.selectionEnd
    const value = ta.value
    const selected = value.slice(start, end)

    let newValue: string
    let newCursorPos: number

    if (action.block && start === end) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      newValue = value.slice(0, lineStart) + action.prefix + value.slice(lineStart)
      newCursorPos = start + action.prefix.length
    } else {
      newValue = value.slice(0, start) + action.prefix + selected + action.suffix + value.slice(end)
      newCursorPos = selected.length > 0
        ? start + action.prefix.length + selected.length + action.suffix.length
        : start + action.prefix.length
    }

    onContentChange(newValue)

    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(newCursorPos, newCursorPos)
    })
  }

  return (
    <div className="editor-toolbar">
      {items.map((item, i) => {
        if ('sep' in item) {
          return <div key={`sep-${i}`} className="editor-toolbar-sep" />
        }
        return (
          <button
            key={item.label}
            onClick={() => applyAction(item)}
            title={item.title}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
