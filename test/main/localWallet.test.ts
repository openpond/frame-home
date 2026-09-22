import fs from 'fs'
import os from 'os'
import path from 'path'
import http from 'http'
import { createPublicKey, verify } from 'crypto'
import nock from 'nock'
import { Pairing } from '../../main/localWallet/pairing'
import { startService } from '../../main/localWallet/service'

const origin = 'https://wallet.test'
const id = '60cb445c-a602-4afc-9268-2f6f9a4a3fcb'
const address = '0x' + '1'.repeat(40)
let directory: string
beforeEach(() => {
  jest.useRealTimers()
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'op-wallet-'))
})
afterEach(() => {
  nock.cleanAll()
  fs.rmSync(directory, { recursive: true, force: true })
})
const pending = { id, expiresAt: new Date(Date.now() + 300000).toISOString(), version: 1 }
const connected = () => ({
  version: 1,
  state: 'connected',
  walletId: 'personal-id',
  suborgId: 'org-id',
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  accounts: [{ id: address, address, name: 'Personal Vault' }],
  capabilities: ['accounts:read', 'holdings:read']
})

test('pairs a device key, proves possession, persists counters, and removes revoked accounts', async () => {
  const open = jest.fn(async () => {})
  const changed = jest.fn()
  const pairing = new Pairing(directory, origin, changed, open)
  let publicKey = ''
  nock(origin)
    .post('/api/local-wallet', (body) => {
      publicKey = body.publicKey
      return body.action === 'pair'
    })
    .reply(200, pending)
  const state = await pairing.connect()
  expect(state.code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/)
  expect(open).toHaveBeenCalledWith(`${origin}/local-wallet?id=${id}`)
  const counters: number[] = []
  const proof = (body: any) => {
    counters.push(body.counter)
    return verify(
      null,
      Buffer.from(JSON.stringify([1, id, body.counter, body.action])),
      createPublicKey({ key: Buffer.from(publicKey, 'base64'), type: 'spki', format: 'der' }),
      Buffer.from(body.signature, 'base64')
    )
  }
  nock(origin).post('/api/local-wallet', proof).reply(200, connected())
  expect((await pairing.refresh()).accounts).toHaveLength(1)
  const resumed = new Pairing(directory, origin, changed, open)
  nock(origin).post('/api/local-wallet', proof).reply(403, {})
  expect((await resumed.refresh()).accounts).toEqual([])
  expect(resumed.state.state).toBe('unavailable')
  expect(counters).toEqual([1, 2])
  expect(fs.statSync(path.join(directory, 'device.json')).mode & 0o777).toBe(0o600)
  expect(JSON.stringify(changed.mock.calls)).not.toContain('PRIVATE KEY')
})

test.each([
  () => ({ ...connected(), expiresAt: '2020-01-01T00:00:00.000Z' }),
  () => ({ ...connected(), capabilities: ['sign'] }),
  () => ({
    ...connected(),
    accounts: [{ id: address, address: '0x' + '2'.repeat(40), name: 'Personal Vault' }]
  })
])('rejects expired, signing, or substituted account grants', async (response) => {
  const pairing = new Pairing(
    directory,
    origin,
    () => {},
    async () => {}
  )
  nock(origin).post('/api/local-wallet').reply(200, pending)
  await pairing.connect()
  nock(origin).post('/api/local-wallet').reply(200, response())
  expect((await pairing.refresh()).accounts).toEqual([])
})

test('local socket is private and rejects signing, browser origins, and request bodies', async () => {
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
    expect(await request('sign')).toBe(403)
    expect(await request('accounts', { Origin: 'https://evil.test' })).toBe(403)
    expect(await request('holdings', { 'Content-Length': '1' })).toBe(403)
    expect(await request('accounts')).toBe(200)
    expect(dispatch).toHaveBeenCalledTimes(1)
  } finally {
    service.close()
  }
})
