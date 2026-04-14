import type { VaultAdapter, NoteRef, Note } from './types'
import { getToken } from '../auth/gdrive'

// App folder name in the user's Drive
const FOLDER_NAME = 'YAOA Notes'
const MIME_MD = 'text/markdown'
const MIME_FOLDER = 'application/vnd.google-apps.folder'

async function driveRequest(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getToken()
  return fetch(`https://www.googleapis.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  })
}

export class GDriveAdapter implements VaultAdapter {
  readonly type = 'gdrive' as const
  private folderId: string | null = null

  private async ensureFolder(): Promise<string> {
    if (this.folderId) return this.folderId

    // Look for existing folder
    const search = await driveRequest(
      `/drive/v3/files?q=name='${FOLDER_NAME}' and mimeType='${MIME_FOLDER}' and trashed=false&fields=files(id,name)`,
    )
    const data = await search.json() as { files: { id: string }[] }

    if (data.files.length > 0) {
      this.folderId = data.files[0].id
      return this.folderId
    }

    // Create folder
    const create = await driveRequest('/drive/v3/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: MIME_FOLDER }),
    })
    const created = await create.json() as { id: string }
    this.folderId = created.id
    return this.folderId
  }

  async list(): Promise<NoteRef[]> {
    const folderId = await this.ensureFolder()
    const resp = await driveRequest(
      `/drive/v3/files?q='${folderId}' in parents and mimeType='${MIME_MD}' and trashed=false&fields=files(id,name,modifiedTime)&pageSize=1000`,
    )
    const data = await resp.json() as {
      files: { id: string; name: string; modifiedTime: string }[]
    }
    return data.files.map((f) => ({
      id: f.id,
      path: f.name,
      name: f.name.replace(/\.md$/, ''),
      lastModified: new Date(f.modifiedTime).getTime(),
    }))
  }

  async read(id: string): Promise<Note> {
    const [meta, content] = await Promise.all([
      driveRequest(`/drive/v3/files/${id}?fields=id,name,modifiedTime`).then((r) => r.json() as Promise<{ id: string; name: string; modifiedTime: string }>),
      driveRequest(`/drive/v3/files/${id}?alt=media`).then((r) => r.text()),
    ])
    return {
      id: meta.id,
      path: meta.name,
      name: meta.name.replace(/\.md$/, ''),
      content,
      lastModified: new Date(meta.modifiedTime).getTime(),
    }
  }

  async write(id: string, path: string, content: string): Promise<void> {
    const folderId = await this.ensureFolder()

    if (id.startsWith('new-')) {
      // Create new file via multipart upload
      const metadata = { name: path, mimeType: MIME_MD, parents: [folderId] }
      const boundary = 'yaoa_boundary'
      const body = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(metadata),
        `--${boundary}`,
        'Content-Type: text/markdown',
        '',
        content,
        `--${boundary}--`,
      ].join('\r\n')

      await driveRequest(
        '/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body,
        },
      )
    } else {
      // Update existing file
      await driveRequest(`/upload/drive/v3/files/${id}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': MIME_MD },
        body: content,
      })
    }
  }

  async delete(id: string): Promise<void> {
    await driveRequest(`/drive/v3/files/${id}`, { method: 'DELETE' })
  }

  /** Get Drive's changes pageToken for incremental sync */
  async getStartPageToken(): Promise<string> {
    const resp = await driveRequest('/drive/v3/changes/startPageToken')
    const data = await resp.json() as { startPageToken: string }
    return data.startPageToken
  }

  /** Returns changed file IDs since pageToken, plus the new token */
  async pollChanges(pageToken: string): Promise<{ changedIds: string[]; nextPageToken: string }> {
    const resp = await driveRequest(
      `/drive/v3/changes?pageToken=${pageToken}&fields=nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,trashed))`,
    )
    const data = await resp.json() as {
      nextPageToken?: string
      newStartPageToken?: string
      changes: { fileId: string; removed?: boolean; file?: { id: string; name: string; mimeType: string; trashed: boolean } }[]
    }
    const changedIds = data.changes
      .filter((c) => !c.removed && c.file?.mimeType === MIME_MD && !c.file.trashed)
      .map((c) => c.fileId)
    return {
      changedIds,
      nextPageToken: data.nextPageToken ?? data.newStartPageToken ?? pageToken,
    }
  }
}
