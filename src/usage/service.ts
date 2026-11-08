/**
 * Display-side usage reads with a refresh policy per reason, live ingestion
 * from model replies, and the account that served each session.
 *
 * Routing and display share one {@link PoolUsageTracker}, so its negative
 * cache guards the provider usage endpoints for both.
 */
import type { UsageProviderId } from '../usage-providers/index.js'
import type { ProviderUsage } from '../providers/common.js'
import type { PoolUsageTracker } from '../providers/pool-usage.js'
import { usageWindowsFromHeaders } from './headers.js'

/** Why the Client is reading usage; each reason has its own staleness bound. */
export type UsageReadReason = 'poll' | 'open' | 'manual'

/** Opening the popover refetches only snapshots older than this. */
export const OPEN_REFRESH_AFTER_MS = 60_000
/** A manual refresh of one account fetches at most once in this period. */
export const MANUAL_REFRESH_COOLDOWN_MS = 30_000

/** A usage snapshot as the Client sees it. */
export type DisplayUsage = ProviderUsage & {
  /** `live` when the latest data came from a model reply rather than the usage endpoint. */
  source?: 'live' | 'endpoint'
  /** Epoch ms before which another manual refresh returns the cached snapshot. */
  manualReadyAt?: number
}

/** The account that served a request, and when. */
export interface ServedAccount {
  account: string
  at: number
}

export interface UsageServiceOptions {
  tracker: PoolUsageTracker
  /** Whether a provider has a usage endpoint at all. */
  hasEndpoint: (provider: UsageProviderId) => boolean
  /** Runs before a manual refresh fetches, so a stale routing cooldown does not outlive the user's retry. */
  onManualRefresh?: (provider: UsageProviderId, account: string) => void
  now?: () => number
}

/** Usage reads and live ingestion for the Client surfaces. */
export class UsageService {
  private readonly lastManual = new Map<string, number>()
  private readonly live = new Set<string>()
  private readonly servedBySession = new Map<string, Map<UsageProviderId, ServedAccount>>()
  private readonly servedByProvider = new Map<UsageProviderId, ServedAccount>()
  private readonly now: () => number
  /** Bumped whenever a snapshot or serving account changes, so the Client knows to re-read. */
  revision = 0

  constructor(private readonly options: UsageServiceOptions) {
    this.now = options.now ?? Date.now
  }

  /**
   * Read one account's usage under the policy for `reason`.
   * A failure cooldown is never bypassed (the tracker answers from its negative cache).
   */
  async read(provider: UsageProviderId, account: string, reason: UsageReadReason): Promise<DisplayUsage> {
    if (!this.options.hasEndpoint(provider)) return { supported: false }
    const key = `${provider}/${account}`
    const age = this.ageOf(provider, account)
    let force = false
    if (reason === 'open') force = age === undefined || age > OPEN_REFRESH_AFTER_MS
    if (reason === 'manual') {
      const last = this.lastManual.get(key)
      if (last === undefined || this.now() - last >= MANUAL_REFRESH_COOLDOWN_MS) {
        force = true
        this.lastManual.set(key, this.now())
        this.options.onManualRefresh?.(provider, account)
      }
    }
    const before = this.options.tracker.fetchedAt(provider, account)
    const snapshot = await this.options.tracker.displaySnapshotFor(provider, account, force)
    const after = this.options.tracker.fetchedAt(provider, account)
    if (after !== before) {
      this.live.delete(key)
      this.revision++
    }
    return this.decorate(provider, account, snapshot)
  }

  /**
   * Record one model reply: its usage headers and the account that served it.
   * @returns whether usage changed.
   */
  observe(provider: UsageProviderId, account: string, sessionId: string | undefined, headers: Headers): boolean {
    const at = this.now()
    const served = { account, at }
    this.servedByProvider.set(provider, served)
    if (sessionId !== undefined) {
      const bySession = this.servedBySession.get(sessionId) ?? new Map<UsageProviderId, ServedAccount>()
      bySession.set(provider, served)
      this.servedBySession.set(sessionId, bySession)
    }
    this.revision++
    if (provider !== 'codex' && provider !== 'claude') return false
    const windows = usageWindowsFromHeaders(provider, headers)
    if (this.options.tracker.ingest(provider, account, windows, at) === undefined) return false
    this.live.add(`${provider}/${account}`)
    return true
  }

  /** The account that last served `provider`: in this session when known, else anywhere. */
  servedAccount(provider: UsageProviderId, sessionId?: string): ServedAccount | undefined {
    return (sessionId === undefined ? undefined : this.servedBySession.get(sessionId)?.get(provider))
      ?? this.servedByProvider.get(provider)
  }

  /** Forget an account after logout. */
  forget(provider: UsageProviderId, account?: string): void {
    for (const key of [...this.live]) if (key === `${provider}/${account}` || (account === undefined && key.startsWith(`${provider}/`))) this.live.delete(key)
    const served = this.servedByProvider.get(provider)
    if (served !== undefined && (account === undefined || served.account === account)) this.servedByProvider.delete(provider)
    for (const bySession of this.servedBySession.values()) {
      const entry = bySession.get(provider)
      if (entry !== undefined && (account === undefined || entry.account === account)) bySession.delete(provider)
    }
    this.revision++
  }

  private ageOf(provider: UsageProviderId, account: string): number | undefined {
    const at = this.options.tracker.fetchedAt(provider, account)
    return at === undefined || !Number.isFinite(at) ? undefined : this.now() - at
  }

  private decorate(provider: UsageProviderId, account: string, snapshot: ProviderUsage): DisplayUsage {
    const key = `${provider}/${account}`
    const last = this.lastManual.get(key)
    return {
      ...snapshot,
      source: this.live.has(key) ? 'live' : 'endpoint',
      ...last === undefined ? {} : { manualReadyAt: last + MANUAL_REFRESH_COOLDOWN_MS },
    }
  }
}
