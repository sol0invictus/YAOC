# Cloud Sync Setup

YAOA supports syncing your vault to **Google Drive** or **Microsoft OneDrive**. Both use OAuth2 so no passwords are ever stored. Notes are saved as plain `.md` files inside a `YAOA Notes` folder in your cloud storage.

Sync is optional — the app works fully offline via IndexedDB without any setup.

---

## Google Drive

### 1. Create an OAuth client

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a project (or select an existing one).
2. Navigate to **APIs & Services → Library** and enable the **Google Drive API**.
3. Go to **APIs & Services → OAuth consent screen**:
   - Choose **External** user type.
   - Fill in the app name (e.g. `YAOA Notes`) and your email.
   - Add the scope `https://www.googleapis.com/auth/drive.file` (Drive files this app creates).
   - Add your Google account as a test user while the app is in testing mode.
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**:
   - Application type: **Web application**
   - Under **Authorized JavaScript origins** add:
     - `http://localhost:5173` (dev)
     - Your production origin if deploying (e.g. `https://notes.example.com`)
   - Leave **Authorized redirect URIs** empty (not needed for the token client flow).
5. Copy the **Client ID** (looks like `123456789-abc.apps.googleusercontent.com`).

### 2. Add the client ID to your environment

Create a `.env.local` file in the project root (copy from `.env.example`):

```env
VITE_GDRIVE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
```

Restart the dev server (`npm run dev`) after adding the file.

### 3. Connect inside the app

1. Click the **cloud icon** in the top-right corner of the title bar.
2. Select **Google Drive** → click **Connect**.
3. A Google sign-in popup appears — sign in and grant access.
4. The icon turns solid and sync begins immediately. Notes are pushed every 30 seconds automatically.

### Notes

- The `drive.file` scope means YAOA can only access files it created — it cannot read the rest of your Drive.
- GDrive auth uses short-lived access tokens (1 hour) silently refreshed via Google Identity Services as long as your Google session cookie is active.
- GDrive sync does **not** work on Android (WebView blocks the GIS popup). A Capacitor Google Auth plugin is needed for mobile.

---

## Microsoft OneDrive

### 1. Register an Azure app

1. Go to the [Azure Portal](https://portal.azure.com/) → **Microsoft Entra ID** (formerly Azure AD) → **App registrations → New registration**.
2. Fill in:
   - **Name**: `YAOA Notes` (or anything you like)
   - **Supported account types**: **Personal Microsoft accounts only** (consumers)
   - **Redirect URI**: choose **Single-page application (SPA)** and enter `http://localhost:5173/`
     - Add your production origin too if deploying (e.g. `https://notes.example.com/`)
3. Click **Register**.
4. On the app overview page, copy the **Application (client) ID** (a UUID like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
5. Go to **Authentication** and confirm:
   - The redirect URI `http://localhost:5173/` is listed under **Single-page application**.
   - **Allow public client flows** can stay off — PKCE handles security without a client secret.
6. Go to **API permissions → Add a permission → Microsoft Graph → Delegated permissions** and add:
   - `Files.ReadWrite`
   - `offline_access` (for refresh tokens)
   - Click **Grant admin consent** if your account allows it; otherwise users will be prompted on first sign-in.

> No client secret is needed. The SPA uses PKCE (Proof Key for Code Exchange) which is secure without a secret.

### 2. Add the client ID to your environment

Add to `.env.local`:

```env
VITE_ONEDRIVE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

You can have both `VITE_GDRIVE_CLIENT_ID` and `VITE_ONEDRIVE_CLIENT_ID` in the same file — only the provider you connect to is used.

Restart the dev server after adding the file.

### 3. Connect inside the app

1. Click the **cloud icon** in the top-right corner.
2. Select **Microsoft OneDrive** → click **Connect**.
3. A Microsoft sign-in popup appears — sign in with your personal Microsoft account and grant the requested permissions.
4. The popup closes automatically and sync starts. Notes appear in `OneDrive / YAOA Notes /`.

### Notes

- Tokens are persisted in `sessionStorage` so you stay signed in across page reloads within the same browser session. Closing the browser tab will require re-signing in.
- The initial sync fetches a delta snapshot of the `YAOA Notes` folder. Subsequent polls use Microsoft Graph delta links for efficient incremental changes.
- The `consumers` OAuth endpoint is used, which means **work/school Microsoft accounts (Entra ID) are not supported** — only personal accounts (`outlook.com`, `hotmail.com`, `live.com`, etc.). To support work accounts, change the authority to `common` in `src/auth/onedrive.ts`.

---

## Conflict resolution

When the same note is edited on two devices between syncs, YAOA detects the conflict and opens the **Conflict Resolution** modal automatically:

- **Your version** (left) — what's in this browser
- **Remote version** (right) — what's in the cloud
- Lines only in your version are highlighted red; lines only in the remote are highlighted green
- The **Result** textarea is editable — you can compose a manual merge
- **Use Mine** / **Use Theirs** — one-click to pick a side
- **Save** — pushes the result back to the cloud
- **Skip** — dismisses the modal for now; the conflict will reappear on the next sync cycle

---

## Switching providers

You can only be connected to one provider at a time. To switch:

1. Click the cloud icon → **Disconnect**.
2. Click **Connect** and choose the other provider.

Local notes written while connected to one provider are not automatically migrated to the other. Both providers create their own `YAOA Notes` folder in the respective cloud storage.

---

## Environment variable reference

| Variable | Required for | Example |
|---|---|---|
| `VITE_GDRIVE_CLIENT_ID` | Google Drive sync | `123456789-abc.apps.googleusercontent.com` |
| `VITE_ONEDRIVE_CLIENT_ID` | OneDrive sync | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |

Neither variable is required if you don't use cloud sync.
