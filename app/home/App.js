import React, { useMemo, useState } from 'react'
import Restore from 'react-restore'
import link from '../../resources/link'
import svg from '../../resources/svg'
import { Cluster, ClusterRow, ClusterValue } from '../../resources/Components/Cluster'
import Dropdown from '../../resources/Components/Dropdown'
import Dash from '../dash/App'
import { portfolio, money } from './portfolio'
import HoldingRow from './HoldingRow'
import walletLogo from '../../resources/branding/openpond-wallet.png'

const navigation = [
  ['accounts', 'Accounts', 'accounts'],
  ['chains', 'Chains', 'chain'],
  ['tokens', 'Tokens', 'tokens'],
  ['dapps', 'Dapps', 'window'],
  ['settings', 'Settings', 'settings']
]

export function Home({ main, nav = [{ view: 'holdings', data: {} }], scan, connection }) {
  const { balances, networks, networksMeta, rates } = main
  const accounts = useMemo(
    () => ({
      ...Object.fromEntries((connection?.accounts || []).map((account) => [account.id, account])),
      ...main.accounts
    }),
    [main.accounts, connection?.accounts]
  )
  const view = nav[0]?.view || 'holdings'
  const section = [...nav].reverse().find((item) => navigation.some(([id]) => id === item.view))?.view || view
  const [search, setSearch] = useState('')
  const [chain, setChain] = useState('')
  const [wallet, setWallet] = useState('')
  const [testnets, setTestnets] = useState(false)
  const [error, setError] = useState('')
  const data = useMemo(
    () =>
      portfolio(view === 'holdings' ? { accounts, balances, networks, networksMeta, rates } : {}, {
        search,
        chain,
        wallet,
        testnets
      }),
    [accounts, balances, networks, networksMeta, rates, view, search, chain, wallet, testnets]
  )
  const scans = data.accounts.map((account) => scan?.accounts?.[account.id])
  const checked = scans.filter((entry) => entry && entry.state !== 'scanning').length
  const incomplete = scans.filter((entry) => ['partial', 'error'].includes(entry?.state)).length
  const refreshStatus = !scan?.chains?.length
    ? 'Waiting for connected networks. Showing cached balances.'
    : checked < data.accounts.length
    ? `Refreshing accounts: ${checked} of ${data.accounts.length} checked.`
    : `${checked} accounts checked across ${scan.chains.length} connected networks.`
  const openAccount = (id) => {
    if (!main.accounts?.[id]) return
    setError('')
    link.rpc('setSigner', id, (err) => {
      if (err) return setError('Could not open this account. Open Extension to check its status.')
      link.send('home:openWallet')
    })
  }
  const networkOptions = [
    { text: 'All networks', value: 'all' },
    ...data.chains.map((network) => ({ text: network.name, value: network.id }))
  ]

  return (
    <div className='homeLayout'>
      <aside className='homeNavigation' aria-label='OpenPond Local Wallet navigation'>
        <div className='homeLogo' aria-label='OpenPond Local Wallet'>
          <img src={walletLogo} width='40' height='40' alt='' />
        </div>
        <nav className='dashModules'>
          <button
            className={`dashModule ${view === 'holdings' ? 'homeActive' : ''}`}
            onClick={() => {
              link.send('home:navigate', 'holdings')
              setSearch('')
              setChain('')
              setWallet('')
            }}
          >
            <span className='dashModuleIcon'>{svg.tokens(24)}</span>
            <span className='dashModuleTitle'>Holdings</span>
          </button>
          {navigation.map(([view, title, icon]) => (
            <button
              className={`dashModule ${section === view ? 'homeActive' : ''}`}
              key={view}
              onClick={() => link.send('home:navigate', view)}
            >
              <span className='dashModuleIcon'>{svg[icon](24)}</span>
              <span className='dashModuleTitle'>{title}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className='homeHoldings'>
        <header className='homeTop'>
          {view === 'holdings' ? (
            <div className='homeTotal' aria-label='Total balance'>
              {data.rows.some((row) => row.value !== null) ? money(data.total) : '—'}
            </div>
          ) : (
            <div className='homeViewHeading'>
              {nav.length > 1 && (
                <button aria-label='Back' onClick={() => link.send('tray:action', 'backDash')}>
                  {svg.chevronLeft(18)}
                </button>
              )}
              <h1>{navigation.find(([id]) => id === section)?.[1] || 'Accounts'}</h1>
            </div>
          )}
          <div className='homeTopControls'>
            {view === 'holdings' && (
              <div className='homeNetwork' aria-label='Filter network'>
                <Dropdown
                  fullText
                  options={networkOptions}
                  syncValue={chain || 'all'}
                  onChange={(value) => setChain(value === 'all' ? '' : value)}
                />
              </div>
            )}
            <Cluster>
              <ClusterRow>
                <ClusterValue pointerEvents>
                  <button className='homeControl' onClick={() => link.send('home:openWallet')}>
                    Open Extension
                  </button>
                </ClusterValue>
              </ClusterRow>
            </Cluster>
          </div>
        </header>
        {error ? (
          <p role='alert' className='homeError'>
            {error}
          </p>
        ) : null}
        {view === 'holdings' ? (
          <section aria-label='Holdings'>
            <div className='homeListHeader'>
              <h1>Holdings</h1>
              <div className='homeFilters'>
                <input
                  aria-label='Search accounts and assets'
                  placeholder='Search'
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select aria-label='Filter wallet' value={wallet} onChange={(e) => setWallet(e.target.value)}>
                  <option value=''>All accounts</option>
                  {data.accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
                <label>
                  <input
                    type='checkbox'
                    checked={testnets}
                    onChange={(e) => {
                      setTestnets(e.target.checked)
                      setChain('')
                    }}
                  />{' '}
                  Testnets
                </label>
              </div>
            </div>
            <Cluster>
              <ClusterRow>
                <ClusterValue pointerEvents>
                  <div className='homeList'>
                    <table>
                      <thead>
                        <tr>
                          <th>Asset</th>
                          <th>Network</th>
                          <th>Accounts</th>
                          <th className='numeric'>Balance</th>
                          <th className='numeric'>Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((row) => (
                          <HoldingRow key={row.key} row={row} openAccount={openAccount} />
                        ))}
                      </tbody>
                    </table>
                    {!data.rows.length ? (
                      <div className='homeEmpty'>
                        {data.accounts.length
                          ? 'No holdings to show for these filters. Balances refresh in the background.'
                          : 'Add an account to see its holdings here.'}
                      </div>
                    ) : null}
                  </div>
                </ClusterValue>
              </ClusterRow>
            </Cluster>
            <p className='homeSnapshot'>
              {refreshStatus}{' '}
              {incomplete ? 'Some balances could not refresh; cached values are retained. ' : ''}
              {data.unpriced ? `${data.unpriced} holdings have no price.` : ''}
            </p>
          </section>
        ) : (
          <section className='homeWorkspace' aria-label={`${section} workspace`}>
            <Dash embedded />
          </section>
        )}
      </main>
    </div>
  )
}

class HomeStore extends React.Component {
  render() {
    return (
      <Home
        main={{
          accounts: this.store('main.accounts'),
          balances: this.store('main.balances'),
          networks: this.store('main.networks'),
          networksMeta: this.store('main.networksMeta'),
          rates: this.store('main.rates')
        }}
        nav={this.store('windows.dash.nav')}
        scan={this.store('home.scan')}
        connection={this.store('openpond')}
      />
    )
  }
}
export default Restore.connect(HomeStore)
