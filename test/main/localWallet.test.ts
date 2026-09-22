import fs from 'fs'
import os from 'os'
import path from 'path'
import http from 'http'
import { startService } from '../../main/localWallet/service'

test('local socket is private and rejects signing, browser origins, and request bodies', async () => {
  jest.useRealTimers()
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'op-wallet-'))
  const dispatch = jest.fn(async () => ({ ok: true }))
  const service = await startService(directory, dispatch)
  const request = (method: string, headers: Record<string, string> = {}) =>
    new Promise<number>((resolve) => {
      const req = http.request(
        {
          socketPath: service.socket,
          path: '/' + method,
          method: 'POST',
          agent: false,
          headers: { 'Content-Length': '0', ...headers }
        },
        (res) => {
          res.resume()
          res.on('end', () => resolve(res.statusCode!))
        }
      )
      req.end()
    })
  try {
    expect(fs.statSync(service.socket).mode & 0o777).toBe(0o600)
    for (const method of ['sign', 'export', 'send', 'approve', 'disconnect'])
      expect(await request(method)).toBe(403)
    expect(await request('accounts', { Origin: 'https://evil.test' })).toBe(403)
    expect(await request('holdings', { 'Content-Length': '1' })).toBe(403)
    expect(await request('accounts')).toBe(200)
    expect(dispatch).toHaveBeenCalledTimes(1)
  } finally {
    service.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
