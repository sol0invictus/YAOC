const KEY = 'yaoa-save-delay'

export interface SaveDelayOption {
  label: string
  value: number   // ms; 0 = manual (Ctrl+S only)
}

export const SAVE_DELAY_OPTIONS: SaveDelayOption[] = [
  { label: 'Instant (0.2 s)', value: 200 },
  { label: 'Fast (0.5 s)',    value: 500 },
  { label: 'Normal (1 s)',    value: 1000 },
  { label: 'Slow (2 s)',      value: 2000 },
  { label: 'Manual (Ctrl+S)', value: 0 },
]

export function getSaveDelay(): number {
  const stored = localStorage.getItem(KEY)
  return stored !== null ? parseInt(stored, 10) : 1000
}

export function setSaveDelay(ms: number): void {
  localStorage.setItem(KEY, String(ms))
  // Dispatch a storage event so Editor instances re-read the value
  window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: String(ms) }))
}
