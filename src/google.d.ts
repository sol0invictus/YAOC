// Minimal type stubs for Google Identity Services and gapi
// loaded at runtime via script tags

declare namespace google {
  namespace accounts {
    namespace oauth2 {
      interface TokenResponse {
        access_token: string
        expires_in: string
        token_type: string
        scope: string
        error?: string
      }

      interface TokenClientConfig {
        client_id: string
        scope: string
        callback: (response: TokenResponse) => void
        error_callback?: (error: { type: string }) => void
      }

      interface TokenClient {
        requestAccessToken(options?: { prompt?: string }): void
      }

      function initTokenClient(config: TokenClientConfig): TokenClient
      function revoke(token: string, callback: () => void): void
    }
  }
}
