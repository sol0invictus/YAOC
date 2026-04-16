import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { IonApp, IonAlert } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { Route, Redirect, Switch, useLocation, useHistory } from 'react-router-dom'
import { initOneDriveAuth } from './auth/onedrive'
import Home from './pages/Home'
import Editor from './pages/Editor'
import Sidebar from './components/Sidebar'
import QuickSwitcher from './components/QuickSwitcher'
import TitleBar from './components/TitleBar'
import TabBar from './components/TabBar'
import ConflictModal from './components/ConflictModal'
import SyncProviderModal from './components/SyncProviderModal'
import VaultPicker from './components/VaultPicker'
import { VaultProvider, useVault } from './context/vault'
import { useVaultRegistry, type VaultEntry } from './hooks/useVaultRegistry'
import { useSync } from './hooks/useSync'
import { ActiveNoteProvider } from './context/activeNote'
import FullTextSearch from './components/FullTextSearch'
import CommandPalette, { type Command } from './components/CommandPalette'
import { useKeyboardShortcut } from './hooks/useKeyboardShortcut'

// OneDrive client ID can be initialized at module load (no external script dependency)
const onedriveClientId = import.meta.env.VITE_ONEDRIVE_CLIENT_ID as string | undefined
if (onedriveClientId) initOneDriveAuth(onedriveClientId)

// GDrive client ID — stored for lazy init once the GIS script has loaded
const gdriveClientId = import.meta.env.VITE_GDRIVE_CLIENT_ID as string | undefined

function loadTabs(): string[] {
  try { return JSON.parse(localStorage.getItem('open-tabs') ?? '[]') } catch { return [] }
}

function saveTabs(tabs: string[]) {
  localStorage.setItem('open-tabs', JSON.stringify(tabs))
}

// ── Inner shell — rendered inside VaultProvider so useVault() works ──────────

function AppShellInner({
  activeVault,
  onSwitchVault,
}: {
  activeVault: VaultEntry | null
  onSwitchVault: () => void
}) {
  const { notes, localFolderName, createNote } = useVault()
  const {
    status: syncStatus,
    signedIn,
    provider,
    gDriveFolderName,
    conflicts,
    authenticate,
    connect,
    changeGDriveFolder,
    handleSignOut,
    manualSync,
    resolveConflict,
    dismissConflict,
  } = useSync(gdriveClientId)
  const location = useLocation()
  const history = useHistory()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showNewNote, setShowNewNote] = useState(false)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [openTabs, setOpenTabs] = useState<string[]>(loadTabs)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  useKeyboardShortcut('p', () => setCommandPaletteOpen(true), { ctrl: true })

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
        activeVault={activeVault}
        onCreateNote={() => setShowNewNote(true)}
        onSwitchVault={onSwitchVault}
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
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={useMemo<Command[]>(() => [
          {
            id: 'new-note',
            label: 'New Note',
            description: 'Create a new markdown note',
            action: () => { setCommandPaletteOpen(false); setShowNewNote(true) },
          },
          {
            id: 'quick-switcher',
            label: 'Open Quick Switcher',
            description: 'Fuzzy search notes by title  (Ctrl+K)',
            action: () => {
              setCommandPaletteOpen(false)
              setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })), 50)
            },
          },
          {
            id: 'search-all',
            label: 'Search All Notes',
            description: 'Full-text search across vault  (Ctrl+Shift+F)',
            action: () => {
              setCommandPaletteOpen(false)
              setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, shiftKey: true, bubbles: true })), 50)
            },
          },
          {
            id: 'switch-vault',
            label: 'Switch Vault',
            description: 'Open the vault picker',
            action: () => { setCommandPaletteOpen(false); onSwitchVault() },
          },
          {
            id: 'toggle-sidebar',
            label: 'Toggle Sidebar',
            description: 'Collapse or expand the sidebar',
            action: () => { setCommandPaletteOpen(false); setSidebarCollapsed((c) => !c) },
          },
          {
            id: 'go-home',
            label: 'Go to Home',
            description: 'Navigate to the notes list',
            action: () => { setCommandPaletteOpen(false); history.push('/home') },
          },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        ], [onSwitchVault, history])}
      />

      <SyncProviderModal
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        signedIn={signedIn}
        provider={provider}
        gDriveFolderName={gDriveFolderName}
        syncStatus={syncStatus}
        localFolderName={localFolderName}
        onAuthenticate={authenticate}
        onConnect={connect}
        onChangeGDriveFolder={changeGDriveFolder}
        onSignOut={() => { handleSignOut(); setShowSyncModal(false) }}
        onManualSync={manualSync}
        onOpenLocalFolder={async () => { /* vault system handles folder opening now */ }}
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

// ── Outer shell — owns vault registry + picker state ─────────────────────────

function AppShell() {
  const {
    vaults,
    activeVault,
    adapterState,
    createIndexedDBVault,
    openFolderVault,
    reopenLocalFSVault,
    switchVault,
    deleteVault,
  } = useVaultRegistry()

  const [showPicker, setShowPicker] = useState(false)

  // Listen for "Open Folder" from Electron app menu
  useEffect(() => {
    if (!window.electronAPI) return
    const unsub = window.electronAPI.onMenuOpenFolder(() => setShowPicker(true))
    return unsub
  }, [])

  // No vault is ready → keep picker open (non-dismissible)
  const pickerOpen = showPicker || !adapterState

  return (
    <>
      {adapterState && (
        <VaultProvider
          key={activeVault?.id ?? 'none'}
          adapter={adapterState.adapter}
          vaultDb={adapterState.vaultDb}
          localFolderName={adapterState.localFolderName}
        >
          <AppShellInner
            activeVault={activeVault}
            onSwitchVault={() => setShowPicker(true)}
          />
        </VaultProvider>
      )}

      {pickerOpen && (
        <VaultPicker
          vaults={vaults}
          activeVaultId={activeVault?.id ?? null}
          dismissible={showPicker && !!adapterState}
          onClose={() => setShowPicker(false)}
          onCreateVault={async (name) => {
            await createIndexedDBVault(name)
          }}
          onOpenFolder={async () => {
            await openFolderVault()
          }}
          onSwitchVault={(id) => {
            switchVault(id)
            setShowPicker(false)
          }}
          onReopenLocalFS={reopenLocalFSVault}
          onDeleteVault={deleteVault}
        />
      )}
    </>
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
