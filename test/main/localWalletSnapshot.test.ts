import { freshness } from '../../main/localWallet/snapshot'

test('marks missing, old, partial and offline balance snapshots explicitly', () => {
  expect(freshness(undefined, true, 200000)).toEqual({
    state: 'pending',
    checkedAt: null,
    stale: true,
    partial: true
  })
  expect(freshness({ state: 'updated', checkedAt: 1000 }, true, 200000).stale).toBe(true)
  expect(freshness({ state: 'updated', checkedAt: 1000 }, true, 2000)).toMatchObject({
    stale: false,
    partial: false
  })
  expect(freshness({ state: 'partial', checkedAt: 1000 }, true, 2000)).toMatchObject({
    stale: false,
    partial: true
  })
  expect(freshness({ state: 'updated', checkedAt: 1000 }, false, 2000)).toMatchObject({
    state: 'offline',
    stale: true
  })
})
