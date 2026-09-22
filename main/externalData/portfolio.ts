type ScanState = { state: 'scanning' | 'updated' | 'partial' | 'error'; checkedAt?: number }

interface PortfolioSource {
  addresses: () => Address[]
  chains: () => number[]
  visible: () => boolean
  ready: () => boolean
  scan: (address: Address, chains: number[]) => Promise<boolean>
  report: (accounts: Record<Address, ScanState>, chains: number[]) => void
}

// Share Frame's existing scanner without selecting or unlocking any account.
// Two accounts at a time; each account is refreshed at most once per two minutes.
export default function portfolioScanner(source: PortfolioSource) {
  const states: Record<Address, ScanState> = {}
  const attempts = new Map<Address, { at: number; chains: string }>()
  const running = new Set<Address>()
  let closed = false
  let lastReport = ''
  function report(chains: number[]) {
    const signature = JSON.stringify([states, chains])
    if (signature !== lastReport) {
      lastReport = signature
      source.report({ ...states }, chains)
    }
  }

  function tick() {
    if (closed || !source.visible() || !source.ready()) return
    const addresses = [...new Set(source.addresses())]
    const chains = source
      .chains()
      .slice()
      .sort((a, b) => a - b)
    const chainKey = chains.join(',')
    for (const address of Object.keys(states)) {
      if (!addresses.includes(address)) {
        delete states[address]
        attempts.delete(address)
      }
    }
    if (!chains.length) {
      report(chains)
      return
    }
    for (const address of addresses.sort(
      (a, b) => (attempts.get(a)?.at ?? -Infinity) - (attempts.get(b)?.at ?? -Infinity)
    )) {
      if (running.size >= 2) break
      const previous = attempts.get(address)
      if (running.has(address) || (previous?.chains === chainKey && Date.now() - previous.at < 120_000))
        continue
      running.add(address)
      attempts.set(address, { at: Date.now(), chains: chainKey })
      states[address] = { state: 'scanning', checkedAt: states[address]?.checkedAt }
      report(chains)
      const finish = (state: ScanState['state']) => {
        running.delete(address)
        if (closed) return
        if (
          source.addresses().includes(address) &&
          source
            .chains()
            .slice()
            .sort((a, b) => a - b)
            .join(',') === chainKey
        ) {
          states[address] = { state, checkedAt: Date.now() }
          report(chains)
        }
      }
      source.scan(address, chains).then(
        (complete) => finish(complete ? 'updated' : 'partial'),
        () => finish('error')
      )
    }
  }

  const timer = setInterval(tick, 1000)
  tick()
  return {
    close: () => {
      closed = true
      clearInterval(timer)
    }
  }
}
