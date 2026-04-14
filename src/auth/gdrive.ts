// Google Identity Services token client
// Uses short-lived access tokens (1hr); re-requests on expiry via GIS
// drive.file scope = only files this app created/opened

const SCOPES = 'https://www.googleapis.com/auth/drive.file'

let tokenClient: google.accounts.oauth2.TokenClient | null = null
let currentToken: string | null = null
let tokenExpiry = 0

type TokenCallback = (token: string) => void
let pendingCallbacks: TokenCallback[] = []
let resolveOnToken: (() => void) | null = null

export function initGDriveAuth(clientId: string): void {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: (resp: google.accounts.oauth2.TokenResponse) => {
      if (resp.error) {
        pendingCallbacks = []
        return
      }
      currentToken = resp.access_token
      tokenExpiry = Date.now() + (Number(resp.expires_in) - 60) * 1000
      const cbs = pendingCallbacks.splice(0)
      cbs.forEach((cb) => cb(currentToken!))
      if (resolveOnToken) {
        resolveOnToken()
        resolveOnToken = null
      }
    },
  })
}

export function isSignedIn(): boolean {
  return !!currentToken && Date.now() < tokenExpiry
}

export function signOut(): void {
  if (currentToken) {
    google.accounts.oauth2.revoke(currentToken, () => {})
  }
  currentToken = null
  tokenExpiry = 0
}

export async function getToken(): Promise<string> {
  if (currentToken && Date.now() < tokenExpiry) return currentToken
  return new Promise((resolve) => {
    pendingCallbacks.push(resolve)
    // prompt: '' = silent re-auth if Google session is alive
    tokenClient!.requestAccessToken({ prompt: '' })
  })
}

export async function signIn(): Promise<void> {
  return new Promise((resolve) => {
    resolveOnToken = resolve
    tokenClient!.requestAccessToken({ prompt: 'consent' })
  })
}
