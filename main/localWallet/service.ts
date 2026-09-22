import fs from 'fs'
import path from 'path'
import http from 'http'
import { createHash } from 'crypto'

export type ReadMethod = 'status' | 'accounts' | 'holdings' | 'connect'
const methods = new Set(['status', 'accounts', 'holdings', 'connect'])
export async function startService(directory: string, dispatch: (method: ReadMethod) => Promise<unknown>) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  fs.chmodSync(directory, 0o700)
  const socket = path.join(directory, 'wallet.sock')
  if (Buffer.byteLength(socket) > 100) throw new Error('Local service path is too long')
  // Caller holds Electron's single-instance lock for this profile.
  fs.rmSync(socket, { force: true })
  const server = http.createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.setHeader('Cache-Control', 'no-store')
    const method = request.url?.slice(1)
    if (
      request.method !== 'POST' ||
      request.headers.origin ||
      !method ||
      !methods.has(method) ||
      (request.headers['content-length'] && request.headers['content-length'] !== '0') ||
      request.headers['transfer-encoding']
    ) {
      response.writeHead(403)
      response.end(JSON.stringify({ error: 'Read-only service request denied' }))
      return
    }
    try {
      response.end(JSON.stringify({ version: 1, result: await dispatch(method as ReadMethod) }))
    } catch {
      response.writeHead(503)
      response.end(JSON.stringify({ error: 'Wallet service unavailable' }))
    }
  })
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(socket, () => resolve())
  })
  fs.chmodSync(socket, 0o600)
  return { socket, close: () => server.close(() => fs.rmSync(socket, { force: true })) }
}
export const profileKey = (profile: string) => createHash('sha256').update(profile).digest('hex').slice(0, 16)
