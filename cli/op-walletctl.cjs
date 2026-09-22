#!/usr/bin/env node
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { createHash } = require('node:crypto')
const args = process.argv.slice(2)
const method = args[0] || 'status'
const json = args.includes('--json')
const profileIndex = args.indexOf('--profile')
const profile = profileIndex >= 0 ? path.resolve(args[profileIndex + 1] || '') : undefined
const root =
  process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library/Application Support')
    : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
const key = profile ? createHash('sha256').update(profile).digest('hex').slice(0, 16) : 'service'
const discovery = path.join(root, 'openpond-local-wallet', `${key}.json`)
function metadata() {
  const stat = fs.statSync(discovery)
  if (typeof process.getuid === 'function' && (stat.uid !== process.getuid() || stat.mode & 0o077))
    throw new Error('Unsafe service discovery permissions')
  const value = JSON.parse(fs.readFileSync(discovery, 'utf8'))
  if (value.version !== 1 || typeof value.socket !== 'string')
    throw new Error('Unsupported local wallet service')
  return value
}
function request(meta) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: meta.socket,
        path: `/${method}`,
        method: 'POST',
        headers: { 'Content-Length': '0' },
        timeout: 15000
      },
      (res) => {
        let body = ''
        res.on('data', (chunk) => {
          body += chunk
          if (body.length > 4 * 1024 * 1024) req.destroy(new Error('Response too large'))
        })
        res.on('end', () => {
          try {
            const data = JSON.parse(body)
            if (res.statusCode !== 200) throw new Error(data.error)
            if (data.version !== 1) throw new Error('Unsupported protocol')
            resolve(data.result)
          } catch (error) {
            reject(error)
          }
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error('Wallet service timed out')))
    req.on('error', reject)
    req.end()
  })
}
async function main() {
  if (method === '--help' || method === '-h')
    return { usage: 'op-walletctl connect|status|accounts|holdings [--json] [--profile PATH]' }
  if (profileIndex >= 0 && (!args[profileIndex + 1] || args[profileIndex + 1].startsWith('--')))
    throw new Error('--profile requires a path')
  if (!['connect', 'status', 'accounts', 'holdings'].includes(method))
    throw new Error('Usage: op-walletctl connect|status|accounts|holdings [--json] [--profile PATH]')
  let meta
  try {
    meta = metadata()
    return await request(meta)
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ECONNREFUSED') throw error
  }
  const executable = process.env.OP_WALLET_EXECUTABLE || meta?.executable || 'openpond-local-wallet'
  const child = spawn(executable, meta?.args || [], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      ...(profile || meta?.profile
        ? { OPENPOND_WALLET_PROFILE: profile || meta.profile, FRAME_HOME_USER_DATA: profile || meta.profile }
        : {})
    }
  })
  let launchError
  child.on('error', (error) => {
    launchError = error
  })
  child.unref()
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    if (launchError)
      throw new Error('Install or launch OpenPond Local Wallet first, or set OP_WALLET_EXECUTABLE')
    try {
      return await request(metadata())
    } catch (error) {
      if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error
    }
  }
  throw new Error('Wallet did not start within 30 seconds')
}
main()
  .then((result) => {
    if (json) console.log(JSON.stringify(result))
    else console.log(JSON.stringify(result, null, 2))
  })
  .catch((error) => {
    console.error(json ? JSON.stringify({ error: error.message }) : error.message)
    process.exitCode = 1
  })
