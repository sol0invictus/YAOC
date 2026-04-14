/** Index wikilinks and tags from note content into Dexie tables */

import { db } from '../storage/db'
import { parseWikilinks } from './wikilinks'
import { extractTags } from './tags'

export async function indexNote(noteId: string, content: string): Promise<void> {
  // Clear old entries for this note
  await db.links.where('sourceNoteId').equals(noteId).delete()
  await db.tags.where('noteId').equals(noteId).delete()

  // Index wikilinks
  const wikilinks = parseWikilinks(content)
  if (wikilinks.length > 0) {
    await db.links.bulkAdd(
      wikilinks.map((link) => ({
        sourceNoteId: noteId,
        targetName: link.target.toLowerCase(),
      })),
    )
  }

  // Index tags
  const tags = extractTags(content)
  if (tags.length > 0) {
    await db.tags.bulkAdd(
      tags.map((tag) => ({
        noteId,
        tag,
      })),
    )
  }
}

export async function rebuildIndex(): Promise<void> {
  const allNotes = await db.notes.toArray()
  await db.links.clear()
  await db.tags.clear()
  for (const note of allNotes) {
    await indexNote(note.id, note.content)
  }
}
