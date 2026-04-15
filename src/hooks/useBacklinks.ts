import { useState, useEffect } from 'react'
import { useVault } from './useVault'

export interface Backlink {
  noteId: string
  noteName: string
  context: string
}

export function useBacklinks(noteName: string): Backlink[] {
  const { vaultDb } = useVault()
  const [backlinks, setBacklinks] = useState<Backlink[]>([])

  useEffect(() => {
    if (!noteName) return
    let cancelled = false

    async function load() {
      const links = await vaultDb.links
        .where('targetName')
        .equals(noteName.toLowerCase())
        .toArray()

      const results: Backlink[] = []
      for (const link of links) {
        const note = await vaultDb.notes.get(link.sourceNoteId)
        if (!note) continue
        const idx = note.content.toLowerCase().indexOf(`[[${noteName.toLowerCase()}`)
        const start = Math.max(0, idx - 25)
        const end = Math.min(note.content.length, idx + 50)
        const context =
          (start > 0 ? '...' : '') +
          note.content.slice(start, end).replace(/\n/g, ' ') +
          (end < note.content.length ? '...' : '')

        results.push({ noteId: note.id, noteName: note.name, context })
      }

      if (!cancelled) setBacklinks(results)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [noteName, vaultDb])

  return backlinks
}
