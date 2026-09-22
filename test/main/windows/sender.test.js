import { createWindow, isWalletSender } from '../../../main/windows/window'

jest.mock('../../../main/store', () => () => undefined)
jest.mock('electron', () => ({
  BrowserWindow: jest.fn(() => ({
    webContents: { mainFrame: {}, once: jest.fn(), on: jest.fn(), setWindowOpenHandler: jest.fn() }
  }))
}))

test('only registered wallet window main frames can invoke privileged IPC', () => {
  process.env.BUNDLE_LOCATION = '/synthetic-bundle'
  const { webContents } = createWindow('home')
  expect(isWalletSender({ sender: webContents, senderFrame: webContents.mainFrame })).toBe(true)
  expect(isWalletSender({ sender: webContents, senderFrame: {} })).toBe(false)
  const untrusted = { mainFrame: {} }
  expect(isWalletSender({ sender: untrusted, senderFrame: untrusted.mainFrame })).toBe(false)
})
