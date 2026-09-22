import log from 'electron-log'
import { mapRequest } from '../requests'

const has = (value: any) => value !== null && value !== undefined

export default function <T extends JSONRPCRequestPayload>(data: string): T | false {
  try {
    const payload = (JSON.parse(data) as T) || {}

    if (has(payload.id) && has(payload.method)) {
      if (!payload.params) payload.params = []

      let normalized = payload as unknown as RPCRequestPayload
      for (let depth = 0; ['wallet_request', 'caip_request'].includes(normalized.method); depth++) {
        if (depth >= 4) return false
        normalized = mapRequest(normalized)
      }
      Object.assign(payload, normalized)
      if (
        ['eth_subscribe', 'eth_unsubscribe', 'eth_pollSubscriptions'].includes(payload.method) &&
        !Array.isArray(payload.params)
      )
        return false

      return (
        !!(
          (typeof payload.id === 'number' || typeof payload.id === 'string') &&
          payload.jsonrpc === '2.0' &&
          typeof payload.method === 'string' &&
          (Array.isArray(payload.params) || typeof payload.params === 'object')
        ) && payload
      )
    }
  } catch (e) {
    log.info('Invalid RPC payload')
  }

  return false
}
