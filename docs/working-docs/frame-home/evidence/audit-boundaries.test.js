// Investigation probes: assertions document vulnerable CURRENT behavior, not desired behavior.
// Uses synthetic accounts, mocked chains/signers/workers, in-memory HTTP/WS events and fake time.
// No real wallet, socket listener, RPC endpoint, or transaction is used.
import { EventEmitter } from 'events'
import { fork } from 'child_process'
import log from 'electron-log'
import WebSocket from 'ws'
import httpServer from '../../../../main/api/http'
import wsServer from '../../../../main/api/ws'
import provider from '../../../../main/provider'
import accounts from '../../../../main/accounts'
import connection from '../../../../main/chains'
import store from '../../../../main/store'
import { parseOrigin } from '../../../../main/api/origins'
import portfolioScanner from '../../../../main/externalData/portfolio'
import BalancesWorkerController from '../../../../main/externalData/balances/controller'
import rates from '../../../../main/externalData/assets'
import { AssetType } from '@framelabs/pylon-client'
import { portfolio } from '../../../../app/home/portfolio'

jest.mock('../../../../main/store')
jest.mock('../../../../main/chains', () => ({ send: jest.fn(), syncDataEmit: jest.fn(), on: jest.fn() }))
jest.mock('../../../../main/accounts', () => ({}))
jest.mock('../../../../main/reveal', () => ({ resolveEntityType: jest.fn() }))
jest.mock('../../../../main/windows', () => ({}))
jest.mock('child_process', () => ({ fork: jest.fn() }))
jest.mock('ws')

const address = '0x1111111111111111111111111111111111111111'
const deniedOrigin = 'audit-unapproved.example'
const request = (method, params = []) => ({ id: 1, jsonrpc: '2.0', method, params })

beforeAll(() => {
  log.transports.console.level = false
})
afterAll(() => {
  log.transports.console.level = 'debug'
})
beforeEach(() => {
  store.set('main.origins', {})
  store.set('main.permissions', address, {
    denied: { origin: deniedOrigin, provider: false }
  })
  store.initOrigin = (id, origin) => store.set('main.origins', id, origin)
  store.addOriginRequest = jest.fn()
  store.endOriginSession = jest.fn()
  accounts.current = () => ({ id: address, address, getAccounts: () => [address] })
  accounts.getSelectedAddresses = () => [address]
  accounts.addRequest = jest.fn()
  connection.connections = { ethereum: { 1: { chainConfig: { chainId: 1 } } } }
})
afterEach(() => {
  jest.clearAllTimers()
})

function post(server, payload, origin = deniedOrigin) {
  const req = new EventEmitter()
  req.method = 'POST'
  req.headers = { origin: `https://${origin}` }
  const res = new EventEmitter()
  res.setHeader = jest.fn()
  res.writeHead = (status) => {
    res.status = status
  }
  const result = new Promise((resolve) => {
    res.end = (body) => resolve({ status: res.status, body: JSON.parse(body) })
  })
  server.emit('request', req, res)
  req.emit('data', Buffer.from(JSON.stringify(payload)))
  req.emit('end')
  return result
}

describe('S1: authorization precedes envelope normalization', () => {
  test('HTTP denies direct eth_accounts but returns the same account through both envelopes', async () => {
    const server = httpServer()
    expect((await post(server, request('eth_accounts'))).status).toBe(401)
    for (const method of ['wallet_request', 'caip_request']) {
      const response = await post(
        server,
        request(method, {
          chainId: 'eip155:1',
          session: 'synthetic',
          request: { method: 'eth_accounts', params: [] }
        })
      )
      expect(response.status).toBe(200)
      expect(response.body.result).toEqual([address])
    }
    expect(accounts.addRequest).not.toHaveBeenCalled()
  })

  test('WebSocket has the same direct-versus-wrapped authorization gap', async () => {
    const connection = new EventEmitter()
    WebSocket.Server.mockReturnValueOnce(connection)
    wsServer({})
    const socket = new EventEmitter()
    socket.readyState = WebSocket.OPEN
    const responses = []
    socket.send = (body) => responses.push(JSON.parse(body))
    connection.emit('connection', socket, { headers: { origin: `https://${deniedOrigin}` }, url: '/' })
    const handler = socket.listeners('message')[0]
    await handler(JSON.stringify(request('eth_accounts')))
    expect(responses.pop().error.code).toBe(4001)
    await handler(
      JSON.stringify(
        request('wallet_request', {
          chainId: 'eip155:1',
          request: { method: 'eth_accounts', params: [] }
        })
      )
    )
    expect(responses.pop().result).toEqual([address])
    expect(accounts.addRequest).not.toHaveBeenCalled()
    socket.emit('close')
  })
})

test('S2: a second origin consumes a first-origin HTTP subscription queue using its pollId', async () => {
  const server = httpServer()
  const pollId = 'synthetic-known-poll-id'
  const subscription = await post(
    server,
    { ...request('eth_subscribe', ['accountsChanged']), pollId },
    'owner.example'
  )
  const event = {
    jsonrpc: '2.0',
    method: 'eth_subscription',
    params: { subscription: subscription.body.result, result: [address] }
  }
  // Emulates an event already authorized by the provider for the owner.
  provider.emit('data:subscription', event)
  const stolen = await post(server, request('eth_pollSubscriptions', [pollId, 'immediate']))
  expect(stolen.body.result.map(JSON.parse)).toEqual([event])
  const drained = await post(server, request('eth_pollSubscriptions', [pollId, 'immediate']), 'owner.example')
  expect(drained.body.result).toEqual([])
})

test('S3: permission origin identity collapses HTTP and HTTPS', () => {
  expect(parseOrigin('http://wallet.example')).toBe(parseOrigin('https://wallet.example'))
})

test('P1: slow scans starve the tail of a six-account list over ten simulated minutes', async () => {
  const addresses = Array.from({ length: 6 }, (_, i) => `synthetic-account-${i}`)
  const starts = Object.fromEntries(addresses.map((id) => [id, 0]))
  const scanner = portfolioScanner({
    addresses: () => addresses,
    chains: () => [1],
    visible: () => true,
    ready: () => true,
    report: () => {},
    scan: (id) => {
      starts[id]++
      return new Promise((resolve) => setTimeout(() => resolve(true), 59000))
    }
  })
  await jest.advanceTimersByTimeAsync(600000)
  scanner.close()
  expect(starts[addresses[0]]).toBeGreaterThan(1)
  expect(starts[addresses[2]]).toBeGreaterThan(1)
  expect(starts[addresses[4]]).toBe(0)
  expect(starts[addresses[5]]).toBe(0)
  console.log('P1 synthetic scan starts:', JSON.stringify(starts))
})

test('P2: controller timeout releases a slot without sending cancellation or killing the worker', async () => {
  const worker = new EventEmitter()
  worker.pid = 12345
  worker.connected = true
  worker.channel = {}
  worker.send = jest.fn()
  worker.kill = jest.fn()
  fork.mockReturnValueOnce(worker)
  const controller = new BalancesWorkerController()
  worker.emit('message', { type: 'ready' })
  const result = controller.scanAccount(address, [], [1]).catch((error) => error.message)
  await jest.advanceTimersByTimeAsync(60000)
  expect(await result).toBe('Account balance scan timed out')
  expect(worker.send.mock.calls.map(([message]) => message.command)).toEqual([
    'scanAccount',
    'heartbeat',
    'heartbeat',
    'heartbeat'
  ])
  expect(worker.kill).not.toHaveBeenCalled()
  controller.close()
})

test('C1: rates for the same contract address on different chains overwrite each other', () => {
  const pylon = new EventEmitter()
  pylon.rates = jest.fn()
  store.setRates = (value) => store.set('main.rates', value)
  const updater = rates(pylon, store)
  updater.start()
  const contract = '0x2222222222222222222222222222222222222222'
  pylon.emit('rates', [
    { id: { type: AssetType.Token, chainId: 1, address: contract }, data: { usd: 1, usd_24h_change: 0 } },
    { id: { type: AssetType.Token, chainId: 10, address: contract }, data: { usd: 20, usd_24h_change: 0 } }
  ])
  const token = { address: contract, decimals: 18, balance: '1000000000000000000' }
  const result = portfolio({
    accounts: { [address]: { address } },
    balances: {
      [address]: [
        { ...token, chainId: 1 },
        { ...token, chainId: 10 }
      ]
    },
    networks: { ethereum: { 1: {}, 10: {} } },
    rates: store('main.rates')
  })
  expect(result.rows).toHaveLength(2)
  expect(result.total.toNumber()).toBe(40) // Distinct source quotes should total 21.
  updater.stop()
})
