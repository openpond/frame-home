import EventEmitter from 'events'

const controller: any = new EventEmitter()

export const emit = controller.emit.bind(controller)
export const isRunning = (controller.isRunning = jest.fn())
export const updateKnownTokenBalances = (controller.updateKnownTokenBalances = jest.fn())
export const updateChainBalances = (controller.updateChainBalances = jest.fn())
export const scanForTokenBalances = (controller.scanForTokenBalances = jest.fn())
export const scanAccount = (controller.scanAccount = jest.fn(() => Promise.resolve(true)))
export const close = (controller.close = jest.fn())

export default jest.fn(() => controller)
