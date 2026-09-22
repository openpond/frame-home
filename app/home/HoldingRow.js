import { Fragment, useState } from 'react'
import RingIcon from '../../resources/Components/RingIcon'
import { DisplayCoinBalance } from '../../resources/Components/DisplayValue'
import svg from '../../resources/svg'
import { money, shortAddress } from './portfolio'

const Value = ({ value, partial }) => (
  <span title={partial ? 'Some balances have no price; this is the priced portion.' : undefined}>
    {value === null ? '—' : `${partial ? '≈ ' : ''}${money(value)}`}
  </span>
)

export default function HoldingRow({ row, openAccount }) {
  const [expanded, setExpanded] = useState(false)
  const top = row.holders[0]
  const detailsId = `accounts-${encodeURIComponent(row.key)}`
  return (
    <Fragment>
      <tr className='homeAssetRow'>
        <td>
          <div className='homeAsset'>
            <RingIcon
              alt={row.symbol}
              svgName={row.isNative ? undefined : 'tokens'}
              img={row.logoURI}
              color={row.chainColor ? `var(--${row.chainColor})` : ''}
            />
            <span>
              {row.name}
              <small>{row.symbol}</small>
            </span>
          </div>
        </td>
        <td className='homeChain' title={row.networks.map((network) => network.name).join(', ')}>
          {row.networks[0].name}
          {row.networks.length > 1 && <small>+{row.networks.length - 1} networks</small>}
        </td>
        <td>
          <button
            className='homeHoldersToggle'
            aria-label={`Show accounts holding ${row.symbol}`}
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded(!expanded)}
          >
            <span>
              {top.walletName}
              <small>
                {row.holders.length > 1
                  ? `+${row.holders.length - 1} ${row.holders.length === 2 ? 'account' : 'accounts'}`
                  : shortAddress(top.walletAddress)}
              </small>
            </span>
            <span className={expanded ? 'homeHoldersChevron homeHoldersChevronOpen' : 'homeHoldersChevron'}>
              {svg.chevron(14)}
            </span>
          </button>
        </td>
        <td className='numeric'>
          <DisplayCoinBalance amount={row.rawBalance} decimals={row.decimals} symbol={row.symbol} />
        </td>
        <td className='numeric homeValue'>
          <Value {...row} />
        </td>
      </tr>
      {expanded && (
        <tr className='homeBreakdownRow'>
          <td colSpan={5}>
            <div
              id={detailsId}
              className='homeAccountBreakdown'
              aria-label={`Accounts holding ${row.symbol}`}
            >
              {row.holders.map((holder) => (
                <div className='homeAccountPosition' key={holder.walletId}>
                  <button
                    className='homeAccountLink'
                    onClick={() => openAccount(holder.walletId)}
                    aria-label={`Open account ${holder.walletName}`}
                  >
                    <span>{holder.walletName}</span>
                    <small title={holder.walletAddress}>{shortAddress(holder.walletAddress)}</small>
                  </button>
                  <div className='homePositionNetworks'>
                    {holder.positions.map((position) => (
                      <small key={position.key}>
                        {position.chainName}
                        {' · '}
                        <DisplayCoinBalance
                          amount={position.rawBalance}
                          decimals={position.decimals}
                          symbol={position.symbol}
                        />
                      </small>
                    ))}
                  </div>
                  <div className='numeric'>
                    <DisplayCoinBalance
                      amount={holder.rawBalance}
                      decimals={holder.decimals}
                      symbol={holder.symbol}
                    />
                  </div>
                  <div className='numeric homeValue'>
                    <Value {...holder} />
                  </div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}
