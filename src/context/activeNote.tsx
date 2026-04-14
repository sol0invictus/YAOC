import { createContext, useContext, useState, useCallback } from 'react'

interface ActiveNoteCtx {
  content: string
  setActiveContent: (c: string) => void
}

const ActiveNoteContext = createContext<ActiveNoteCtx>({ content: '', setActiveContent: () => {} })

export function useActiveNoteContent() {
  return useContext(ActiveNoteContext)
}

export function ActiveNoteProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = useState('')
  const setActiveContent = useCallback((c: string) => setContent(c), [])
  return (
    <ActiveNoteContext.Provider value={{ content, setActiveContent }}>
      {children}
    </ActiveNoteContext.Provider>
  )
}
