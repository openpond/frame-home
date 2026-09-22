export type Scan = { state: string; checkedAt?: number }
export function freshness(scan: Scan | undefined, connected: boolean, now = Date.now()) {
  const age = scan?.checkedAt === undefined ? undefined : Math.max(0, now - scan.checkedAt)
  return {
    state: !connected ? 'offline' : !scan ? 'pending' : scan.state,
    checkedAt: scan?.checkedAt ? new Date(scan.checkedAt).toISOString() : null,
    stale: !connected || age === undefined || age > 180_000,
    partial: !scan || scan.state !== 'updated'
  }
}
