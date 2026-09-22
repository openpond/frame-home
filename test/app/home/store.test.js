import createHomeStore from '../../../app/home/store'
import link from '../../../resources/link'

jest.mock('../../../resources/link', () => ({ on: jest.fn(), send: jest.fn() }))

const create = () => {
  const transport = { send: jest.fn() }
  const upstreamSend = transport.send
  const store = createHomeStore({ main: {}, windows: { dash: { nav: [], showing: false } } }, transport)
  return { store, transport, upstreamSend }
}

test('shared navigation stays local through nested routes, back and root changes', () => {
  const { store, transport, upstreamSend } = create()
  transport.send('home:navigate', 'accounts')
  transport.send('tray:action', 'navDash', { view: 'accounts', data: { showAddAccounts: true } })
  transport.send('nav:forward', 'dash', { view: 'accounts', data: { newAccountType: 'nonsigning' } })
  expect(store('windows.dash.nav')).toHaveLength(3)
  transport.send('nav:back', 'dash')
  expect(store('windows.dash.nav')[0].data.showAddAccounts).toBe(true)
  transport.send('home:navigate', 'chains')
  expect(store('windows.dash.nav')).toEqual([{ view: 'chains', data: {} }])
  transport.send('nav:update', 'dash', { view: 'chains', data: { selectedChain: { id: 1 } } }, false)
  expect(store('windows.dash.nav')[0].data.selectedChain.id).toBe(1)
  expect(upstreamSend).not.toHaveBeenCalled()
})

test('live wallet state updates do not replace Home navigation or editor data', () => {
  const { store, transport } = create()
  transport.send('home:navigate', 'tokens')
  const [, onAction] = link.on.mock.calls.find(([event]) => event === 'action')
  onAction(
    'stateSync',
    JSON.stringify([
      {
        updates: [
          { path: 'windows.dash', value: { showing: true, nav: [{ view: 'accounts', data: {} }] } },
          { path: 'main.rates', value: { test: 42 } }
        ]
      }
    ])
  )
  expect(store('windows.dash.nav')[0].view).toBe('tokens')
  expect(store('main.rates.test')).toBe(42)
})

test('non-navigation actions and explicit Open Extension still reach Frame', () => {
  const { transport, upstreamSend } = create()
  transport.send('tray:action', 'setColorway', 'dark')
  transport.send('home:openWallet')
  expect(upstreamSend).toHaveBeenCalledWith('tray:action', 'setColorway', 'dark')
  expect(upstreamSend).toHaveBeenCalledWith('home:openWallet', undefined)
})
