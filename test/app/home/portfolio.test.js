import { portfolio } from '../../../app/home/portfolio'

const wallet = '0x1111111111111111111111111111111111111111'
const token = '0x2222222222222222222222222222222222222222'
const native = '0x0000000000000000000000000000000000000000'
const holding = (overrides = {}) => ({
  address: token,
  chainId: 1,
  balance: '0x0f4240',
  decimals: 6,
  symbol: 'USDC',
  name: 'USD Coin',
  ...overrides
})
const state = (holdings) => ({
  accounts: { [wallet]: { address: wallet, name: 'Treasury' } },
  balances: { [wallet]: holdings },
  networks: {
    ethereum: {
      1: { name: 'Ethereum' },
      10: { name: 'Optimism' },
      11155111: { name: 'Sepolia', isTestnet: true }
    }
  },
  networksMeta: { ethereum: { 1: { nativeCurrency: { usd: { price: 2000 } } } } },
  rates: { [`1:${token}`]: { usd: { price: 1 } }, [`10:${token}`]: { usd: { price: 1 } } }
})

test('keeps chain identity, deduplicates each wallet holding, and preserves raw precision', () => {
  const data = portfolio(
    state([
      holding(),
      holding(),
      holding({ chainId: 10, balance: '1000000000000000000000001', decimals: 18 })
    ])
  )
  expect(data.rows).toHaveLength(2)
  expect(data.total.toFixed()).toBe('1000001.000000000000000001')
})

test('missing and placeholder prices stay unknown; native uses its chain price', () => {
  const main = state([holding(), holding({ address: native, decimals: 18, balance: '1000000000000000000' })])
  delete main.rates[`1:${token}`]
  const data = portfolio(main)
  expect(data.unpriced).toBe(1)
  expect(data.total.toFixed()).toBe('2000')
  main.rates[`1:${token}`] = { usd: { price: 0 } }
  expect(portfolio(main).unpriced).toBe(1)
})

test('excludes testnet value even when testnet holdings are shown', () => {
  const main = state([holding(), holding({ chainId: 11155111, balance: '999000000' })])
  expect(portfolio(main).rows).toHaveLength(1)
  const data = portfolio(main, { testnets: true })
  expect(data.rows).toHaveLength(2)
  expect(data.total.toFixed()).toBe('1')
  expect(data.unpriced).toBe(1)
})

test('filters by chain and account without mutating wallet state', () => {
  const main = state([holding(), holding({ chainId: 10 })])
  const before = JSON.stringify(main)
  expect(portfolio(main, { chain: '10', wallet, search: 'treasury' }).rows).toHaveLength(1)
  expect(portfolio(main, { search: 'missing' }).rows).toHaveLength(0)
  expect(JSON.stringify(main)).toBe(before)
})

test('retains empty wallets and handles missing or malformed balances', () => {
  expect(portfolio(state([])).accounts).toHaveLength(1)
  expect(portfolio(state([holding({ balance: 'broken' }), holding({ balance: '0x0' })])).rows).toHaveLength(0)
  expect(portfolio({}).total.toFixed()).toBe('0')
})

test('native cache records without decimals use chain metadata, matching Frame', () => {
  const main = state([holding({ address: native, decimals: undefined, balance: '1000000000000000000' })])
  expect(portfolio(main).total.toFixed()).toBe('2000')
  expect(portfolio(main).rows[0].decimals).toBe(18)
  main.networksMeta.ethereum[1].nativeCurrency.decimals = 6
  main.balances[wallet][0].balance = '1000000'
  expect(portfolio(main).total.toFixed()).toBe('2000')
  expect(portfolio(main).rows[0].decimals).toBe(6)
})

test('invalid token decimals do not crash or contribute a guessed value', () => {
  for (const decimals of [undefined, null, NaN, -1, 1.5, 256, '18']) {
    const data = portfolio(state([holding({ decimals })]))
    expect(data.rows).toHaveLength(0)
    expect(data.total.toFixed()).toBe('0')
  }
})

test('aggregates every saved account and excludes cached accounts that were removed', () => {
  const other = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  const removed = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  const main = state([holding()])
  main.accounts[other] = { address: other, name: 'Second account' }
  main.balances[other.toLowerCase()] = [holding({ balance: '2000000' })]
  main.balances[removed] = [holding({ balance: '9000000' })]
  const data = portfolio(main)
  expect(data.rows).toHaveLength(1)
  expect(data.total.toFixed()).toBe('3')
  expect(data.rows[0].quantity.toFixed()).toBe('3')
  expect(data.rows[0].holders.map((holder) => holder.walletId)).toEqual([other, wallet])
})

test('combines Ether across accounts and networks with per-account totals and chain filtering', () => {
  const other = '0x3333333333333333333333333333333333333333'
  const eth = (chainId, balance) =>
    holding({ address: native, symbol: 'ETH', name: 'Ether', decimals: undefined, chainId, balance })
  const main = state([eth(1, '1000000000000000000'), eth(10, '2000000000000000000')])
  main.accounts[other] = { name: 'Other', address: other }
  main.balances[other] = [eth(1, '4000000000000000000')]
  const data = portfolio(main)
  expect(data.rows).toHaveLength(1)
  expect(data.rows[0].quantity.toFixed()).toBe('7')
  expect(data.rows[0].rawBalance).toBe('7000000000000000000')
  expect(data.rows[0].holders.map((holder) => holder.quantity.toFixed())).toEqual(['4', '3'])
  expect(data.rows[0].networks).toHaveLength(2)
  expect(data.rows[0].partial).toBe(true)
  expect(data.total.toFixed()).toBe('10000')
  expect(portfolio(main, { chain: '10' }).rows[0].quantity.toFixed()).toBe('2')
  expect(portfolio(main, { wallet: other }).rows[0].quantity.toFixed()).toBe('4')
})

test('unrelated token contracts with the same symbol remain separate assets', () => {
  const data = portfolio(
    state([holding(), holding({ address: '0x3333333333333333333333333333333333333333' })])
  )
  expect(data.rows).toHaveLength(2)
})
