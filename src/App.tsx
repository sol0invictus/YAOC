import { useState, useCallback, useMemo, useEffect } from 'react'
import { IonApp, IonAlert } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { Route, Redirect, Switch, useLocation, useHistory } from 'react-router-dom'
import { initGDriveAuth } from './auth/gdrive'
import { initOneDriveAuth } from './auth/onedrive'
import Home from './pages/Home'
import Editor from './pages/Editor'
import Sidebar from './components/Sidebar'
import QuickSwitcher from './components/QuickSwitcher'
import TitleBar from './components/TitleBar'
import TabBar from './components/TabBar'
import ConflictModal from './components/ConflictModal'
import SyncProviderModal from './components/SyncProviderModal'
import { useVault } from './hooks/useVault'
import { useSync } from './hooks/useSync'
import { ActiveNoteProvider } from './context/activeNote'
import FullTextSearch from './components/FullTextSearch'

// Initialize auth clients once at module load
const gdriveClientId = import.meta.env.VITE_GDRIVE_CLIENT_ID as string | undefined
if (gdriveClientId) initGDriveAuth(gdriveClientId)

const onedriveClientId = import.meta.env.VITE_ONEDRIVE_CLIENT_ID as string | undefined
if (onedriveClientId) initOneDriveAuth(onedriveClientId)

function loadTabs(): string[] {
  try { return JSON.parse(localStorage.getItem('open-tabs') ?? '[]') } catch { return [] }
}

function saveTabs(tabs: string[]) {
  localStorage.setItem('open-tabs', JSON.stringify(tabs))
}

function AppShell() {
  const { notes, createNote } = useVault()
  const {
    status: syncStatus,
    signedIn,
    provider,
    conflicts,
    handleSignIn,
    handleSignOut,
    manualSync,
    resolveConflict,
    dismissConflict,
  } = useSync()
  const location = useLocation()
  const history = useHistory()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showNewNote, setShowNewNote] = useState(false)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [openTabs, setOpenTabs] = useState<string[]>(loadTabs)

  const activeNoteId = useMemo(() => {
    const match = location.pathname.match(/^\/editor\/(.+)/)
    return match ? match[1] : null
  }, [location.pathname])

  const activeNote = useMemo(
    () => (activeNoteId ? (notes.find((n) => n.id === activeNoteId) ?? null) : null),
    [activeNoteId, notes],
  )

  // When navigating to a note, add it to tabs if not already there
  useEffect(() => {
    if (!activeNoteId) return
    setOpenTabs((prev) => {
      if (prev.includes(activeNoteId)) return prev
      const next = [...prev, activeNoteId]
      saveTabs(next)
      return next
    })
  }, [activeNoteId])

  const handleSelectTab = useCallback((id: string) => {
    history.push(`/editor/${id}`)
  }, [history])

  const handleCloseTab = useCallback((id: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t !== id)
      saveTabs(next)
      // If closing the active tab, navigate to adjacent tab or home
      if (id === activeNoteId) {
        const idx = prev.indexOf(id)
        const target = next[Math.min(idx, next.length - 1)]
        if (target) history.push(`/editor/${target}`)
        else history.push('/home')
      }
      return next
    })
  }, [activeNoteId, history])

  const handleCreateNote = useCallback(
    async (name: string) => {
      if (!name.trim()) return
      const note = await createNote(name.trim())
      history.push(`/editor/${note.id}`)
    },
    [createNote, history],
  )

  return (
    <div className="app-layout">
      <Sidebar
        notes={notes}
        onCreateNote={() => setShowNewNote(true)}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
        activeNoteId={activeNoteId}
      />

      <div className="app-main">
        <TitleBar
          activeNote={activeNote}
          syncStatus={syncStatus}
          signedIn={signedIn}
          provider={provider}
          onOpenSync={() => setShowSyncModal(true)}
        />
        <TabBar
          tabs={openTabs}
          activeId={activeNoteId}
          notes={notes}
          onSelect={handleSelectTab}
          onClose={handleCloseTab}
        />
        <div className="app-content">
          <Switch>
            <Route exact path="/home" component={Home} />
            <Route exact path="/editor/:id" component={Editor} />
            <Redirect exact from="/" to="/home" />
          </Switch>
        </div>
      </div>

      <QuickSwitcher notes={notes} onCreateNote={handleCreateNote} />
      <FullTextSearch />

      <SyncProviderModal
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        signedIn={signedIn}
        provider={provider}
        syncStatus={syncStatus}
        onSignIn={async (p) => { await handleSignIn(p); setShowSyncModal(false) }}
        onSignOut={() => { handleSignOut(); setShowSyncModal(false) }}
        onManualSync={manualSync}
      />

      {conflicts[0] && (
        <ConflictModal
          conflict={conflicts[0]}
          onResolve={resolveConflict}
          onDismiss={dismissConflict}
        />
      )}

      <IonAlert
        isOpen={showNewNote}
        onDidDismiss={() => setShowNewNote(false)}
        header="New Note"
        inputs={[{ name: 'name', type: 'text', placeholder: 'Note name' }]}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Create',
            handler: (data: { name: string }) => handleCreateNote(data.name),
          },
        ]}
      />
    </div>
  )
}

export default function App() {
  return (
    <IonApp>
      <ActiveNoteProvider>
        <IonReactRouter>
          <AppShell />
        </IonReactRouter>
      </ActiveNoteProvider>
    </IonApp>
  )
}
