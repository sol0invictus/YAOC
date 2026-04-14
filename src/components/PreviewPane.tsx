import { useState, useEffect, useRef } from 'react'
import { unified, type Processor } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkFrontmatter from 'remark-frontmatter'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeStringify from 'rehype-stringify'
import rehypeRaw from 'rehype-raw'
import { visit } from 'unist-util-visit'
import 'katex/dist/katex.min.css'

// ─── Props ────────────────────────────────────────────────────────────────────

interface PreviewPaneProps {
  content: string
  existingNotes: Set<string>
  onWikilinkClick?: (target: string) => void
  onTagClick?: (tag: string) => void
  onCheckboxToggle?: (index: number) => void
  resolveImageSrc?: (src: string) => Promise<string | null>
  /** Resolve a note name to its markdown content (for ![[note]] transclusion). */
  readNote?: (name: string) => Promise<string | null>
  /** Resolve a vault media filename (e.g. "photo.png") to a blob/object URL. */
  resolveMedia?: (name: string) => Promise<string | null>
}

// ─── Callout metadata ─────────────────────────────────────────────────────────

const CALLOUT_ICON: Record<string, string> = {
  note: '📝', info: 'ℹ️', tip: '💡', important: '❗',
  warning: '⚠️', danger: '🔥', caution: '🔥',
  question: '❓', success: '✅', failure: '❌',
  bug: '🐛', example: '📋', quote: '💬', abstract: '📄',
}

// ─── Media type detection ─────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus'])
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv'])

type MediaType = 'image' | 'audio' | 'video' | 'pdf' | 'note'

function detectMediaType(filename: string): MediaType {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (VIDEO_EXTS.has(ext)) return 'video'
  if (ext === 'pdf') return 'pdf'
  return 'note'
}

/** Parse alias field as size hint "300" or "300x200", or plain text caption. */
function parseSizeAlias(alias?: string): { width?: string; height?: string; caption?: string } {
  if (!alias) return {}
  const m = alias.match(/^(\d+)(?:x(\d+))?$/)
  if (m) return { width: m[1], height: m[2] }
  return { caption: alias }
}

// ─── HTML escape helpers ──────────────────────────────────────────────────────

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function escAttr(s: string) {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// ─── Plugin: YAML frontmatter → <details> table ──────────────────────────────

function pluginFrontmatterRender() {
  return (tree: any) => {
    visit(tree, 'yaml', (node: any, index: number | undefined, parent: any) => {
      if (index === undefined || !parent) return
      const fm: Record<string, string> = {}
      for (const line of (node.value as string).split('\n')) {
        const sep = line.indexOf(':')
        if (sep === -1) continue
        const key = line.slice(0, sep).trim()
        const val = line.slice(sep + 1).trim()
        if (key) fm[key] = val
      }
      if (!Object.keys(fm).length) {
        parent.children.splice(index, 1)
        return
      }
      const rows = Object.entries(fm)
        .map(([k, v]) => `<tr><td class="fm-key">${esc(k)}</td><td class="fm-val">${esc(v)}</td></tr>`)
        .join('')
      parent.children.splice(index, 1, {
        type: 'html',
        value: `<details class="frontmatter-block"><summary>Properties</summary><table class="fm-table">${rows}</table></details>`,
      })
    })
  }
}

// ─── Plugin: Obsidian callouts > [!type] and > [!type]- ──────────────────────

function pluginCallouts() {
  return (tree: any) => {
    visit(tree, 'blockquote', (node: any, index: number | undefined, parent: any) => {
      if (index === undefined || !parent) return
      const firstBlock = node.children?.[0]
      if (!firstBlock || firstBlock.type !== 'paragraph') return
      const firstInline = firstBlock.children?.[0]
      if (!firstInline || firstInline.type !== 'text') return
      const m = /^\[!(\w+)\](-?)(?:[ \t]+(.+))?/.exec(firstInline.value as string)
      if (!m) return

      const calloutType = m[1].toLowerCase()
      const collapsible = m[2] === '-'
      const titleText = m[3] ?? (calloutType.charAt(0).toUpperCase() + calloutType.slice(1))

      const afterHeader = (firstInline.value as string).slice(m[0].length).trimStart()
      if (afterHeader) {
        firstInline.value = afterHeader
      } else {
        firstBlock.children.shift()
        if (firstBlock.children.length === 0) node.children.shift()
      }

      node.type = 'callout'
      node.calloutMeta = { calloutType, collapsible, title: titleText }
    })
  }
}

// ─── remarkRehype handler for callout nodes ───────────────────────────────────

function calloutHandler(state: any, node: any) {
  const { calloutType, collapsible, title } = node.calloutMeta as {
    calloutType: string; collapsible: boolean; title: string
  }
  const icon = CALLOUT_ICON[calloutType] ?? '📌'
  const bodyNodes = state.all(node)

  const titleEl = {
    type: 'element' as const,
    tagName: collapsible ? 'summary' : 'div',
    properties: { className: ['callout-title'] },
    children: [{ type: 'text' as const, value: `${icon} ${title}` }],
  }
  const bodyEl = {
    type: 'element' as const,
    tagName: 'div',
    properties: { className: ['callout-body'] },
    children: bodyNodes,
  }

  return {
    type: 'element' as const,
    tagName: collapsible ? 'details' : 'div',
    properties: { className: ['callout', `callout-${calloutType}`] },
    children: [titleEl, bodyEl],
  }
}

// ─── Plugin: block references — paragraph ending with ^block-id ───────────────

function pluginBlockRefs() {
  return (tree: any) => {
    visit(tree, 'paragraph', (node: any) => {
      const last = node.children?.[node.children.length - 1]
      if (!last || last.type !== 'text') return
      const m = /[ \t]+\^([a-zA-Z0-9-]+)$/.exec(last.value as string)
      if (!m) return
      last.value = (last.value as string).slice(0, -m[0].length)
      if (!node.data) node.data = {}
      node.data.hProperties = { id: `block-${m[1]}`, 'data-block-id': m[1], className: ['block-ref-target'] }
    })
  }
}

// ─── Plugin: all inline syntax in one pass ───────────────────────────────────
//
// Groups:
//  1  full wikilink/embed text
//  2  target name
//  3  heading (optional, may start with ^ for block-id)
//  4  alias / size hint (optional)
//  5  %%comment%%
//  6  ==highlight== content
//  7  #tag name
//  8  ~subscript~ content
//  9  ^superscript^ content

const INLINE_RE =
  /(!?\[\[([^\]|#\n]+?)(?:#([^\]|\n]+?))?(?:\|([^\]\n]+?))?\]\])|(%%[\s\S]*?%%)|==([^=\n]+?)==|(?<![a-zA-Z0-9])#([a-zA-Z][a-zA-Z0-9_/-]*)|~([^~\n]+?)~|\^([^\^\n]+?)\^/g

function pluginInlineSyntax(getExistingNotes: () => Set<string>, embedTransclusions: boolean) {
  return () => (tree: any) => {
    const existingNotes = getExistingNotes()

    visit(tree, 'text', (node: any, index: number | undefined, parent: any) => {
      if (index === undefined || !parent) return
      const pType: string = parent.type ?? ''
      if (pType === 'code' || pType === 'inlineCode') return

      const value: string = node.value
      const hasAny =
        value.includes('[[') ||
        value.includes('%%') ||
        value.includes('==') ||
        value.includes('#') ||
        value.includes('~') ||
        value.includes('^')
      if (!hasAny) return

      INLINE_RE.lastIndex = 0
      const parts: any[] = []
      let last = 0
      let m: RegExpExecArray | null

      while ((m = INLINE_RE.exec(value)) !== null) {
        if (m.index > last) parts.push({ type: 'text', value: value.slice(last, m.index) })

        if (m[1] !== undefined) {
          // [[wikilink]] or ![[embed]]
          const isEmbed = m[1].startsWith('!')
          const target = m[2].trim()
          const heading = m[3]?.trim()       // may start with ^ for block-id refs
          const aliasOrSize = m[4]?.trim()

          if (isEmbed && embedTransclusions) {
            const mediaType = detectMediaType(target)

            if (mediaType === 'note') {
              // Note transclusion
              parts.push({
                type: 'html',
                value: `<div class="transclusion-embed" data-source="${escAttr(target)}"${
                  heading ? ` data-heading="${escAttr(heading)}"` : ''
                }><div class="transclusion-loading">Embedding <em>${esc(target)}</em>…</div></div>`,
              })
            } else {
              // Media embed (image / audio / video / pdf)
              const { width, height, caption } = parseSizeAlias(aliasOrSize)
              parts.push({
                type: 'html',
                value: [
                  `<div class="media-embed"`,
                  ` data-media-type="${mediaType}"`,
                  ` data-media-source="${escAttr(target)}"`,
                  width ? ` data-width="${escAttr(width)}"` : '',
                  height ? ` data-height="${escAttr(height)}"` : '',
                  caption ? ` data-caption="${escAttr(caption)}"` : '',
                  `><div class="media-loading">Loading ${esc(target)}…</div></div>`,
                ].join(''),
              })
            }
          } else if (!isEmbed) {
            // Regular wikilink
            const display = aliasOrSize ?? (heading ? `${target} § ${heading}` : target)
            const exists = existingNotes.has(target.toLowerCase())
            parts.push({
              type: 'html',
              value: `<a class="${exists ? 'wikilink' : 'wikilink wikilink--missing'}" data-wikilink="${escAttr(
                target,
              )}"${heading ? ` data-heading="${escAttr(heading)}"` : ''}>${esc(display)}</a>`,
            })
          } else {
            // isEmbed but embedTransclusions=false — keep as literal text
            parts.push({ type: 'text', value: m[0] })
          }
        } else if (m[5] !== undefined) {
          // %%comment%% — erase silently
        } else if (m[6] !== undefined) {
          // ==highlight==
          parts.push({ type: 'html', value: `<mark class="md-highlight">${esc(m[6])}</mark>` })
        } else if (m[7] !== undefined) {
          // #tag
          const tag = m[7]
          parts.push({
            type: 'html',
            value: `<span class="tag-link" data-tag="${escAttr(tag)}">#${esc(tag)}</span>`,
          })
        } else if (m[8] !== undefined) {
          // ~subscript~
          parts.push({ type: 'html', value: `<sub>${esc(m[8])}</sub>` })
        } else if (m[9] !== undefined) {
          // ^superscript^
          parts.push({ type: 'html', value: `<sup>${esc(m[9])}</sup>` })
        }

        last = m.index + m[0].length
      }

      if (last === 0) return
      if (last < value.length) parts.push({ type: 'text', value: value.slice(last) })
      parent.children.splice(index, 1, ...parts)
    })
  }
}

// ─── Rehype plugin: standard image size — ![alt|300](url) ────────────────────

function pluginRehypeImageSize() {
  return (tree: any) => {
    visit(tree, 'element', (node: any) => {
      if (node.tagName !== 'img') return
      const alt: string = node.properties?.alt ?? ''
      const pipe = alt.lastIndexOf('|')
      if (pipe === -1) return
      const sizePart = alt.slice(pipe + 1).trim()
      const m = sizePart.match(/^(\d+)(?:x(\d+))?$/)
      if (!m) return
      node.properties.alt = alt.slice(0, pipe).trim()
      node.properties.width = m[1]
      if (m[2]) node.properties.height = m[2]
      node.properties.style = `max-width: ${m[1]}px`
    })
  }
}

// ─── Rehype plugin: transform mermaid code blocks before syntax highlighting ──

function pluginRehypeMermaid() {
  return (tree: any) => {
    visit(tree, 'element', (node: any, index: number | undefined, parent: any) => {
      if (node.tagName !== 'pre' || index === undefined || !parent) return
      const code = node.children?.[0]
      if (!code || code.type !== 'element' || code.tagName !== 'code') return
      const cls: string[] = Array.isArray(code.properties?.className) ? code.properties.className : []
      if (!cls.includes('language-mermaid')) return
      const text = (code.children ?? [])
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.value as string)
        .join('')
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['mermaid-block'], 'data-mermaid': encodeURIComponent(text) },
        children: [
          {
            type: 'element',
            tagName: 'pre',
            properties: { className: ['mermaid-source'] },
            children: [{ type: 'text', value: text }],
          },
        ],
      }
    })
  }
}

// ─── Rehype plugin: task-list checkboxes (remove disabled, add index) ─────────

function pluginRehypeTaskLists() {
  return (tree: any) => {
    let counter = 0
    visit(tree, 'element', (node: any) => {
      if (node.tagName !== 'li') return
      const checkbox = (node.children ?? []).find(
        (c: any) =>
          c.type === 'element' && c.tagName === 'input' && c.properties?.type === 'checkbox',
      )
      if (!checkbox) return
      const isChecked = !!checkbox.properties?.checked
      checkbox.properties = {
        type: 'checkbox',
        checked: isChecked || undefined,
        'data-checkbox-index': counter++,
        className: ['task-checkbox'],
      }
      if (!node.properties) node.properties = {}
      node.properties.className = isChecked ? ['task-item', 'task-done'] : ['task-item']
    })
  }
}

// ─── Rehype plugin: add id + data-heading-slug to headings ───────────────────

function pluginRehypeHeadingSlugs() {
  return (tree: any) => {
    visit(tree, 'element', (node: any) => {
      if (!/^h[1-6]$/.test(node.tagName)) return
      const text = (node.children ?? [])
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.value as string)
        .join('')
      const slug = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
      if (!node.properties) node.properties = {}
      node.properties.id = slug
      node.properties['data-heading-slug'] = slug
    })
  }
}

// ─── Build the unified processor ─────────────────────────────────────────────

function buildProcessor(
  getExistingNotes: () => Set<string>,
  embedTransclusions: boolean,
): Processor {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkFrontmatter, ['yaml'])
    .use(pluginFrontmatterRender)
    .use(pluginCallouts)
    .use(pluginBlockRefs)
    .use(pluginInlineSyntax(getExistingNotes, embedTransclusions))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .use(remarkRehype as any, {
      allowDangerousHtml: true,
      handlers: { callout: calloutHandler },
    })
    .use(rehypeRaw)
    .use(pluginRehypeImageSize)
    .use(pluginRehypeMermaid)
    .use(rehypeKatex)
    .use(rehypeHighlight, { detect: true })
    .use(pluginRehypeHeadingSlugs)
    .use(pluginRehypeTaskLists)
    .use(rehypeStringify) as unknown as Processor
}

// ─── DOM helpers for transclusion ────────────────────────────────────────────

function extractHeadingSection(html: string, heading: string): string {
  const slug = heading.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  const el = tmp.querySelector(`[data-heading-slug="${CSS.escape(slug)}"]`)
  if (!el) return html
  const level = parseInt(el.tagName[1], 10)
  const parts = [el.outerHTML]
  let next = el.nextElementSibling
  while (next) {
    if (/^H[1-6]$/.test(next.tagName) && parseInt(next.tagName[1], 10) <= level) break
    parts.push(next.outerHTML)
    next = next.nextElementSibling
  }
  return parts.join('\n')
}

function extractBlockById(html: string, blockId: string): string {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  const el = tmp.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`)
  return el
    ? el.outerHTML
    : `<div class="media-missing">Block ^${esc(blockId)} not found</div>`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PreviewPane({
  content,
  existingNotes,
  onWikilinkClick,
  onTagClick,
  onCheckboxToggle,
  resolveImageSrc,
  readNote,
  resolveMedia,
}: PreviewPaneProps) {
  const [html, setHtml] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Always-current ref so plugins don't capture stale values
  const existingNotesRef = useRef<Set<string>>(existingNotes)
  existingNotesRef.current = existingNotes

  // Processors built once
  const processorRef = useRef<Processor | null>(null)
  if (!processorRef.current) {
    processorRef.current = buildProcessor(() => existingNotesRef.current, true)
  }
  const embedProcessorRef = useRef<Processor | null>(null)
  if (!embedProcessorRef.current) {
    embedProcessorRef.current = buildProcessor(() => existingNotesRef.current, false)
  }

  // ── Render markdown → HTML ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    processorRef.current!.process(content).then((file) => {
      if (!cancelled) setHtml(String(file))
    })
    return () => { cancelled = true }
  }, [content, existingNotes])

  // ── Resolve ![[note]] transclusions ────────────────────────────────────────
  useEffect(() => {
    if (!readNote || !containerRef.current) return
    const embeds = containerRef.current.querySelectorAll<HTMLElement>(
      '.transclusion-embed[data-source]',
    )
    if (!embeds.length) return

    embeds.forEach(async (el) => {
      const source = el.getAttribute('data-source') ?? ''
      const headingAttr = el.getAttribute('data-heading') ?? ''
      if (!source) return

      const noteContent = await readNote(source)
      if (!noteContent) {
        el.innerHTML = `<div class="transclusion-missing">Note not found: <em>${esc(source)}</em></div>`
        return
      }
      const result = await embedProcessorRef.current!.process(noteContent)
      let embedHtml = String(result)

      if (headingAttr.startsWith('^')) {
        // Block-level transclusion: ![[note#^block-id]]
        embedHtml = extractBlockById(embedHtml, headingAttr.slice(1))
      } else if (headingAttr) {
        // Heading-level transclusion: ![[note#Heading]]
        embedHtml = extractHeadingSection(embedHtml, headingAttr)
      }

      el.innerHTML = `<div class="transclusion-title">${esc(source)}</div><div class="transclusion-body">${embedHtml}</div>`
    })
  }, [html, readNote])

  // ── Resolve ![[media.png/mp4/mp3/pdf]] embeds ──────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    const mediaEls = containerRef.current.querySelectorAll<HTMLElement>(
      '.media-embed[data-media-source]',
    )
    if (!mediaEls.length) return

    mediaEls.forEach(async (el) => {
      const source = el.getAttribute('data-media-source') ?? ''
      const type = el.getAttribute('data-media-type') as MediaType | null
      const width = el.getAttribute('data-width') ?? ''
      const height = el.getAttribute('data-height') ?? ''
      const caption = el.getAttribute('data-caption') ?? ''
      if (!source || !type) return

      const url = resolveMedia ? await resolveMedia(source) : null

      const widthAttr = width ? ` width="${escAttr(width)}"` : ''
      const heightAttr = height ? ` height="${escAttr(height)}"` : ''
      const sizeStyle = width ? ` style="max-width:${parseInt(width)}px"` : ''
      const figcaption = caption
        ? `<figcaption class="media-caption">${esc(caption)}</figcaption>`
        : ''

      if (type === 'image') {
        if (url) {
          el.innerHTML = `<figure class="media-figure"><img src="${escAttr(url)}" alt="${escAttr(
            source,
          )}" class="vault-image"${widthAttr}${heightAttr}${sizeStyle}>${figcaption}</figure>`
        } else {
          el.innerHTML = `<div class="media-missing">🖼 Image not found: <code>${esc(source)}</code></div>`
        }
      } else if (type === 'audio') {
        if (url) {
          el.innerHTML = `<figure class="media-figure"><audio controls src="${escAttr(
            url,
          )}"></audio>${figcaption}</figure>`
        } else {
          el.innerHTML = `<div class="media-missing">🔊 Audio not found: <code>${esc(source)}</code></div>`
        }
      } else if (type === 'video') {
        if (url) {
          el.innerHTML = `<figure class="media-figure"><video controls src="${escAttr(
            url,
          )}"${widthAttr}${heightAttr}${sizeStyle}></video>${figcaption}</figure>`
        } else {
          el.innerHTML = `<div class="media-missing">🎬 Video not found: <code>${esc(source)}</code></div>`
        }
      } else if (type === 'pdf') {
        if (url) {
          el.innerHTML = `<figure class="media-figure"><object data="${escAttr(
            url,
          )}" type="application/pdf" class="pdf-embed"></object></figure>`
        } else {
          el.innerHTML = `<div class="media-missing">📄 PDF not found: <code>${esc(source)}</code></div>`
        }
      }
    })
  }, [html, resolveMedia])

  // ── Resolve yaoa:// attachment URIs in standard images ─────────────────────
  useEffect(() => {
    if (!resolveImageSrc || !containerRef.current) return
    containerRef.current
      .querySelectorAll<HTMLImageElement>('img[src^="yaoa://"]')
      .forEach(async (img) => {
        const src = img.getAttribute('src')
        if (!src) return
        const url = await resolveImageSrc(src)
        if (url) img.setAttribute('src', url)
      })
  }, [html, resolveImageSrc])

  // ── Render Mermaid diagrams ─────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    const blocks = containerRef.current.querySelectorAll<HTMLElement>('[data-mermaid]')
    if (!blocks.length) return
    import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: 'dark' })
      blocks.forEach(async (el) => {
        const src = decodeURIComponent(el.getAttribute('data-mermaid') ?? '')
        try {
          const id = `mermaid-${Math.random().toString(36).slice(2)}`
          const { svg } = await mermaid.render(id, src)
          el.innerHTML = svg
        } catch (err) {
          el.innerHTML = `<pre class="mermaid-error">${String(err)}</pre>`
        }
      })
    })
  }, [html])

  // ── Click delegation ────────────────────────────────────────────────────────
  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement

    const cb = target.closest('[data-checkbox-index]') as HTMLElement | null
    if (cb && onCheckboxToggle) {
      e.preventDefault()
      onCheckboxToggle(parseInt(cb.getAttribute('data-checkbox-index') ?? '0', 10))
      return
    }
    const wl = target.closest('[data-wikilink]')
    if (wl && onWikilinkClick) {
      e.preventDefault()
      onWikilinkClick(wl.getAttribute('data-wikilink')!)
      return
    }
    const tag = target.closest('[data-tag]')
    if (tag && onTagClick) {
      e.preventDefault()
      onTagClick(tag.getAttribute('data-tag')!)
    }
  }

  return (
    <div
      ref={containerRef}
      className="markdown-preview"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
