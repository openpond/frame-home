import portfolioScanner from '../../../main/externalData/portfolio'

const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
}
let source, manager, pending
beforeEach(() => {
  pending = []
  source = {
    addresses: () => ['one', 'two', 'three'],
    chains: () => [1, 10],
    visible: () => true,
    ready: () => true,
    scan: jest.fn(() => new Promise((resolve, reject) => pending.push({ resolve, reject }))),
    report: jest.fn()
  }
})
afterEach(() => manager?.close())

test('checks all saved accounts with a concurrency limit and no signer selection', async () => {
  manager = portfolioScanner(source)
  expect(source.scan.mock.calls.map(([address]) => address)).toEqual(['one', 'two'])
  jest.advanceTimersByTime(5000)
  expect(source.scan).toHaveBeenCalledTimes(2)
  pending[0].resolve(true)
  await settle()
  jest.advanceTimersByTime(1000)
  expect(source.scan.mock.calls.map(([address]) => address)).toEqual(['one', 'two', 'three'])
  expect(source.scan.mock.calls.every(([, chains]) => chains.join(',') === '1,10')).toBe(true)
})

test('does not scan hidden Home or disconnected chains and waits for worker readiness', () => {
  source.visible = () => false
  manager = portfolioScanner(source)
  jest.advanceTimersByTime(1000)
  expect(source.scan).not.toHaveBeenCalled()
  source.visible = () => true
  source.ready = () => false
  jest.advanceTimersByTime(1000)
  expect(source.scan).not.toHaveBeenCalled()
  source.ready = () => true
  source.chains = () => []
  jest.advanceTimersByTime(1000)
  expect(source.scan).not.toHaveBeenCalled()
})

test('records partial and failed scans, moves on, and ignores a removed account', async () => {
  manager = portfolioScanner(source)
  pending[0].resolve(false)
  pending[1].reject(Error('network unavailable'))
  await settle()
  const [status] = source.report.mock.calls.at(-1)
  expect(status.one.state).toBe('partial')
  expect(status.two.state).toBe('error')
  source.addresses = () => ['one', 'two']
  jest.advanceTimersByTime(1000)
  expect(source.scan).toHaveBeenCalledTimes(2)
  jest.advanceTimersByTime(120000)
  expect(source.scan).toHaveBeenCalledTimes(4)
})

test('stopping prevents later scan results from publishing', async () => {
  manager = portfolioScanner(source)
  manager.close()
  source.report.mockClear()
  pending[0].resolve(true)
  await settle()
  expect(source.report).not.toHaveBeenCalled()
})
