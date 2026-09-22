import log from 'electron-log'
import path from 'path'
import { ChildProcess, fork } from 'child_process'
import { EventEmitter } from 'stream'

import { toTokenId } from '../../../resources/domain/balance'

import type { CurrencyBalance, TokenBalance } from './scan'
import type { Token } from '../../store/state'

const BOOTSTRAP_TIMEOUT_SECONDS = 20

interface WorkerMessage {
  type: string
}

interface TokenBalanceMessage extends Omit<WorkerMessage, 'type'> {
  type: 'tokenBalances'
  address: Address
  balances: TokenBalance[]
}

interface TokenBlacklistMessage extends Omit<WorkerMessage, 'type'> {
  type: 'tokenBlacklist'
  address: Address
  tokens: Token[]
}

interface ChainBalanceMessage extends Omit<WorkerMessage, 'type'> {
  type: 'chainBalances'
  address: Address
  balances: CurrencyBalance[]
}

export default class BalancesWorkerController extends EventEmitter {
  private readonly worker: ChildProcess

  private bootstrapTimeout?: NodeJS.Timeout
  private heartbeat?: NodeJS.Timeout
  private nextScanId = 0
  private stopped = false
  private activeAccounts = new Map<string, Promise<boolean>>()
  private scans = new Map<
    number,
    { resolve: (complete: boolean) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >()

  constructor() {
    super()

    const workerArgs = process.env.NODE_ENV === 'development' ? ['--inspect=127.0.0.1:9230'] : []
    this.worker = fork(path.resolve(__dirname, 'worker.js'), [], { execArgv: workerArgs })

    log.info('created balances worker, pid:', this.worker.pid)

    // restart the worker if no ready event is received within a reasonable time frame
    this.bootstrapTimeout = setTimeout(() => {
      log.warn(
        `Balances worker with pid ${this.worker.pid} did not report as ready after ${BOOTSTRAP_TIMEOUT_SECONDS} seconds, killing worker`
      )
      this.stopWorker()
    }, BOOTSTRAP_TIMEOUT_SECONDS * 1000)

    this.worker.on('message', (message: WorkerMessage) => {
      if (this.stopped) return
      log.debug(`balances controller received message: ${JSON.stringify(message)}`)

      if (message.type === 'ready') {
        this.clearBootstrapTimeout()

        log.info(`balances worker ready, pid: ${this.worker.pid}`)

        this.heartbeat = setInterval(() => this.sendHeartbeat(), 1000 * 20)

        this.emit('ready')
      }

      if (message.type === 'accountScanComplete') {
        const { scanId, complete } = message as WorkerMessage & { scanId: number; complete: boolean }
        const pending = this.scans.get(scanId)
        if (pending) {
          clearTimeout(pending.timer)
          this.scans.delete(scanId)
          pending.resolve(complete)
        }
      }

      if (message.type === 'chainBalances') {
        const { address, balances } = message as ChainBalanceMessage
        this.emit('chainBalances', address, balances)
      }

      if (message.type === 'tokenBalances') {
        const { address, balances } = message as TokenBalanceMessage
        this.emit('tokenBalances', address, balances)
      }

      if (message.type === 'tokenBlacklist') {
        const { address, tokens } = message as TokenBlacklistMessage
        const tokenSet = new Set(tokens.map(toTokenId))
        this.emit('tokenBlacklist', address, tokenSet)
      }
    })

    this.worker.on('close', (code, signal) => {
      // emitted after exit or error and when all stdio streams are closed
      log.warn(`balances worker exited with code ${code}, signal: ${signal}, pid: ${this.worker.pid}`)
      this.stopWorker()
      this.worker.removeAllListeners()

      this.emit('close')
      this.removeAllListeners()
    })

    this.worker.on('disconnect', () => {
      log.warn(`balances worker disconnected`)
      this.stopWorker()
    })

    this.worker.on('error', (err) => {
      log.warn(`balances worker sent error, pid: ${this.worker.pid}`, err)
      this.stopWorker()
    })
  }

  close() {
    log.info(`closing worker controller`)

    this.stopWorker()
  }

  isRunning() {
    return !!this.heartbeat
  }

  scanAccount(address: Address, tokens: Token[], chains: number[]): Promise<boolean> {
    if (!this.isRunning()) return Promise.reject(new Error('Balances worker is not ready'))
    const key = `${address}:${chains
      .slice()
      .sort((a, b) => a - b)
      .join(',')}`
    const active = this.activeAccounts.get(key)
    if (active) return active
    if (this.scans.size >= 2) return Promise.resolve(false)
    const scanId = ++this.nextScanId
    const result = new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.scans.delete(scanId)
        reject(new Error('Account balance scan timed out'))
        this.stopWorker()
      }, 60_000)
      this.scans.set(scanId, { resolve, reject, timer })
      this.sendCommandToWorker('scanAccount', [scanId, address, tokens, chains])
    }).finally(() => this.activeAccounts.delete(key))
    this.activeAccounts.set(key, result)
    return result
  }

  // private
  private stopWorker() {
    if (this.stopped) return
    this.stopped = true
    for (const pending of this.scans.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Balances worker stopped'))
    }
    this.scans.clear()
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = undefined
    }

    this.clearBootstrapTimeout()

    this.worker.kill('SIGTERM')
  }

  private isWorkerReachable() {
    return this.worker.connected && this.worker.channel && this.worker.listenerCount('error') > 0
  }

  // sending messages
  private sendCommandToWorker(command: string, args: any[] = []) {
    log.debug(`sending command ${command} to worker`)

    try {
      if (!this.isWorkerReachable()) {
        log.error(`attempted to send command "${command}" to worker but worker cannot be reached!`)
        return
      }

      this.worker.send({ command, args })
    } catch (e) {
      log.error(`unknown error sending command "${command}" to worker`, e)
    }
  }

  private sendHeartbeat() {
    this.sendCommandToWorker('heartbeat')
  }

  private clearBootstrapTimeout() {
    if (this.bootstrapTimeout) {
      clearTimeout(this.bootstrapTimeout)
      this.bootstrapTimeout = undefined
    }
  }
}
