import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import store from '../store'
import { startService, profileKey, ReadMethod } from './service'
import { freshness } from './snapshot'
import type { Balance } from '../store/state'

export async function startLocalWallet() {
  const directory = path.join(app.getPath('userData'), 'local-wallet')
  const dispatch = async (method: ReadMethod) => {
    store.setLocalWalletReadUntil(Date.now() + 30_000)
    const accounts = Object.entries(store('main.accounts') || {}).map(([id, account]: [string, any]) => ({
      id,
      address: account.address || id,
      name: account.name || '',
      signer: account.signer
        ? {
            type: store('main.signers', account.signer, 'type') || account.lastSignerType || 'unknown',
            status: store('main.signers', account.signer, 'status') || 'unavailable'
          }
        : { type: 'watch-only', status: 'unavailable' }
    }))
    const scan = store('home.scan') || { accounts: {}, chains: [] }
    const scans = Object.fromEntries(
      accounts.map((account) => [
        account.id,
        freshness(scan.accounts?.[account.address.toLowerCase()], scan.chains.length > 0)
      ])
    )
    if (method === 'status' || method === 'connect')
      return {
        name: 'OpenPond Local Wallet',
        version: app.getVersion(),
        connected: true,
        capabilities: ['accounts:read', 'holdings:read'],
        scan: { accounts: scans, chains: scan.chains }
      }
    if (method === 'accounts') return accounts
    return {
      accounts: accounts.map((account) => ({
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
  app.once('quit', () => service.close())
}
