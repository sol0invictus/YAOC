/** Extract #tag patterns from markdown, skipping code blocks and inline code */

const TAG_RE = /#([a-zA-Z][a-zA-Z0-9_/-]*)/g
const CODE_BLOCK_RE = /```[\s\S]*?```|`[^`]+`/g

export function extractTags(text: string): string[] {
  // Replace code blocks/inline code with spaces to preserve indices
  const cleaned = text.replace(CODE_BLOCK_RE, (m) => ' '.repeat(m.length))
  const tags = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = TAG_RE.exec(cleaned)) !== null) {
    tags.add(m[1].toLowerCase())
  }
  return [...tags]
}
