# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

```bash
npm install --legacy-peer-deps   # Install dependencies (legacy flag needed for Ionic/react-router-dom v5 peer conflict)
npm run dev                      # Start Vite dev server → http://localhost:5173
```

Open `http://localhost:5173` in Chrome or Edge. You will see the vault picker on first launch; create an in-app vault or open a local folder. The sidebar shows the file tree on the left, the editor on the right.

## Commands

```bash
# Web
npm run dev       # Start Vite dev server (http://localhost:5173)
npm run build     # TypeScript check + production build → dist/
npm run preview   # Serve the production build locally

# Desktop (Electron)
npm run electron:dev    # Dev mode with HMR — launches Electron window
npm run electron:build  # Production build + package → release/

# Android (Capacitor)
npm run cap:sync          # Copy dist/ into Android project
npm run cap:open:android  # Open Android project in Android Studio
npm run cap:run:android   # Build & run on connected device/emulator
npm run android           # Build + sync + open (full pipeline)
```

## Running & Testing

### Web (desktop browser)

1. `npm run dev` — starts Vite on `http://localhost:5173`
2. Open in Chrome/Edge (required for LocalFSAdapter; any browser works for IndexedDB vaults)
3. On first launch the **VaultPicker** appears — create an in-app vault or open a local folder
4. Use the vault header in the sidebar to switch between vaults at any time
5. `Ctrl+K` opens the quick switcher with fuzzy search; `Ctrl+P` opens the command palette
6. Notes auto-save (default 1 s delay); change the frequency via the dropdown in the editor status bar; `Ctrl+S` always saves immediately

### Desktop (Electron)

Prerequisites: none beyond `npm install`.

```bash
npm run electron:dev     # Start dev mode (Vite + Electron together, with HMR)
npm run electron:build   # Package for distribution → release/
```

The Electron build uses `vite-plugin-electron/simple`. Entry files:
- `electron/main.ts` → compiled to `dist-electron/main.js` (Electron main process)
- `electron/preload.ts` → compiled to `dist-electron/preload.mjs` (contextBridge)

The `ElectronFSAdapter` (`src/storage/ElectronFSAdapter.ts`) uses IPC calls via `window.electronAPI` to read/write files natively. Electron-fs vaults persist their `folderPath` in `localStorage` so they reopen automatically without a dialog.

**App menu integration:** File → Open Folder sends an IPC event to the renderer, which opens the VaultPicker.

**Packaging targets** (configured in `electron-builder.yml`):
- Windows: NSIS installer (x64)
- macOS: DMG (x64 + arm64)
- Linux: AppImage (x64)

### Android

Prerequisites: Android Studio installed, an Android SDK, and either a connected device (USB debugging on) or an AVD emulator running.

```bash
npm run build          # 1. Production build → dist/
npx cap sync           # 2. Copy dist/ + plugins into android/
npx cap open android   # 3. Opens the project in Android Studio
```

In Android Studio: hit **Run ▶** (or `Shift+F10`) to deploy to device/emulator.

Alternatively, skip Android Studio and deploy directly:
```bash
npx cap run android    # Builds & launches on first available device/emulator
```

### GDrive Sync (web only for now)

1. Create an **OAuth 2.0 Web Application** client in Google Cloud Console
2. Add `http://localhost:5173` to **Authorized JavaScript origins**
3. Create `.env.local`:
   ```
   VITE_GDRIVE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
   ```
4. Restart dev server, click the cloud icon in the TitleBar to sign in

**Note:** GDrive auth does not work on Android — Google Identity Services uses popups blocked by WebViews. Use `@codetrix-studio/capacitor-google-auth` for mobile OAuth.

### Verifying a clean build

```bash
npm run build   # Must exit 0 with no TS errors
```

## Architecture

A local-first markdown note-taking app (Obsidian alternative) built with **Ionic React + Capacitor**. Notes are plain `.md` files. GDrive/OneDrive sync is optional — the app works fully offline via IndexedDB. Targets desktop web, Android (Capacitor), and Electron desktop.

### Multi-vault system

The app supports multiple named vaults, each with its own storage backend.

**Vault types:**

| Type | Backing store | Notes |
|---|---|---|
| `indexeddb` | Per-vault Dexie DB (`yaoa-vault-{id}`) | Works everywhere; default "My Vault" uses existing `yaoa-notes` DB |
| `local-fs` | File System Access API directory | Chrome/Edge only; unavailable on Android |
| `electron-fs` | Node.js `fs` via Electron IPC | Electron only; persists `folderPath` in `localStorage` |

**Vault registry** (`src/storage/vaultRegistry.ts`):
- Vault list (id, name, type, timestamps, optional `folderPath`) stored in `localStorage`
- `FileSystemDirectoryHandle` objects for local-fs vaults stored in a separate IDB (`yaoa-registry`) so they survive page reloads
- Active vault ID stored in `localStorage` key `yaoa-active-vault`
- On first run a "My Vault" default is auto-registered so existing data is preserved

**Per-vault DBs** (`src/storage/db.ts`):
- `getVaultDB(vaultId)` factory returns a `NotesDB` instance per vault
- Special ID `'default'` maps to the original `yaoa-notes` DB (backward compat)
- Each vault's notes, links, tags are fully isolated

**VaultContext** (`src/context/vault.tsx`):
- All note operations (CRUD, attachments, drive import) live in `VaultProvider`
- `useVault()` reads from context — components never create their own state
- `VaultProvider` is keyed on vault ID so switching vaults fully remounts and resets state
- `noteAliases: Set<string>` — all known aliases from frontmatter; used for wikilink resolution
- `findNoteByName(name)` — async; tries direct name match then alias lookup via IDB

**VaultPicker** (`src/components/VaultPicker.tsx`):
- Shown on fresh install (non-dismissible) or when the user clicks the vault header (dismissible modal)
- Actions: create in-app vault (IndexedDB), open local folder (LocalFS or ElectronFS), switch/re-open/delete existing vaults
- Re-opening a local-fs vault tries `queryPermission` first; if permission expired, requires a user click to call `requestPermission`

### UI (`src/pages/`, `src/components/`, `src/App.tsx`)

Ionic React shell with `IonReactRouter` (react-router-dom v5). Two pages:

- **`Home`** — note list with tag filtering (`/home?tag=foo`), cloud sync controls, FAB to create
- **`Editor`** — file viewer/editor; behaviour depends on file type (see below)

The app uses a **persistent collapsible sidebar** (`src/components/Sidebar.tsx`) rendered as a CSS flex layout. It collapses to a thin toggle strip. On mobile (<768px) it overlays as an absolute panel.

**Sidebar sections** (VSCode-style collapsible, state persisted in localStorage):
- **Vault header** — vault name + type icon + switch button + new note button
- **Search** — filter box (filters the Files tree)
- **RECENT** — last 8 opened notes; collapses independently
- **FILES** — full folder/file tree with sort controls; collapses independently
- **Tags** — hierarchical tag browser with nested tag support (slash-separated)
- **Outline** — heading outline of the active note
- **Graph view** — button at bottom opens the d3-force graph overlay

The **quick switcher** (`Ctrl+K` / `Cmd+K`) and **command palette** (`Ctrl+P`) are mounted at root level in `App.tsx`.

### Components (`src/components/`)

| Component | Purpose |
|---|---|
| `Sidebar` | Persistent left panel with vault header, collapsible sections, file tree |
| `FolderTree` | Recursive folder/file tree; shows per-kind icons; rename/delete on markdown files only |
| `VaultPicker` | Modal for creating, opening, switching, and deleting vaults |
| `TagBrowser` | Hierarchical tag tree with counts; nested tags via `/` separator |
| `MarkdownEditor` | Textarea + toolbar + preview with edit/split/preview toggle; `[[`/`#` autocomplete |
| `WikilinkAutocomplete` | Dropdown autocomplete for `[[wikilinks]]` and `#tags` in the editor |
| `EditorToolbar` | Formatting buttons (bold, italic, headings, link, list, code, wikilink, etc.) |
| `PreviewPane` | Renders markdown via the `unified`/remark/rehype pipeline; copy buttons on code blocks |
| `BacklinksPanel` | Shows notes linking to current note via the link index |
| `FrontmatterPanel` | Collapsible YAML properties editor above the markdown editor |
| `QuickSwitcher` | `IonModal` fuzzy search, `Ctrl+K` to open |
| `CommandPalette` | `Ctrl+P` command palette with fuzzy search over registered commands |
| `GraphView` | d3-force graph of note links; zoom/drag/click to navigate |

### File types (`src/storage/types.ts`)

`NoteRef` carries an optional `fileKind: FileKind` field:

| FileKind | Extensions | Editor behaviour |
|---|---|---|
| `markdown` | `.md` | Full markdown editor + preview (default) |
| `text` | `.txt`, `.ts`, `.js`, `.json`, `.yaml`, `.css`, `.html`, … | Monospaced plain-text editor |
| `image` | `.png`, `.jpg`, `.gif`, `.svg`, `.webp`, … | Image viewer (`<img>`) |
| `audio` | `.mp3`, `.wav`, `.flac`, `.ogg`, … | Native `<audio controls>` |
| `video` | `.mp4`, `.webm`, `.mov`, … | Native `<video controls>` |
| `pdf` | `.pdf` | `<object>` embed |
| `binary` | everything else | Skipped (not listed in tree) |

`LocalFSAdapter` and `ElectronFSAdapter` populate `fileKind` for every file they list. `IndexedDBAdapter` leaves it undefined (always markdown). `VaultAdapter` has an optional `readBlob(id)` method used by the file viewer for non-text files.

### Utilities (`src/utils/`)

| Utility | Purpose |
|---|---|
| `wikilinks.ts` | Parse `[[target]]` and `[[target\|alias]]` from raw text |
| `tags.ts` | Extract `#tag` patterns from raw text, skip code blocks |
| `fuzzyMatch.ts` | Fuzzy search scorer for quick switcher; `fuzzyFilter<T>(query, items, getText)` helper |
| `pathTree.ts` | Convert flat `NoteRef[]` to folder tree (`TreeNode[]`); threads `fileKind` through |
| `linkIndex.ts` | Index wikilinks + tags + aliases into Dexie; `extractAliases()` parses frontmatter |
| `savePrefs.ts` | Auto-save delay preference (localStorage); options: 200 ms, 500 ms, 1 s, 2 s, manual |

### Storage layer (`src/storage/`)

| File | Purpose |
|---|---|
| `types.ts` | `VaultAdapter`, `NoteRef`, `Note`, `FileKind`, `SyncAdapter`, `Conflict` interfaces |
| `db.ts` | `NotesDB` Dexie class + `getVaultDB(id)` factory |
| `vaultRegistry.ts` | Vault list (localStorage) + FS handle persistence (IDB `yaoa-registry`) |
| `IndexedDBAdapter.ts` | IndexedDB vault; accepts a `NotesDB` instance |
| `LocalFSAdapter.ts` | LocalFS vault; lists all non-binary files; implements `readBlob()` |
| `ElectronFSAdapter.ts` | Electron vault; uses `window.electronAPI` IPC; implements `readBlob()` via base64 |
| `GDriveAdapter.ts` | Google Drive REST API v3 |
| `OneDriveAdapter.ts` | Microsoft Graph API |

**Dexie schema** (`db.ts`) is at **version 5** with these tables:

| Table | Schema | Purpose |
|---|---|---|
| `notes` | `id, path, lastModified, dirty` | Note content + sync flag |
| `syncMeta` | `noteId` | Drive file ID + last synced content |
| `offlineQueue` | `++id, noteId, timestamp` | Queued offline writes |
| `links` | `++id, sourceNoteId, targetName` | Wikilink index |
| `tags` | `++id, noteId, tag` | Tag index |
| `attachments` | `id, createdAt, originalName` | Media blobs (pasted images) |
| `aliases` | `++id, noteId, alias` | Frontmatter alias index for wikilink resolution |

**Attachments** are always stored in the default (`yaoa-notes`) DB regardless of vault type. The markdown embeds `yaoa://attachments/{id}.ext`; `getAttachmentUrl` resolves this to a blob URL.

### Auto-save (`src/utils/savePrefs.ts`, `src/pages/Editor.tsx`)

- Delay options: Instant (200 ms), Fast (500 ms), **Normal (1 s, default)**, Slow (2 s), Manual
- `Ctrl+S` always flushes immediately regardless of the setting
- On unmount, any pending save is always flushed (guards against data loss in manual mode)
- The status-bar dropdown in the editor updates the preference live via a `storage` event

### Markdown rendering (`src/components/PreviewPane.tsx`)

The preview uses a **`unified` / remark / rehype** AST pipeline (not `marked`). Processing is async via `.process()`.

**Pipeline order:**

```
remarkParse
→ remarkGfm          GFM: tables, strikethrough, task lists, autolinks, footnotes
→ remarkMath         $$block$$ and $inline$ math
→ remarkFrontmatter  YAML frontmatter parsing
→ pluginFrontmatterRender   yaml node → <details> table
→ pluginCallouts             > [!type] and > [!type]- callouts
→ pluginBlockRefs            ^block-id anchors on paragraphs
→ pluginInlineSyntax         [[wikilinks]], ![[embeds]], ==highlights==,
                             %%comments%%, #tags, ~sub~, ^sup^
→ remarkRehype       mdast → hast (with callout handler)
→ rehypeRaw          resolve raw HTML nodes from plugins
→ pluginRehypeImageSize      ![alt|300](url) image sizing
→ pluginRehypeMermaid        mermaid code blocks → data-mermaid div
→ rehypeKatex        render math nodes
→ rehypeHighlight    syntax highlighting (auto-detect language)
→ pluginRehypeHeadingSlugs   add id + data-heading-slug to headings
→ pluginRehypeTaskLists      remove disabled, add data-checkbox-index
→ rehypeStringify    hast → HTML string
```

Post-render effects (via `useEffect` on html string):
- **Copy buttons** injected into every `<pre>` block
- **Line numbers** added to fenced code blocks via CSS counter
- **Callout open/close state** restored from a `useRef<Map>` across re-renders

### Wikilink autocomplete (`src/components/WikilinkAutocomplete.tsx`)

Triggered inside `MarkdownEditor` when the user types `[[` (note names) or `#` (tags). Uses `detectAutocomplete()` to find the partial query and `getCaretCoords()` (mirror-div technique) to position the dropdown. Renders via `createPortal` to avoid overflow clipping.

### Frontmatter / Properties (`src/components/FrontmatterPanel.tsx`)

Collapsible panel above the editor for markdown files. Parses `---` YAML blocks, renders each key as an editable field, supports add/rename/delete. Also used by `linkIndex.ts` to extract `aliases:` for wikilink resolution.

`aliases` in frontmatter can be a YAML list (`[a, b]`) or a single value. All aliases are stored in `vaultDb.aliases` and exposed as `noteAliases: Set<string>` on `VaultContext`.

### Graph view (`src/components/GraphView.tsx`)

d3-force simulation reading from `vaultDb.links`. Nodes sized by degree (capped at 12 px radius). Active note highlighted in lavender. Zoom via `d3.zoom`, drag via `d3.drag`. Labels shown for degree > 1 nodes and the active note. Capped at 500 nodes. Opened via the "⬡ Graph view" button at the bottom of the sidebar.

### Command palette (`src/components/CommandPalette.tsx`)

`Ctrl+P` overlay. Accepts a `Command[]` prop (id, label, description, optional icon, action). Fuzzy-filters commands as you type, arrow-key navigation, Enter to execute. Built-in commands: New Note, Quick Switcher, Search All Notes, Switch Vault, Toggle Sidebar, Go to Home.

### Sync (`src/sync/`)

`engine.ts` runs a 30 s polling loop:
1. Push `dirty` notes to Drive (`pushDirtyNotes`)
2. Fetch Drive `changes.list` with a saved `pageToken` (`pullRemoteChanges`)
3. Clean merges applied automatically via `diff.ts` (diff-match-patch 3-way merge)
4. Conflicts surface via the `onConflict` callback → `ConflictModal`

### Auth

- **GDrive** (`src/auth/gdrive.ts`) — Google Identity Services `initTokenClient` with `drive.file` scope; tokens kept in memory
- **OneDrive** (`src/auth/onedrive.ts`) — MSAL browser flow

### React hooks

| Hook | Purpose |
|---|---|
| `useVault` | Re-export of `useContext(VaultContext)`; provides adapter, db, notes, all CRUD ops |
| `useVaultRegistry` | Vault list, active vault, adapter construction, create/open/switch/delete vaults |
| `useSync` | GDrive/OneDrive sign-in/out, sync engine lifecycle, conflict queue |
| `useBacklinks` | Query vault link index for notes linking to a given note name |
| `useKeyboardShortcut` | Register global keydown listeners |

### Electron (`electron/`, `electron-builder.yml`)

- Main process: `electron/main.ts` — `BrowserWindow`, app menus, IPC handlers for all FS ops
- Preload: `electron/preload.ts` — exposes `window.electronAPI` via `contextBridge`
- `tsconfig.electron.json` — separate TS config for `electron/` dir with Node.js types
- In dev mode (`ELECTRON=1 vite`), `vite-plugin-electron/simple` compiles main/preload and spawns Electron automatically
- In production, `electron-builder` packages `dist/` + `dist-electron/` into platform installers

**IPC channels:**
| Channel | Direction | Purpose |
|---|---|---|
| `dialog:openFolder` | renderer→main | Native folder picker dialog |
| `fs:readDir` | renderer→main | Recursive directory listing |
| `fs:stat` | renderer→main | File mtime |
| `fs:readFile` | renderer→main | UTF-8 text read |
| `fs:writeFile` | renderer→main | UTF-8 text write (creates parent dirs) |
| `fs:deleteFile` | renderer→main | File deletion |
| `fs:readBlob` | renderer→main | Binary file read → base64 + mimeType |
| `fs:writeBlob` | renderer→main | Binary file write from base64 |
| `menu:open-folder` | main→renderer | App menu "File → Open Folder" |

### Capacitor (`capacitor.config.ts`, `android/`)

- `appId: 'com.yaoa.notes'`, `webDir: 'dist'`
- `androidScheme: 'https'` for proper CORS/cookie handling
- Android project scaffolded in `android/`
- Capacitor v8 with plugins: `@capacitor/app`, `haptics`, `keyboard`, `status-bar`
- **Cross-platform strategy:** Capacitor is the chosen "build once, deploy everywhere" bridge. The web app IS the app; platform-specific code is limited to native plugin swaps (e.g. Google Auth, Filesystem).

### Theming (`src/index.css`)

Obsidian-inspired dark theme using CSS custom properties (Catppuccin Mocha palette). All colors defined as `--bg-*`, `--text-*`, `--accent-*` variables in `:root`. Ionic CSS variables are overridden to match. Key accent: lavender purple (`#cba6f7`).

### Dependencies

| Package | Purpose |
|---|---|
| `unified` + `remark-*` + `rehype-*` | Markdown AST pipeline |
| `rehype-katex` + `katex` | Math rendering |
| `rehype-highlight` | Syntax highlighting |
| `unist-util-visit` | AST traversal for custom plugins |
| `mermaid` | Diagram rendering (lazy-loaded) |
| `dexie` | IndexedDB wrapper |
| `diff-match-patch` | 3-way merge for sync conflicts |
| `d3` | Force-directed graph visualization |
| `@ionic/react` | UI component library |
| `@capacitor/*` | Native mobile bridge |
| `electron` | Desktop app main process |
| `vite-plugin-electron` | Vite integration for Electron dev + build |
| `electron-builder` | Cross-platform desktop packaging |

## Known Limitations

- **GDrive auth won't work on Android** — needs `@codetrix-studio/capacitor-google-auth` (or similar Capacitor plugin).
- **LocalFSAdapter won't work on Android** — File System Access API unavailable in WebViews.
- **`npm install` requires `--legacy-peer-deps`** — `@ionic/react-router` peers on react-router-dom v5.
- **Attachment sync to GDrive** — blobs stored locally in IndexedDB only; not yet pushed to Drive.
- **Media embeds in LocalFS / GDrive / Electron vaults** — `resolveMedia` wired only for IndexedDB attachments.
- **`rehype-highlight` language coverage** — default lowlight set (~35 languages); uncommon languages render as plain text.
- **Link/tag index rebuild** — updated incrementally on save. If DB is cleared, call `rebuildIndex()` from `src/utils/linkIndex.ts`.
- **LocalFS vault permission** — browsers do not persist FS permissions across page reloads; users must click to re-grant on each session (Chrome preserves within a session).
- **Electron writeBlob large files** — base64 round-trip for binary blobs is fine for images but inefficient for large videos; consider streaming IPC for large files.

## Future Work

- Daily notes (create/open `daily/YYYY-MM-DD.md`)
- Attachment sync to GDrive/OneDrive
- Capacitor Google Auth plugin for mobile GDrive
- iOS support (`npx cap add ios`)
- Folder creation from within the sidebar (right-click → New Folder)
- Drag-and-drop file reordering in the tree
- Live preview / WYSIWYG mode (CodeMirror 6 or ProseMirror)
- Electron auto-updater (`electron-updater`)
- Native system tray + global hotkey to open app (Electron)
