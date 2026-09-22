import BigNumber from 'bignumber.js'
import { NATIVE_CURRENCY } from '../../resources/constants'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export const money = (value) => usd.format(Number(value))
export const shortAddress = (address = '') => `${address.slice(0, 6)}…${address.slice(-4)}`

// Token symbols are not unique identifiers. Combine a token across wallets by
// its chain and contract; native currencies (including ETH on L2s) share a row.
function assetKey(position) {
  if (position.isNative)
    return `native:${position.isTestnet ? position.chainId : 'mainnet'}:${position.symbol.toLowerCase()}`
  return `token:${position.chainId}:${position.tokenAddress?.toLowerCase()}`
}

function sumPositions(positions, decimals) {
  const quantity = positions.reduce((sum, p) => sum.plus(p.quantity), new BigNumber(0))
  const priced = positions.filter((p) => p.value !== null)
  return {
    quantity,
    rawBalance: quantity.shiftedBy(decimals).toFixed(),
    value: priced.length ? priced.reduce((sum, p) => sum.plus(p.value), new BigNumber(0)) : null,
    partial: priced.length > 0 && priced.length < positions.length
  }
}

function groupAssets(positions) {
  const groups = new Map()
  for (const position of positions) {
    const key = assetKey(position)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(position)
  }
  return [...groups]
    .map(([key, entries]) => {
      const decimals = Math.max(...entries.map((p) => p.decimals))
      const byWallet = new Map()
      for (const entry of entries) {
        if (!byWallet.has(entry.walletId)) byWallet.set(entry.walletId, [])
        byWallet.get(entry.walletId).push(entry)
      }
      const holders = [...byWallet.values()]
        .map((walletEntries) => ({
          ...walletEntries[0],
          ...sumPositions(walletEntries, decimals),
          decimals,
          positions: walletEntries
        }))
        .sort((a, b) => b.quantity.comparedTo(a.quantity))
      const networks = [
        ...new Map(
          entries.map((p) => [
            p.chainId,
            {
              id: p.chainId,
              name: p.chainName,
              color: p.chainColor
            }
          ])
        ).values()
      ]
      return {
        ...entries[0],
        ...sumPositions(entries, decimals),
        key,
        decimals,
        holders,
        networks,
        positions: entries
      }
    })
    .sort((a, b) => (b.value || new BigNumber(-1)).comparedTo(a.value || new BigNumber(-1)))
}

// Derive a read-only view. Filtering this view never selects a signer.
export function portfolio(main, { search = '', chain = '', wallet = '', testnets = false } = {}) {
  const networks = main.networks?.ethereum || {}
  const metadata = main.networksMeta?.ethereum || {}
  const balances = main.balances || {}
  const balancesByAddress = new Map(Object.entries(balances).map(([id, rows]) => [id.toLowerCase(), rows]))
  const query = search.trim().toLowerCase()
  const rows = []
  const accounts = Object.entries(main.accounts || {}).map(([id, account]) => {
    const address = account.address || id
    const name = account.name || account.ensName || shortAddress(address)
    const seen = new Set()
    const included = !wallet || wallet === id
    for (const token of balancesByAddress.get(address.toLowerCase()) || []) {
      const key = `${token.chainId}:${token.address?.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      const network = networks[token.chainId]
      if (!testnets && network?.isTestnet) continue
      if (chain && String(token.chainId) !== chain) continue
      const isNative = token.address === NATIVE_CURRENCY
      const nativeCurrency = metadata[token.chainId]?.nativeCurrency || {}
      const decimals = isNative ? nativeCurrency.decimals ?? 18 : token.decimals
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) continue
      const quantity = new BigNumber(token.balance).shiftedBy(-decimals)
      if (!quantity.isFinite() || quantity.lte(0)) continue
      const chainName = network?.name || `Chain ${token.chainId}`
      const matches = `${name} ${address} ${token.name} ${token.symbol} ${token.address} ${chainName}`
        .toLowerCase()
        .includes(query)
      if (!included || !matches) continue
      const quote =
        token.address === NATIVE_CURRENCY
          ? metadata[token.chainId]?.nativeCurrency?.usd?.price
          : main.rates?.[`${token.chainId}:${token.address?.toLowerCase()}`]?.usd?.price
      const price = new BigNumber(quote)
      // Frame uses zero as a placeholder before prices load. Keep it unknown.
      // Testnet holdings must not inflate a real-money total.
      const priced = !network?.isTestnet && quote != null && price.isFinite() && price.gt(0)
      const tokenValue = priced ? quantity.times(price) : null
      rows.push({
        key: `${id}:${key}`,
        walletId: id,
        walletName: name,
        walletAddress: address,
        symbol: (isNative && nativeCurrency.symbol) || token.symbol || 'Unknown',
        name: (isNative && nativeCurrency.name) || token.name || token.symbol || 'Unknown asset',
        tokenAddress: token.address,
        rawBalance: token.balance,
        isNative,
        isTestnet: !!network?.isTestnet,
        quantity,
        logoURI: (isNative && nativeCurrency.icon) || token.logoURI,
        decimals,
        chainColor: metadata[token.chainId]?.primaryColor,
        chainId: String(token.chainId),
        chainName,
        value: tokenValue
      })
    }
    return { id, address, name }
  })
  rows.sort((a, b) => (b.value || new BigNumber(-1)).comparedTo(a.value || new BigNumber(-1)))
  return {
    accounts,
    rows: groupAssets(rows),
    positions: rows,
    total: rows.reduce((sum, row) => (row.value ? sum.plus(row.value) : sum), new BigNumber(0)),
    unpriced: rows.filter((row) => row.value === null).length,
    chains: Object.entries(networks)
      .filter(([, n]) => testnets || !n.isTestnet)
      .map(([id, n]) => ({ id, name: n.name || `Chain ${id}` }))
  }
}
