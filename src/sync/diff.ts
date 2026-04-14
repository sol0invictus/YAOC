import DiffMatchPatch from 'diff-match-patch'

const dmp = new DiffMatchPatch()

/** Returns true if the two strings are identical */
export function isSame(a: string, b: string): boolean {
  return a === b
}

/**
 * Attempt a 3-way merge: base → local, base → remote.
 * Returns merged string if clean, null if there are conflicts.
 */
export function tryMerge(base: string, local: string, remote: string): string | null {
  const [merged, conflicts] = dmp.patch_apply(
    dmp.patch_make(base, remote),
    local,
  )
  // patch_apply returns [result, [boolean]] — false entry = failed hunk
  if ((conflicts as boolean[]).some((ok) => !ok)) return null
  return merged
}

/** Compute character-level diffs between two strings (for display) */
export function computeDiffs(a: string, b: string) {
  const diffs = dmp.diff_main(a, b)
  dmp.diff_cleanupSemantic(diffs)
  return diffs
}
