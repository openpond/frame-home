// Synthetic, offline benchmark of the actual Home derivation. No wallet state is loaded.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const os = require('os')
const { performance } = require('perf_hooks')
const babel = require('@babel/core')
const root = path.resolve(__dirname, '../../../..')
const moduleResult = { exports: {} }
const code = babel.transformFileSync(path.join(root, 'app/home/portfolio.js'), {
  babelrc: false,
  configFile: false,
  presets: [[require.resolve('@babel/preset-env'), { targets: { node: 'current' }, modules: 'commonjs' }]]
}).code
vm.runInNewContext(code, {
  module: moduleResult,
  exports: moduleResult.exports,
  require: (id) =>
    id === '../../resources/constants'
      ? { NATIVE_CURRENCY: '0x0000000000000000000000000000000000000000' }
      : require(id)
})
const { portfolio } = moduleResult.exports
const address = (i) => `0x${i.toString(16).padStart(40, '0')}`
function fixture(accountCount, tokensPerAccount) {
  const main = {
    accounts: {},
    balances: {},
    rates: {},
    networks: { ethereum: {} },
    networksMeta: { ethereum: {} }
  }
  for (let chain = 1; chain <= 5; chain++)
    main.networks.ethereum[chain] = { name: `Synthetic chain ${chain}` }
  for (let i = 0; i < accountCount; i++) {
    const id = address(1000000 + i)
    main.accounts[id] = { address: id, name: `Synthetic account ${i}` }
    main.balances[id] = Array.from({ length: tokensPerAccount }, (_, j) => {
      const tokenAddress = address(j + 1)
      main.rates[`${(j % 5) + 1}:${tokenAddress}`] = { usd: { price: j + 1 } }
      return {
        address: tokenAddress,
        chainId: (j % 5) + 1,
        symbol: `T${j}`,
        name: `Synthetic token ${j}`,
        balance: '1000000000000000000',
        decimals: 18
      }
    })
  }
  return main
}
const results = []
for (const [accountCount, tokensPerAccount] of [
  [20, 50],
  [20, 250],
  [100, 500]
]) {
  const main = fixture(accountCount, tokensPerAccount)
  for (let i = 0; i < 5; i++) portfolio(main)
  const samples = []
  let last
  for (let i = 0; i < 25; i++) {
    const start = performance.now()
    last = portfolio(main)
    samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  results.push({
    accountCount,
    tokensPerAccount,
    positions: accountCount * tokensPerAccount,
    renderedAssetRows: last.rows.length,
    samples: samples.length,
    p50ms: +samples[12].toFixed(2),
    p95ms: +samples[23].toFixed(2)
  })
}
const output = {
  source: 'app/home/portfolio.js',
  node: process.version,
  cpu: os.cpus()[0].model,
  measuredAt: new Date().toISOString(),
  note: 'Pure derivation only; synthetic data; no React DOM, IPC, disk, or RPC timing.',
  results
}
const target = process.argv[2]
if (target) fs.writeFileSync(target, JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify(output, null, 2))
