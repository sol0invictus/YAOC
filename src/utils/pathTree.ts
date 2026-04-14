/** Convert flat NoteRef[] paths into a folder tree */

import type { NoteRef } from '../storage/types'

export interface TreeNode {
  name: string
  path: string
  isFolder: boolean
  children: TreeNode[]
  noteId?: string
}

export function buildPathTree(notes: NoteRef[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isFolder: true, children: [] }

  for (const note of notes) {
    const parts = note.path.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const partPath = parts.slice(0, i + 1).join('/')

      if (isLast) {
        current.children.push({
          name: note.name,
          path: partPath,
          isFolder: false,
          children: [],
          noteId: note.id,
        })
      } else {
        let folder = current.children.find((c) => c.isFolder && c.name === part)
        if (!folder) {
          folder = { name: part, path: partPath, isFolder: true, children: [] }
          current.children.push(folder)
        }
        current = folder
      }
    }
  }

  // Sort: folders first, then alphabetical
  const sortChildren = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    node.children.forEach(sortChildren)
  }
  sortChildren(root)

  return root.children
}
