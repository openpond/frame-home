import { createHash, generateKeyPairSync, sign } from 'crypto'
import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'
import { z } from 'zod'

const grant = z.object({
  version: z.literal(1),
  state: z.literal('connected'),
  walletId: z.string().min(1),
  suborgId: z.string().min(1),
  expiresAt: z.string().datetime(),
  accounts: z
    .array(
      z.object({
        id: z.string().regex(/^0x[0-9a-f]{40}$/),
        address: z.string().regex(/^0x[0-9a-f]{40}$/),
        name: z.literal('Personal Vault')
      })
    )
    .length(1),
  capabilities: z.tuple([z.literal('accounts:read'), z.literal('holdings:read')])
})
type Credentials = { id: string; privateKey: string; publicKey: string; counter: number; origin: string }
export type Connection = {
  state: string
  accounts: { id: string; address: string; name: string }[]
  code?: string
  expiresAt?: string
}
export class Pairing {
  private credentials?: Credentials
  private queue: Promise<unknown> = Promise.resolve()
  private timer?: NodeJS.Timeout
  private refreshPromise?: Promise<Connection>
  private denied = false
  state: Connection = { state: 'disconnected', accounts: [] }
  constructor(
    private directory: string,
    private origin: string,
    private changed: (state: Connection) => void,
    private open: (url: string) => Promise<unknown>
  ) {
    const parsed = new URL(origin)
    if (parsed.protocol !== 'https:' || parsed.origin !== origin)
      throw new Error('Wallet origin must be an HTTPS origin')
    try {
      const stored = JSON.parse(fs.readFileSync(this.filename, 'utf8')) as Credentials
      if (stored.origin === origin) {
        this.credentials = stored
        this.state.code = this.code(stored.publicKey)
      }
    } catch {
      /* No existing grant. */
    }
  }
  private get filename() {
    return path.join(this.directory, 'device.json')
  }
  private code(publicKey: string) {
    return createHash('sha256')
      .update(publicKey)
      .digest('hex')
      .slice(0, 12)
      .toUpperCase()
      .match(/.{4}/g)!
      .join('-')
  }
  private save() {
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    fs.writeFileSync(this.filename + '.tmp', JSON.stringify(this.credentials), { mode: 0o600 })
    fs.renameSync(this.filename + '.tmp', this.filename)
  }
  private publish(state: Connection) {
    if (JSON.stringify(this.state) === JSON.stringify(state)) return this.state
    this.state = state
    this.changed(state)
    return state
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn, fn)
    this.queue = result.catch(() => {})
    return result
  }
  private async post(body: unknown) {
    const response = await fetch(`${this.origin}/api/local-wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeout: 10_000,
      size: 16_384,
      redirect: 'error'
    })
    if (!response.ok) throw Object.assign(new Error('Device request denied'), { status: response.status })
    return response.json()
  }
  private async request(action: 'read' | 'revoke') {
    if (!this.credentials) throw new Error('Wallet not paired')
    const { id, privateKey } = this.credentials
    const counter = ++this.credentials.counter
    this.save() // Persist before transmission so a restart cannot reuse a counter.
    const signature = sign(null, Buffer.from(JSON.stringify([1, id, counter, action])), privateKey).toString(
      'base64'
    )
    return this.post({ id, counter, action, signature })
  }
  connect() {
    return this.serial(async () => {
      if (this.credentials) {
        try {
          await this.request('revoke')
        } catch (error) {
          if ((error as { status?: number }).status !== 403) throw error
        }
      }
      const keys = generateKeyPairSync('ed25519')
      const publicKey = keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
      const pending = z
        .object({ id: z.string().uuid(), expiresAt: z.string().datetime(), version: z.literal(1) })
        .parse(await this.post({ action: 'pair', publicKey }))
      this.credentials = {
        id: pending.id,
        privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        publicKey,
        counter: 0,
        origin: this.origin
      }
      this.denied = false
      this.save()
      const code = this.code(publicKey)
      const state = this.publish({ state: 'pending', accounts: [], code, expiresAt: pending.expiresAt })
      await this.open(`${this.origin}/local-wallet?id=${pending.id}`)
      return state
    })
  }
  refresh(): Promise<Connection> {
    if (this.refreshPromise) return this.refreshPromise
    this.refreshPromise = this.serial(async () => {
      if (!this.credentials || this.denied) return this.state
      try {
        const result = await this.request('read')
        if (result.state === 'pending')
          return this.publish({ ...this.state, state: 'pending', accounts: [], expiresAt: result.expiresAt })
        const connected = grant.parse(result)
        if (
          Date.parse(connected.expiresAt) <= Date.now() ||
          connected.accounts.some((a) => a.id !== a.address)
        )
          throw new Error('Invalid grant')
        return this.publish({
          state: 'connected',
          accounts: connected.accounts,
          expiresAt: connected.expiresAt
        })
      } catch (error) {
        if ((error as { status?: number }).status === 403) this.denied = true
        // Fail closed: no remote accounts remain visible after a failed verification.
        return this.publish({ state: 'unavailable', accounts: [] })
      }
    }).finally(() => {
      this.refreshPromise = undefined
    })
    return this.refreshPromise
  }
  disconnect() {
    return this.serial(async () => {
      if (this.credentials) {
        try {
          await this.request('revoke')
        } catch (error) {
          if ((error as { status?: number }).status !== 403) throw error
        }
      }
      this.credentials = undefined
      fs.rmSync(this.filename, { force: true })
      return this.publish({ state: 'disconnected', accounts: [] })
    })
  }
  start() {
    void this.refresh()
    this.timer = setInterval(() => void this.refresh(), 5000)
  }
  close() {
    if (this.timer) clearInterval(this.timer)
  }
}
