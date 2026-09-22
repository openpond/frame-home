import { app, ipcMain, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import store from '../store'
import { isWalletSender } from '../windows/window'
import { Pairing } from './pairing'
import { startService, profileKey, ReadMethod } from './service'
import { freshness } from './snapshot'
import type { Balance } from '../store/state'

export async function startLocalWallet() {
  const directory = path.join(app.getPath('userData'), 'local-wallet')
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const settingsFile = path.join(directory, 'settings.json')
  let savedOrigin: string | undefined
  try {
    savedOrigin = JSON.parse(fs.readFileSync(settingsFile, 'utf8')).origin
  } catch {
    /* First launch. */
  }
  const origin = process.env.OPENPOND_WALLET_ORIGIN || savedOrigin || 'https://ducky.capital'
  const pairing = new Pairing(
    directory,
    origin,
    (state) => store.setOpenPondConnection(state),
    (url) => shell.openExternal(url)
  )
  fs.writeFileSync(settingsFile, JSON.stringify({ origin }), { mode: 0o600 })
  const dispatch = async (method: ReadMethod) => {
    store.setLocalWalletReadUntil(Date.now() + 30_000)
    if (method === 'connect') return pairing.connect()
    if (method === 'disconnect') return pairing.disconnect()
    await pairing.refresh()
    const local = Object.entries(store('main.accounts') || {}).map(([id, account]: [string, any]) => ({
      id,
      address: account.address || id,
      name: account.name || ''
    }))
    const all = [
      ...local,
      ...pairing.state.accounts.filter(
        (remote) => !local.some((account) => account.address.toLowerCase() === remote.address)
      )
    ]
    const scan = store('home.scan') || { accounts: {}, chains: [] }
    const scans = Object.fromEntries(
      all.map((account) => [
        account.id,
        freshness(scan.accounts?.[account.address.toLowerCase()], scan.chains.length > 0)
      ])
    )
    if (method === 'status')
      return {
        name: 'OpenPond Local Wallet',
        version: app.getVersion(),
        connection: pairing.state.state,
        capabilities: ['accounts:read', 'holdings:read'],
        scan: { accounts: scans, chains: scan.chains }
      }
    if (method === 'accounts') return all
    return {
      accounts: all.map((account) => ({
        ...account,
        holdings: (store('main.balances', account.address.toLowerCase()) || []).map((balance: Balance) => ({
          chainId: balance.chainId,
          tokenAddress: balance.address,
          name: balance.name,
          symbol: balance.symbol,
          decimals: balance.decimals,
          balance: balance.balance
        })),
        scan: scans[account.id]
      })),
      observedAt: new Date().toISOString()
    }
  }
  ipcMain.handle('openpond:connection', async (event, method: ReadMethod) => {
    if (!isWalletSender(event as any) || !['connect', 'disconnect', 'status'].includes(method))
      throw new Error('Request denied')
    try {
      return await dispatch(method)
    } catch {
      return { error: 'Connection failed' }
    }
  })
  const service = await startService(directory, dispatch)
  const discovery = path.join(app.getPath('appData'), 'openpond-local-wallet')
  fs.mkdirSync(discovery, { recursive: true, mode: 0o700 })
  const metadata = {
    version: 1,
    socket: service.socket,
    executable: process.execPath,
    args: app.isPackaged ? [] : [app.getAppPath()],
    profile: app.getPath('userData')
  }
  for (const file of ['service.json', `${profileKey(app.getPath('userData'))}.json`]) {
    fs.writeFileSync(path.join(discovery, file), JSON.stringify(metadata), { mode: 0o600 })
  }
  pairing.start()
  app.once('quit', () => {
    pairing.close()
    service.close()
  })
}
