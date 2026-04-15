/** Index wikilinks and tags from note content into Dexie tables */

import { db as defaultDb, type NotesDB } from '../storage/db'
import { parseWikilinks } from './wikilinks'
import { extractTags } from './tags'

export async function indexNote(
  noteId: string,
  content: string,
  vaultDb: NotesDB = defaultDb,
): Promise<void> {
  // Clear old entries for this note
  await vaultDb.links.where('sourceNoteId').equals(noteId).delete()
  await vaultDb.tags.where('noteId').equals(noteId).delete()

  // Index wikilinks
  const wikilinks = parseWikilinks(content)
  if (wikilinks.length > 0) {
    await vaultDb.links.bulkAdd(
      wikilinks.map((link) => ({
        sourceNoteId: noteId,
        targetName: link.target.toLowerCase(),
      })),
    )
  }

  // Index tags
  const tags = extractTags(content)
  if (tags.length > 0) {
    await vaultDb.tags.bulkAdd(
      tags.map((tag) => ({
        noteId,
        tag,
      })),
    )
  }
}

export async function rebuildIndex(vaultDb: NotesDB = defaultDb): Promise<void> {
  const allNotes = await vaultDb.notes.toArray()
  await vaultDb.links.clear()
  await vaultDb.tags.clear()
  for (const note of allNotes) {
    await indexNote(note.id, note.content, vaultDb)
  }
}
