/** Index wikilinks, tags, and frontmatter aliases from note content into Dexie tables */

import { db as defaultDb, type NotesDB } from '../storage/db'
import { parseWikilinks } from './wikilinks'
import { extractTags } from './tags'

/** Extract aliases from YAML frontmatter `aliases:` field.
 *  Handles both list syntax `[a, b]` and single-value `MyAlias`. */
export function extractAliases(content: string): string[] {
  if (!content.startsWith('---')) return []
  const end = content.indexOf('\n---', 3)
  if (end === -1) return []
  const yaml = content.slice(4, end)
  for (const line of yaml.split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    if (key.toLowerCase() !== 'aliases') continue
    const raw = line.slice(colon + 1).trim()
    if (!raw) continue
    // List syntax: [Alias One, "Alias Two", 'Three']
    if (raw.startsWith('[') && raw.endsWith(']')) {
      return raw
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    }
    // Single value
    return [raw.replace(/^['"]|['"]$/g, '')]
  }
  return []
}

export async function indexNote(
  noteId: string,
  content: string,
  vaultDb: NotesDB = defaultDb,
): Promise<void> {
  await vaultDb.links.where('sourceNoteId').equals(noteId).delete()
  await vaultDb.tags.where('noteId').equals(noteId).delete()
  await vaultDb.aliases.where('noteId').equals(noteId).delete()

  const wikilinks = parseWikilinks(content)
  if (wikilinks.length > 0) {
    await vaultDb.links.bulkAdd(
      wikilinks.map((link) => ({ sourceNoteId: noteId, targetName: link.target.toLowerCase() })),
    )
  }

  const tags = extractTags(content)
  if (tags.length > 0) {
    await vaultDb.tags.bulkAdd(tags.map((tag) => ({ noteId, tag })))
  }

  const aliases = extractAliases(content)
  if (aliases.length > 0) {
    await vaultDb.aliases.bulkAdd(aliases.map((alias) => ({ noteId, alias: alias.toLowerCase() })))
  }
}

export async function rebuildIndex(vaultDb: NotesDB = defaultDb): Promise<void> {
  const allNotes = await vaultDb.notes.toArray()
  await vaultDb.links.clear()
  await vaultDb.tags.clear()
  await vaultDb.aliases.clear()
  for (const note of allNotes) {
    await indexNote(note.id, note.content, vaultDb)
  }
}
