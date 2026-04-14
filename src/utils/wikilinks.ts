/** Parse [[wikilinks]] and [[target|alias]] from markdown text */

export interface WikiLink {
  target: string
  alias: string | null
  start: number
  end: number
}

const WIKILINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g

export function parseWikilinks(text: string): WikiLink[] {
  const links: WikiLink[] = []
  let m: RegExpExecArray | null
  while ((m = WIKILINK_RE.exec(text)) !== null) {
    links.push({
      target: m[1].trim(),
      alias: m[2]?.trim() ?? null,
      start: m.index,
      end: m.index + m[0].length,
    })
  }
  return links
}
