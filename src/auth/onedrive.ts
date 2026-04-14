// Microsoft OneDrive PKCE OAuth2 auth
// Uses window.crypto.subtle for SHA-256 — no npm deps
// Popup-based flow compatible with SPAs

const AUTH_ENDPOINT = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize'
const TOKEN_ENDPOINT = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
const SCOPE = 'https://graph.microsoft.com/Files.ReadWrite offline_access'

let _clientId = ''
let _accessToken: string | null = null
let _tokenExpiry = 0
let _refreshToken: string | null = null

const REFRESH_TOKEN_KEY = 'yaoa_onedrive_refresh_token'

// --- PKCE helpers ---

function generateRandomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function sha256Base64Url(plain: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(plain)
  const digest = await window.crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// --- Token storage ---

function loadRefreshToken(): void {
  _refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY)
}

function saveRefreshToken(token: string): void {
  _refreshToken = token
  sessionStorage.setItem(REFRESH_TOKEN_KEY, token)
}

function clearRefreshToken(): void {
  _refreshToken = null
  sessionStorage.removeItem(REFRESH_TOKEN_KEY)
}

// --- Token exchange ---

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  error?: string
  error_description?: string
}

async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<void> {
  const redirectUri = window.location.origin + '/'
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    client_id: _clientId,
    scope: SCOPE,
  })
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const data = await resp.json() as TokenResponse
  if (data.error) throw new Error(`OneDrive token exchange failed: ${data.error_description ?? data.error}`)
  _accessToken = data.access_token
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  if (data.refresh_token) saveRefreshToken(data.refresh_token)
}

async function refreshAccessToken(): Promise<void> {
  if (!_refreshToken) throw new Error('No OneDrive refresh token available')
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: _refreshToken,
    client_id: _clientId,
    scope: SCOPE,
  })
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const data = await resp.json() as TokenResponse
  if (data.error) {
    clearRefreshToken()
    _accessToken = null
    _tokenExpiry = 0
    throw new Error(`OneDrive token refresh failed: ${data.error_description ?? data.error}`)
  }
  _accessToken = data.access_token
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  if (data.refresh_token) saveRefreshToken(data.refresh_token)
}

// --- Public API ---

export function initOneDriveAuth(clientId: string): void {
  _clientId = clientId
  loadRefreshToken()
}

export function isSignedInToOneDrive(): boolean {
  return !!_accessToken && Date.now() < _tokenExpiry
}

export async function signInToOneDrive(): Promise<void> {
  if (!_clientId) throw new Error('OneDrive auth not initialized — call initOneDriveAuth first')

  const codeVerifier = generateRandomBase64Url(32)
  const codeChallenge = await sha256Base64Url(codeVerifier)
  const redirectUri = window.location.origin + '/'
  const state = generateRandomBase64Url(16)

  const params = new URLSearchParams({
    client_id: _clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPE,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  const authUrl = `${AUTH_ENDPOINT}?${params.toString()}`
  const popup = window.open(authUrl, 'onedrive_auth', 'width=500,height=650,left=200,top=100')
  if (!popup) throw new Error('OneDrive sign-in popup was blocked')

  const code = await new Promise<string>((resolve, reject) => {
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer)
        reject(new Error('OneDrive sign-in popup was closed before completing'))
        return
      }
      try {
        const href = popup.location.href
        if (href.includes('?code=') || href.includes('&code=')) {
          clearInterval(timer)
          popup.close()
          const url = new URL(href)
          const code = url.searchParams.get('code')
          const returnedState = url.searchParams.get('state')
          if (returnedState !== state) {
            reject(new Error('OneDrive auth state mismatch — possible CSRF'))
            return
          }
          if (!code) {
            reject(new Error('OneDrive auth returned no code'))
            return
          }
          resolve(code)
        }
      } catch {
        // Cross-origin — popup is on Microsoft's domain, ignore
      }
    }, 500)
  })

  await exchangeCodeForTokens(code, codeVerifier)
}

export function signOutFromOneDrive(): void {
  _accessToken = null
  _tokenExpiry = 0
  clearRefreshToken()
}

export async function getOneDriveToken(): Promise<string> {
  if (_accessToken && Date.now() < _tokenExpiry) return _accessToken
  if (_refreshToken) {
    await refreshAccessToken()
    return _accessToken!
  }
  throw new Error('Not signed in to OneDrive — call signInToOneDrive first')
}
