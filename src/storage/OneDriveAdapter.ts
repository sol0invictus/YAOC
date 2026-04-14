import type { SyncAdapter, NoteRef, Note } from './types'
import { getOneDriveToken } from '../auth/onedrive'

const FOLDER_NAME = 'YAOA Notes'
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

async function graphRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getOneDriveToken()
  return fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  })
}

interface GraphItem {
  id: string
  name: string
  lastModifiedDateTime: string
  file?: Record<string, unknown>
  deleted?: Record<string, unknown>
}

interface GraphDeltaResponse {
  value: GraphItem[]
  '@odata.nextLink'?: string
  '@odata.deltaLink'?: string
}

export class OneDriveAdapter implements SyncAdapter {
  readonly syncType = 'onedrive' as const
  private folderId: string | null = null

  private async ensureFolder(): Promise<string> {
    if (this.folderId) return this.folderId

    // Try to create the folder; if it already exists (409) fetch it instead
    const createResp = await graphRequest(`/me/drive/root:/${FOLDER_NAME}:`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      }),
    })

    if (createResp.ok) {
      const created = await createResp.json() as { id: string }
      this.folderId = created.id
      return this.folderId
    }

    if (createResp.status === 409) {
      // Folder already exists — fetch it
      const getResp = await graphRequest(`/me/drive/root:/${FOLDER_NAME}:`)
      if (!getResp.ok) throw new Error(`OneDrive: failed to get folder — ${getResp.status}`)
      const existing = await getResp.json() as { id: string }
      this.folderId = existing.id
      return this.folderId
    }

    throw new Error(`OneDrive: failed to ensure folder — ${createResp.status}`)
  }

  async list(): Promise<NoteRef[]> {
    const folderId = await this.ensureFolder()
    const resp = await graphRequest(
      `/me/drive/items/${folderId}/children?$select=id,name,lastModifiedDateTime,file&$top=1000`,
    )
    if (!resp.ok) throw new Error(`OneDrive list failed: ${resp.status}`)
    const data = await resp.json() as { value: GraphItem[] }
    return data.value
      .filter((item) => item.file !== undefined && item.name.endsWith('.md'))
      .map((item) => ({
        id: item.id,
        path: item.name,
        name: item.name.replace(/\.md$/, ''),
        lastModified: new Date(item.lastModifiedDateTime).getTime(),
      }))
  }

  async read(id: string): Promise<Note> {
    const [metaResp, contentResp] = await Promise.all([
      graphRequest(`/me/drive/items/${id}?$select=id,name,lastModifiedDateTime`),
      graphRequest(`/me/drive/items/${id}/content`),
    ])
    if (!metaResp.ok) throw new Error(`OneDrive read metadata failed: ${metaResp.status}`)
    if (!contentResp.ok) throw new Error(`OneDrive read content failed: ${contentResp.status}`)
    const meta = await metaResp.json() as { id: string; name: string; lastModifiedDateTime: string }
    const content = await contentResp.text()
    return {
      id: meta.id,
      path: meta.name,
      name: meta.name.replace(/\.md$/, ''),
      content,
      lastModified: new Date(meta.lastModifiedDateTime).getTime(),
    }
  }

  async write(id: string, path: string, content: string): Promise<void> {
    const token = await getOneDriveToken()
    if (id.startsWith('new-')) {
      // Create via path-based upload under the folder
      await fetch(
        `${GRAPH_BASE}/me/drive/root:/${FOLDER_NAME}/${encodeURIComponent(path)}:/content`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'text/markdown',
          },
          body: content,
        },
      )
    } else {
      await fetch(`${GRAPH_BASE}/me/drive/items/${id}/content`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/markdown',
        },
        body: content,
      })
    }
  }

  async delete(id: string): Promise<void> {
    const resp = await graphRequest(`/me/drive/items/${id}`, { method: 'DELETE' })
    // 204 No Content on success, 404 if already gone — both are fine
    if (!resp.ok && resp.status !== 404) {
      throw new Error(`OneDrive delete failed: ${resp.status}`)
    }
  }

  /** Consume all delta pages and return the final deltaLink as the start token */
  async getStartToken(): Promise<string> {
    const token = await getOneDriveToken()
    let url = `${GRAPH_BASE}/me/drive/root:/${FOLDER_NAME}:/delta?$select=id,name,lastModifiedDateTime,file,deleted`
    let deltaLink = ''

    while (url) {
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) throw new Error(`OneDrive getStartToken failed: ${resp.status}`)
      const data = await resp.json() as GraphDeltaResponse
      if (data['@odata.deltaLink']) {
        deltaLink = data['@odata.deltaLink']
        break
      }
      if (data['@odata.nextLink']) {
        url = data['@odata.nextLink']
      } else {
        break
      }
    }

    return deltaLink
  }

  /** Poll for changes since the given deltaLink token */
  async pollChanges(token: string): Promise<{ changedIds: string[]; nextToken: string }> {
    if (!token) {
      const startToken = await this.getStartToken()
      return { changedIds: [], nextToken: startToken }
    }

    const accessToken = await getOneDriveToken()
    let url: string | undefined = token
    const changedIds: string[] = []
    let nextToken = token

    while (url) {
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!resp.ok) throw new Error(`OneDrive pollChanges failed: ${resp.status}`)
      const data = await resp.json() as GraphDeltaResponse

      for (const item of data.value) {
        if (!item.deleted && item.file !== undefined && item.name.endsWith('.md')) {
          changedIds.push(item.id)
        }
      }

      if (data['@odata.deltaLink']) {
        nextToken = data['@odata.deltaLink']
        break
      }
      url = data['@odata.nextLink']
    }

    return { changedIds, nextToken }
  }
}
