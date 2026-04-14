import { useEffect } from 'react'

export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  opts: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {},
): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrlOrMeta = opts.ctrl || opts.meta
      if (ctrlOrMeta && !(e.ctrlKey || e.metaKey)) return
      if (!ctrlOrMeta && (e.ctrlKey || e.metaKey)) return
      if (opts.shift && !e.shiftKey) return
      if (!opts.shift && e.shiftKey && !opts.ctrl && !opts.meta) return
      if (opts.alt && !e.altKey) return
      if (!opts.alt && e.altKey) return
      if (e.key !== key && e.key.toLowerCase() !== key.toLowerCase()) return

      e.preventDefault()
      callback()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [key, callback, opts.ctrl, opts.meta, opts.shift, opts.alt])
}
