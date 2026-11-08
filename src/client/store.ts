/**
 * One shared store per page for login status and usage, read by the Models
 * cards, the composer gauge, and its popover. It never fetches on its own
 * beyond the policy below; the Host decides whether a read reaches a provider.
 *
 * - `status` is read on start, every 5 minutes while the page is visible, after
 *   a sign-in or account change, and after each turn the gauge observes.
 * - `usage` is re-read when `status.usageRevision` moves (a reply carried new
 *   headers, or another surface fetched), when the popover opens (`open`), on
 *   the Refresh button (`manual`), and every 5 minutes while visible (`poll`).
 */
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import { call, isMetered, USAGE_PROVIDERS } from './rpc.js'
import type { AccountStatus, DisplayUsage, UsageProviderId as ProviderId, ProviderStatus, StatusValue, UsageReadReason } from './rpc.js'

export const POLL_MS = 5 * 60_000

/** Usage of one account, or the failure that left it empty. */
export type UsageEntry =
  | { kind: 'loading' }
  | { kind: 'ready'; usage: DisplayUsage; receivedAt: number }
  | { kind: 'error'; message: string }

export interface StoreSnapshot {
  status: StatusValue | undefined
  statusError: string | undefined
  /** Keyed `${provider}/${account}`. */
  usage: ReadonlyMap<string, UsageEntry>
  /** Accounts with a read in flight, keyed like `usage`. */
  refreshing: ReadonlySet<string>
}

export const usageKey = (provider: ProviderId, account: string): string => `${provider}/${account}`

export class SubscriptionsStore {
  private snapshot: StoreSnapshot = { status: undefined, statusError: undefined, usage: new Map(), refreshing: new Set() }
  private readonly listeners = new Set<() => void>()
  private lastRevision = -1
  private statusInFlight: Promise<void> | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  /** The session the gauge is showing, so `status` reports its serving account. */
  private sessionId: string | undefined

  constructor(private readonly rpc: ConnectionHandle['rpc']) {}

  getSnapshot = (): StoreSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    if (this.listeners.size === 1) this.start()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.stop()
    }
  }

  /** Report the session whose serving account the `status` read should name. */
  focusSession(sessionId: string | undefined): void {
    if (this.sessionId === sessionId) return
    this.sessionId = sessionId
    void this.refreshStatus()
  }

  /** Re-read login status; usage follows when the Host's revision moved. */
  refreshStatus(): Promise<void> {
    this.statusInFlight ??= this.readStatus().finally(() => { this.statusInFlight = undefined })
    return this.statusInFlight
  }

  /** Read every signed-in account's usage under one reason. */
  async refreshUsage(reason: UsageReadReason, only?: ProviderId): Promise<void> {
    const status = this.snapshot.status
    if (status === undefined) return
    await Promise.all(USAGE_PROVIDERS.filter(p => (only === undefined || p === only) && isMetered(status, p))
      .flatMap(provider => (status.providers[provider]?.accounts ?? []).map(account => this.readUsage(provider, account.key, reason))))
  }

  private async readStatus(): Promise<void> {
    try {
      const status = await call(this.rpc, 'status', this.sessionId === undefined ? {} : { sessionId: this.sessionId })
      const known = new Set(USAGE_PROVIDERS.flatMap(p => (status.providers[p]?.accounts ?? []).map(a => usageKey(p, a.key))))
      const usage = new Map([...this.snapshot.usage].filter(([key]) => known.has(key)))
      this.publish({ ...this.snapshot, status, statusError: undefined, usage })
      if (status.usageRevision !== this.lastRevision) {
        this.lastRevision = status.usageRevision
        await this.refreshUsage('poll')
      }
    } catch (error) {
      this.publish({ ...this.snapshot, statusError: error instanceof Error ? error.message : String(error) })
    }
  }

  private async readUsage(provider: ProviderId, account: string, reason: UsageReadReason): Promise<void> {
    const key = usageKey(provider, account)
    if (!this.snapshot.usage.has(key)) this.setUsage(key, { kind: 'loading' })
    this.publish({ ...this.snapshot, refreshing: new Set([...this.snapshot.refreshing, key]) })
    try {
      const usage = await call(this.rpc, 'usage', { provider, account, reason })
      this.setUsage(key, { kind: 'ready', usage, receivedAt: Date.now() })
    } catch (error) {
      const previous = this.snapshot.usage.get(key)
      // Keep showing a real snapshot through a failure; the Host already marks it stale.
      if (previous?.kind !== 'ready') this.setUsage(key, { kind: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally {
      const refreshing = new Set(this.snapshot.refreshing)
      refreshing.delete(key)
      this.publish({ ...this.snapshot, refreshing })
    }
  }

  private setUsage(key: string, entry: UsageEntry): void {
    const usage = new Map(this.snapshot.usage)
    usage.set(key, entry)
    this.publish({ ...this.snapshot, usage })
  }

  private publish(next: StoreSnapshot): void {
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'visible') void this.refreshStatus()
  }

  private start(): void {
    void this.refreshStatus()
    this.timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void this.refreshStatus().then(() => this.refreshUsage('poll'))
    }, POLL_MS)
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  private stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
    document.removeEventListener('visibilitychange', this.onVisibility)
  }
}

/** The account a provider is using now: the one that served last, else the default, else the first. */
export function activeAccountKey(status: ProviderStatus | undefined): string | undefined {
  if (status === undefined || status.accounts.length === 0) return undefined
  const served = status.servingAccount
  if (served !== undefined && status.accounts.some(a => a.key === served)) return served
  return (status.accounts.find(a => a.isDefault) ?? status.accounts[0])?.key
}

/** The active account shown in full, and the others that fold behind one row. */
export function splitAccounts(status: ProviderStatus): { active: AccountStatus; rest: AccountStatus[] } | undefined {
  const key = activeAccountKey(status)
  const active = status.accounts.find(a => a.key === key)
  if (active === undefined) return undefined
  return { active, rest: status.accounts.filter(a => a !== active) }
}
