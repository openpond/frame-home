import React, { useState } from 'react'
import link from '../../../resources/link'
import svg from '../../../resources/svg'
import logo from '../../../resources/branding/openpond-wallet.png'

export default function OpenPond({ connection = { state: 'disconnected', accounts: [] } }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const connected = connection.state === 'connected'
  async function act(method) {
    setBusy(true)
    setError('')
    try {
      const result = await link.invoke('openpond:connection', method)
      if (result?.error) throw new Error(result.error)
    } catch {
      setError('Could not connect. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className='signer cardShow'>
      <div className='signerTop'>
        <div className='signerDetails'>
          <div className='signerIcon'>
            <div className='signerIconWrap'>
              <img src={logo} width='24' height='24' alt='' />
            </div>
          </div>
          <div className='signerName'>{connected ? 'Personal Vault' : 'Connect OpenPond Wallet'}</div>
        </div>
        {connected ? (
          <button
            className='signerExpand'
            aria-label='Disconnect Personal Vault'
            disabled={busy}
            onClick={() => act('disconnect')}
          >
            {svg.close(14)}
          </button>
        ) : null}
      </div>
      <div className='signerAccounts'>
        {connected ? (
          connection.accounts.map((account, index) => (
            <div key={account.id} className='signerAccount signerAccountAdded signerAccountDisabled'>
              <div className='signerAccountIndex'>{index + 1}</div>
              <div className='signerAccountAddress'>
                {account.address.slice(0, 11)} {svg.octicon('kebab-horizontal', { height: 20 })}{' '}
                {account.address.slice(-10)}
              </div>
              <div className='signerAccountCheck' />
            </div>
          ))
        ) : (
          <button
            className='signerAccountsAdd'
            disabled={busy || connection.state === 'pending'}
            onClick={() => act('connect')}
          >
            {connection.state === 'pending' ? connection.code : 'Connect OpenPond Wallet'}
          </button>
        )}
      </div>
      {error ? <div role='alert'>{error}</div> : null}
    </div>
  )
}
