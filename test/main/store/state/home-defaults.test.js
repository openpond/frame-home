jest.mock('electron-log', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }))
jest.mock('electron', () => ({ app: { on: jest.fn(), getPath: jest.fn() } }))
jest.mock('../../../../main/store/persist', () => ({ get: jest.fn() }))

import state from '../../../../main/store/state'
import { NETWORK_PRESETS } from '../../../../resources/constants'

test('a fresh Frame Home profile retains upstream built-in networks and resolved RPC presets', () => {
  const networks = state().main.networks.ethereum
  for (const id of [1, 10, 137, 8453, 42161, 84532, 11155111, 11155420]) {
    expect(networks[id]).toBeDefined()
    const connection = networks[id].connection.primary
    const target =
      connection.current === 'custom' ? connection.custom : NETWORK_PRESETS.ethereum[id][connection.current]
    expect(target).toMatch(/^wss?:\/\/|^https?:\/\//)
  }
  expect(networks[1].on).toBe(true)
})
