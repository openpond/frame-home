import { render, screen, fireEvent } from '@testing-library/react'
import { Home } from '../../../app/home/App'
import link from '../../../resources/link'
jest.mock('../../../resources/link', () => ({ rpc: jest.fn(), send: jest.fn() }))
jest.mock(
  '../../../app/dash/App',
  () =>
    function MockDash() {
      return <div>Frame workspace</div>
    }
)
jest.mock('../../../resources/Components/RingIcon', () => () => null)
const address = '0x1111111111111111111111111111111111111111'
const main = {
  accounts: { [address]: { name: 'Treasury', address } },
  balances: {
    [address]: [
      {
        address: '0x2222222222222222222222222222222222222222',
        name: 'USD Coin',
        symbol: 'USDC',
        chainId: 1,
        decimals: 6,
        balance: '1000000'
      }
    ]
  },
  networks: { ethereum: { 1: { name: 'Ethereum' } } }
}

test('search, wallet and network filtering never change the connected wallet', () => {
  render(<Home main={main} />)
  fireEvent.change(screen.getByLabelText('Search accounts and assets'), { target: { value: 'Treasury' } })
  fireEvent.change(screen.getByLabelText('Filter wallet'), { target: { value: address } })
  fireEvent.mouseDown(screen.getByRole('option', { name: 'Ethereum' }))
  expect(link.rpc).not.toHaveBeenCalled()
  expect(link.send).not.toHaveBeenCalled()
})

test('opening a holding’s account uses Frame setSigner and opens the wallet only on success', () => {
  link.rpc.mockImplementation((method, id, callback) => callback(null))
  render(<Home main={main} />)
  fireEvent.click(screen.getByRole('button', { name: 'Show accounts holding USDC' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open account Treasury' }))
  expect(link.rpc).toHaveBeenCalledWith('setSigner', address, expect.any(Function))
  expect(link.send).toHaveBeenCalledWith('home:openWallet')
})

test('failed selection is shown without claiming the wallet was opened', () => {
  link.rpc.mockImplementation((method, id, callback) => callback(new Error('missing account')))
  render(<Home main={main} />)
  fireEvent.click(screen.getByRole('button', { name: 'Show accounts holding USDC' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open account Treasury' }))
  expect(screen.getByRole('alert').textContent).toContain('Could not open')
  expect(link.send).not.toHaveBeenCalled()
})

test('sidebar account management routes to Frame’s existing view', () => {
  render(<Home main={main} />)
  fireEvent.click(screen.getByRole('button', { name: 'Accounts' }))
  expect(link.send).toHaveBeenCalledWith('home:navigate', 'accounts')
})

test('Open Extension opens the existing wallet panel without selecting or unlocking an account', () => {
  render(<Home main={main} />)
  fireEvent.click(screen.getByRole('button', { name: 'Open Extension' }))
  expect(link.send).toHaveBeenCalledWith('home:openWallet')
  expect(link.rpc).not.toHaveBeenCalled()
})

test('the main view contains holdings and a total without the removed account summary cards', () => {
  render(<Home main={main} />)
  expect(screen.getByRole('heading', { name: 'Holdings' })).toBeTruthy()
  expect(screen.getByLabelText('Total balance')).toBeTruthy()
  expect(screen.queryByText('Selected in Frame')).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Home' })).toBeNull()
})

test.each(['accounts', 'chains', 'tokens', 'dapps', 'settings'])(
  'renders the native %s view inside Home',
  (view) => {
    render(<Home main={main} nav={[{ view, data: {} }]} />)
    expect(screen.getByText('Frame workspace')).toBeTruthy()
    expect(screen.getByLabelText(`${view} workspace`)).toBeTruthy()
    expect(screen.queryByLabelText('Total balance')).toBeNull()
    expect(link.send).not.toHaveBeenCalled()
  }
)

test('expanding holders lists accounts without changing the connected wallet', () => {
  const other = '0x3333333333333333333333333333333333333333'
  const combined = {
    ...main,
    accounts: { ...main.accounts, [other]: { name: 'Larger account', address: other } },
    balances: { ...main.balances, [other]: [{ ...main.balances[address][0], balance: '9000000' }] }
  }
  render(<Home main={combined} />)
  const toggle = screen.getByRole('button', { name: 'Show accounts holding USDC' })
  expect(toggle.textContent).toContain('Larger account')
  expect(toggle.textContent).toContain('+1 account')
  fireEvent.click(toggle)
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  expect(
    screen.getAllByRole('button', { name: /Open account/ }).map((button) => button.getAttribute('aria-label'))
  ).toEqual(['Open account Larger account', 'Open account Treasury'])
  expect(link.rpc).not.toHaveBeenCalled()
  expect(link.send).not.toHaveBeenCalled()
  fireEvent.click(toggle)
  expect(screen.queryByLabelText('Accounts holding USDC')).toBeNull()
})
