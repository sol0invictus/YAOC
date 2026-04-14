# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

```bash
npm install --legacy-peer-deps   # Install dependencies (legacy flag needed for Ionic/react-router-dom v5 peer conflict)
npm run dev                      # Start Vite dev server → http://localhost:5173
```

Open `http://localhost:5173` in a browser. You should see the sidebar file tree on the left, the note list in the main area, and a + FAB button. Press `Ctrl+K` to open the quick switcher.

## Commands

```bash
# Web
npm run dev       # Start Vite dev server (http://localhost:5173)
npm run build     # TypeScript check + production build → dist/
npm run preview   # Serve the production build locally

# Android (Capacitor)
npm run cap:sync          # Copy dist/ into Android project
npm run cap:open:android  # Open Android project in Android Studio
npm run cap:run:android   # Build & run on connected device/emulator
npm run android           # Build + sync + open (full pipeline)
```

## Running & Testing

### Web (desktop browser)

1. `npm run dev` — starts Vite on `http://localhost:5173`
2. Open in Chrome/Edge (required for LocalFSAdapter; any browser works for IndexedDB)
3. Tap the **+** FAB → enter a note name → note appears in the list
4. Notes persist in IndexedDB across page reloads
5. Type markdown, toggle edit/split/preview modes, use toolbar for formatting
6. Paste an image → saved as an attachment in IndexedDB, referenced via `yaoa://attachments/` URI; embed with `![[filename.png]]`
7. Type `[[Other Note]]` → wikilink renders in preview, click to navigate or create
8. `Ctrl+K` opens quick switcher with fuzzy search

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
4. Restart dev server, click the cloud icon in the header to sign in

**Note:** GDrive auth does not work on Android — Google Identity Services uses popups blocked by WebViews. A Capacitor Google Auth plugin is needed for mobile.

### Verifying a clean build

```bash
npm run build   # Must exit 0 with no TS errors
```

## Architecture

A local-first markdown note-taking app (Obsidian alternative) built with **Ionic React + Capacitor**. All notes are plain `.md` files. GDrive sync is optional — the app works offline via IndexedDB. Targets desktop web and Android.

### UI (`src/pages/`, `src/components/`, `src/App.tsx`)

Ionic React shell with `IonReactRouter` (react-router-dom v5). Two pages:

- **`Home`** — note list with tag filtering (`/home?tag=foo`), cloud sync controls, FAB to create
- **`Editor`** — markdown editor with edit/split/preview modes, toolbar, backlinks panel, wikilink click handling

The app uses a **persistent collapsible sidebar** (`src/components/Sidebar.tsx`) rendered as a CSS flex layout (not `IonMenu`/`IonSplitPane`). The sidebar contains the folder tree, search filter, tag browser, and new note button. It collapses to a thin toggle strip. On mobile (<768px) it overlays as an absolute panel.

The **quick switcher** (`Ctrl+K` / `Cmd+K`) is mounted at root level in `App.tsx`.

### Components (`src/components/`)

| Component | Purpose |
|---|---|
| `Sidebar` | Persistent left panel: file tree, filter, tags, new note |
| `FolderTree` | Recursive folder/file tree with expand/collapse |
| `TagBrowser` | Tag list with counts in sidebar |
| `MarkdownEditor` | Textarea + toolbar + preview with edit/split/preview toggle |
| `EditorToolbar` | Formatting buttons (bold, italic, headings, link, list, code, wikilink, etc.) |
| `PreviewPane` | Renders markdown via the `unified`/remark/rehype pipeline; resolves `yaoa://` URIs and vault media |
| `BacklinksPanel` | Shows notes linking to current note via the link index |
| `QuickSwitcher` | `IonModal` fuzzy search, `Ctrl+K` to open |

### Utilities (`src/utils/`)

| Utility | Purpose |
|---|---|
| `wikilinks.ts` | Parse `[[target]]` and `[[target\|alias]]` from raw text (used for indexing) |
| `tags.ts` | Extract `#tag` patterns from raw text, skip code blocks (used for indexing) |
| `fuzzyMatch.ts` | Fuzzy search scorer for quick switcher |
| `pathTree.ts` | Convert flat note paths to folder tree structure |
| `linkIndex.ts` | Index wikilinks + tags into Dexie on note save |

### Storage layer (`src/storage/`)

Three `VaultAdapter` implementations share a common interface (`types.ts`):

| Adapter | Backing store | Notes |
|---|---|---|
| `IndexedDBAdapter` | Dexie (IndexedDB) | Default, works everywhere |
| `LocalFSAdapter` | File System Access API | Chrome/Edge only, guarded on Android |
| `GDriveAdapter` | Google Drive REST API v3 | Requires OAuth sign-in |

**Dexie schema** (`db.ts`) is at **version 4** with these tables:

| Table | Schema | Purpose |
|---|---|---|
| `notes` | `id, path, lastModified, dirty` | Note content + sync flag |
| `syncMeta` | `noteId` | Drive file ID + last synced content |
| `offlineQueue` | `++id, noteId, timestamp` | Queued offline writes |
| `links` | `++id, sourceNoteId, targetName` | Wikilink index |
| `tags` | `++id, noteId, tag` | Tag index |
| `attachments` | `id, createdAt, originalName` | Media blobs stored locally |

**Attachments**: When a user pastes an image, the blob is saved to the `attachments` table with both a generated `id` and the `originalName` (the filename at paste time). The markdown references it as `![image](yaoa://attachments/{id}.png)`. Vault embeds (`![[photo.png]]`) are resolved by `getAttachmentByName` which searches on `originalName`. No base64 is stored in note content.

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

**Supported markdown syntax:**

| Syntax | Output |
|---|---|
| `[[Note]]` | Wikilink (purple if exists, dashed if missing) |
| `[[Note\|alias]]` | Wikilink with display alias |
| `[[Note#Heading]]` | Wikilink to specific heading |
| `![[Note]]` | Full note transclusion |
| `![[Note#Heading]]` | Heading-section transclusion |
| `![[Note#^block-id]]` | Single block transclusion |
| `![[photo.png]]` | Vault image embed (resolved via `resolveMedia`) |
| `![[photo.png\|300]]` | Image embed with max-width |
| `![[photo.png\|300x200]]` | Image embed with width × height |
| `![[audio.mp3]]` | Native `<audio controls>` embed |
| `![[video.mp4]]` | Native `<video controls>` embed |
| `![[doc.pdf]]` | PDF `<object>` embed |
| `![alt\|300](url)` | Standard image with Obsidian-style size hint |
| `#tag`, `#tag/subtag` | Clickable tag spans |
| `==text==` | Highlighted text (`<mark>`) |
| `%%comment%%` | Hidden comment (erased from output) |
| `~text~` | Subscript |
| `^text^` | Superscript |
| `^block-id` | Block anchor (trailing, with leading space) |
| `> [!note] Title` | Callout box |
| `> [!note]- Title` | Collapsible callout |
| `[^1]` / `[^1]: text` | GFM footnotes |
| `$$...$$` / `$...$` | KaTeX math |
| ` ```mermaid ` | Mermaid diagram (lazy-loaded) |
| YAML frontmatter | Rendered as collapsible Properties table |

**Post-render effects** (via `useEffect` after HTML is set):
- Transclusion embeds: fetched and rendered via `readNote` prop
- Media embeds: resolved via `resolveMedia` prop
- `yaoa://` image URIs: resolved via `resolveImageSrc` prop
- Mermaid diagrams: rendered via dynamically imported `mermaid`

**Props:**

| Prop | Type | Purpose |
|---|---|---|
| `content` | `string` | Raw markdown source |
| `existingNotes` | `Set<string>` | Lowercase note names for wikilink colouring |
| `onWikilinkClick` | `(target) => void` | Navigate/create on wikilink click |
| `onTagClick` | `(tag) => void` | Filter by tag |
| `onCheckboxToggle` | `(index) => void` | Toggle task checkbox in source |
| `resolveImageSrc` | `(uri) => Promise<string\|null>` | Resolve `yaoa://attachments/` URIs |
| `readNote` | `(name) => Promise<string\|null>` | Fetch note content by name for transclusion |
| `resolveMedia` | `(name) => Promise<string\|null>` | Resolve vault media filename to blob URL |

### Sync (`src/sync/`)

`engine.ts` runs a 30s polling loop:
1. Push `dirty` notes to Drive (`pushDirtyNotes`)
2. Fetch Drive `changes.list` with a saved `pageToken` (`pullRemoteChanges`)
3. Clean merges are applied automatically via `diff.ts` (diff-match-patch 3-way merge)
4. Conflicts surface via the `onConflict` callback

### Auth (`src/auth/gdrive.ts`)

Uses Google Identity Services `initTokenClient` with `drive.file` scope. No backend needed — tokens are kept in memory and silently refreshed if the Google session cookie is alive.

### React hooks

| Hook | Purpose |
|---|---|
| `useVault` | Vault switching, CRUD, note list, `findNoteByName`, `saveAttachment`, `getAttachmentUrl`, `getAttachmentByName` |
| `useSync` | GDrive sign-in/out, sync engine lifecycle, conflict queue |
| `useBacklinks` | Query link index for notes linking to a given note name |
| `useKeyboardShortcut` | Register global keydown listeners (used for Ctrl+K) |

### Capacitor (`capacitor.config.ts`, `android/`)

- `appId: 'com.yaoa.notes'`, `webDir: 'dist'`
- `androidScheme: 'https'` for proper CORS/cookie handling
- Android project scaffolded in `android/`
- Capacitor v8 with plugins: `@capacitor/app`, `haptics`, `keyboard`, `status-bar`

### Theming (`src/index.css`)

Obsidian-inspired dark theme using CSS custom properties (Catppuccin Mocha palette). All colors defined as `--bg-*`, `--text-*`, `--accent-*` variables in `:root`. Ionic CSS variables are overridden to match. Key accent: lavender purple (`#cba6f7`).

### Dependencies

| Package | Purpose |
|---|---|
| `unified` + `remark-*` + `rehype-*` | Markdown AST pipeline (replaces `marked`) |
| `rehype-katex` + `katex` | Math rendering |
| `rehype-highlight` | Syntax highlighting (auto-detect, common languages) |
| `unist-util-visit` | AST traversal for custom remark/rehype plugins |
| `mermaid` | Diagram rendering (lazy-loaded) |
| `dexie` | IndexedDB wrapper (notes, links, tags, attachments) |
| `diff-match-patch` | 3-way merge for sync conflicts |
| `@ionic/react` | UI component library |
| `@capacitor/*` | Native mobile bridge |

## Known Limitations

- **GDrive auth won't work on Android** — needs a Capacitor Google Auth plugin.
- **LocalFSAdapter won't work on Android** — File System Access API unavailable; guarded with a runtime check in `useVault.ts`. A Capacitor Filesystem adapter can be added later.
- **`npm install` requires `--legacy-peer-deps`** — `@ionic/react-router` peers on react-router-dom v5.
- **Attachment sync to GDrive** — blobs are stored locally in IndexedDB only; not yet pushed to Drive.
- **Media embeds in LocalFS / GDrive vaults** — `resolveMedia` is wired only for IndexedDB attachments. Files that live on disk or Drive cannot yet be resolved by name.
- **`rehype-highlight` language coverage** — uses the default lowlight language set (~35 common languages). Uncommon languages render as plain text.
- **Link/tag index rebuild** — the index is updated incrementally on save. If the DB is cleared, call `rebuildIndex()` from `src/utils/linkIndex.ts` to reindex all notes.

## Future Work

- Wikilink + tag autocomplete (type `[[` / `#` → dropdown)
- Live preview / WYSIWYG mode (CodeMirror 6 or ProseMirror)
- Graph view (d3-force, data from `links` table)
- Command palette (Cmd+P)
- Daily notes (create/open `daily/YYYY-MM-DD.md`)
- Full-text search across all notes
- Attachment sync to GDrive
- Capacitor Google Auth plugin for mobile GDrive
- Media resolution for LocalFS and GDrive adapters
