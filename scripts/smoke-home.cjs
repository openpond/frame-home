// Sample watch-only accounts. No user profile, passwords, or signing.
const path = require('path')
const fs = require('fs')
const root = process.env.FRAME_HOME_TEST_PACKAGE || path.resolve(__dirname, '..')
const { app, BrowserWindow } = require('electron')
process.env.NODE_ENV = 'production'
process.env.LOG_LEVEL = 'error'
process.env.FRAME_HOME_USER_DATA = fs.mkdtempSync(path.join(require('os').tmpdir(), 'frame-home-smoke-'))
app.setPath('userData', process.env.FRAME_HOME_USER_DATA)
// Only this isolated smoke test substitutes an ephemeral RPC listener.
const api = path.join(root, 'compiled/main/api/index.js')
require.cache[api] = { id: api, filename: api, loaded: true, exports: {} }
const dappServer = path.join(root, 'compiled/main/dapps/server/index.js')
require.cache[dappServer] = {
  id: dappServer,
  filename: dappServer,
  loaded: true,
  exports: { default: { sessions: { add() {}, remove() {} } } }
}
fs.writeFileSync(
  path.join(process.env.FRAME_HOME_USER_DATA, 'config.json'),
  JSON.stringify({
    main: { _version: 41, mute: { onboardingWindow: true, migrateToPylon: true }, networks: { ethereum: {} } }
  })
)
const errors = []
app.on('web-contents-created', (_, contents) => {
  contents.on('console-message', (_, level, message) => {
    if (level >= 3) errors.push(message.slice(0, 500))
  })
})
require(path.join(root, 'compiled/main/index.js'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const run = async () => {
  await app.whenReady()
  const store = require(path.join(root, 'compiled/main/store')).default
  const accounts = require(path.join(root, 'compiled/main/accounts')).default
  const wallets = [
    '0x1111111111111111111111111111111111111111',
    '0x2222222222222222222222222222222222222222',
    '0x3333333333333333333333333333333333333333'
  ]
  for (let i = 0; i < wallets.length; i++)
    await accounts.add(wallets[i], ['Treasury · demo', 'Everyday · demo', 'Long term · demo'][i], {
      type: 'Address'
    })
  for (const [id, name] of [
    [1, 'Ethereum'],
    [10, 'Optimism'],
    [8453, 'Base']
  ]) {
    store.addNetwork({
      type: 'ethereum',
      id,
      name,
      symbol: 'ETH',
      on: false,
      layer: 'mainnet',
      explorer: 'https://example.com'
    })
    store.setNativeCurrencyData('ethereum', id, { usd: { price: 2300 } })
  }
  for (const account of Object.values(accounts.accounts)) accounts.update(account.summary())
  const native = '0x0000000000000000000000000000000000000000'
  const usdc = '0x4444444444444444444444444444444444444444'
  const token = (address, symbol, name, balance, decimals, chainId) => ({
    address,
    symbol,
    name,
    balance,
    decimals,
    chainId
  })
  store.setBalances(wallets[0], [
    token(native, 'ETH', 'Ether', '2500000000000000000', 18, 1),
    token(usdc, 'USDC', 'USD Coin', '12500000000', 6, 1)
  ])
  store.setBalances(wallets[1], [
    token(native, 'ETH', 'Ether', '350000000000000000', 18, 10),
    token(usdc, 'USDC', 'USD Coin', '420000000', 6, 10)
  ])
  store.setBalances(wallets[2], [token(native, 'ETH', 'Ether', '1800000000000000000', 18, 8453)])
  store.setRates({ [usdc]: { usd: { price: 1 } } })
  await sleep(3500)
  const home = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/home.html'))
  if (!home) throw Error('Home window missing')
  const summary = await home.webContents.executeJavaScript(
    `({text: document.body.innerText, cards: document.querySelectorAll('.homeAccount').length, rows: document.querySelectorAll('tbody tr').length, overflow: document.documentElement.scrollWidth > innerWidth})`
  )
  if (summary.cards !== 0 || summary.rows !== 3)
    throw Error('Unexpected Home content: ' + JSON.stringify(summary))
  store.setRates({ [usdc]: { usd: { price: 2 } } })
  await sleep(200)
  const changed = await home.webContents.executeJavaScript(`document.body.innerText.includes('$25,000.00')`)
  if (!changed) throw Error('Home failed to reflect a live price update')
  store.setRates({ [usdc]: { usd: { price: 1 } } })
  await sleep(150)
  const visual = await home.webContents.executeJavaScript(
    `({ font: getComputedStyle(document.body).fontFamily, bg: getComputedStyle(document.body).backgroundColor, stockBg: getComputedStyle(document.body).getPropertyValue('--ghostA').trim(), cards: document.querySelectorAll('.homeMetrics, .homeAccount, .homeBrand, .homeEyebrow').length, title: document.querySelector('h1').textContent, extension: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Open Extension') })`
  )
  if (visual.cards || visual.title !== 'Holdings' || !visual.extension || !visual.font.includes('MainFont'))
    throw Error('Home did not match the requested layout')
  const image = await home.webContents.capturePage()
  fs.writeFileSync(
    process.env.FRAME_HOME_SCREENSHOT || path.join(process.env.FRAME_HOME_USER_DATA, 'preview.png'),
    image.toPNG()
  )
  await home.webContents.executeJavaScript(`document.querySelector('.homeHoldersToggle').click()` )
  await new Promise((resolve) => setTimeout(resolve, 50))
  await home.webContents.executeJavaScript(`document.querySelector('.homeAccountLink').click()`)
  await sleep(800)
  if (store('selected.current') !== wallets[0]) throw Error('Open account did not select the Frame account')
  await home.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Accounts').click()`
  )
  await sleep(500)
  const accountsInsideHome = await home.webContents.executeJavaScript(
    `!!document.querySelector('[aria-label="accounts workspace"] .dash')`
  )
  if (!accountsInsideHome) throw Error('Existing accounts view did not open inside Home')
  if (store('windows.dash.showing')) throw Error('Home navigation summoned the old dashboard')
  if (!home.isVisible()) throw Error('Home was hidden by opening wallet views')
  const httpServer = require(path.join(root, 'compiled/main/api/http')).default()
  const server = require(path.join(root, 'compiled/main/api/ws')).default(httpServer)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const WebSocket = require(path.join(root, 'node_modules/ws'))
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}?identity=frame-extension`, {
    origin: 'chrome-extension://ldcoohedfbjoobcadoglnnmmfbdlmmhf'
  })
  await new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
  const rpc = (method, extra = {}) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('RPC timeout: ' + method)), 2500)
      socket.once('message', (data) => {
        clearTimeout(timer)
        resolve(JSON.parse(data.toString()))
      })
      socket.send(JSON.stringify({ jsonrpc: '2.0', id: 7, method, params: [], ...extra }))
    })
  const chainReply = await rpc('eth_chainId')
  if (!chainReply.result?.startsWith('0x')) throw Error('Extension identity handshake failed')
  store.setPermission(wallets[0], {
    handlerId: 'home-smoke',
    origin: 'frame-home-test.example',
    provider: true
  })
  const accountsReply = await rpc('eth_accounts', { __frameOrigin: 'https://frame-home-test.example' })
  if (accountsReply.result?.[0] !== wallets[0])
    throw Error('Extension origin did not receive the selected account')
  socket.close()
  server.close()
  const windows = require(path.join(root, 'compiled/main/windows')).default
  const oldHome = home
  await new Promise((resolve) => {
    oldHome.once('closed', resolve)
    oldHome.close()
  })
  windows.showHome()
  let reopened
  for (let attempt = 0; attempt < 50; attempt++) {
    reopened = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/home.html'))
    if (reopened?.isVisible()) break
    await sleep(100)
  }
  if (!reopened || !reopened.isVisible())
    throw Error(
      'Home failed to reopen: ' +
        JSON.stringify(
          BrowserWindow.getAllWindows().map((w) => ({ url: w.webContents.getURL(), visible: w.isVisible() }))
        )
    )
  reopened.setSize(800, 650)
  await sleep(300)
  const overflow = await reopened.webContents.executeJavaScript(
    'document.documentElement.scrollWidth > innerWidth'
  )
  if (overflow) throw Error('Home overflows minimum viewport')
  if (errors.length) throw Error('Renderer errors: ' + JSON.stringify(errors))
  console.log(
    'SMOKE PASS',
    JSON.stringify({
      cards: summary.cards,
      rows: summary.rows,
      selectedAccount: true,
      existingAccountsView: true,
      accountsInsideHome: true,
      homePersistent: true,
      responsive: !overflow,
      liveUpdates: true,
      extensionHandshake: true,
      extensionSelectedAccount: true,
      rendererErrors: errors
    })
  )
  app.exit(0)
}
setTimeout(() => {
  console.error('SMOKE TIMEOUT')
  app.exit(1)
}, 25000)
run().catch((e) => {
  console.error('SMOKE FAIL', e.stack)
  app.exit(1)
})
