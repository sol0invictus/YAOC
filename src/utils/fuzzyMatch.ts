/** Hand-rolled fuzzy matcher. Scores on consecutive chars, word boundaries, position. */

export interface FuzzyResult {
  score: number
  indices: number[]
}

export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (q.length === 0) return { score: 0, indices: [] }

  const indices: number[] = []
  let qi = 0
  let score = 0
  let lastIdx = -1
  let consecutive = 0

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti)
      // Consecutive bonus
      consecutive = ti === lastIdx + 1 ? consecutive + 1 : 1
      score += consecutive * 2
      // Word boundary bonus
      if (ti === 0 || t[ti - 1] === '/' || t[ti - 1] === ' ' || t[ti - 1] === '-' || t[ti - 1] === '_') {
        score += 5
      }
      // Early position bonus
      score += Math.max(0, 10 - ti)
      lastIdx = ti
      qi++
    }
  }

  if (qi < q.length) return null
  return { score, indices }
}

export function fuzzyFilter<T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
): { item: T; score: number }[] {
  const results: { item: T; score: number }[] = []
  for (const item of items) {
    const result = fuzzyMatch(query, getText(item))
    if (result) results.push({ item, score: result.score })
  }
  return results.sort((a, b) => b.score - a.score)
}
