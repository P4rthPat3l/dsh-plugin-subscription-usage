/**
 * Usage preferences live in this plugin's volatile `usage` Config field, so
 * they persist in the profile and reach every tab. The Client reads them
 * through the settings forms service and validates the section where it
 * enters.
 */
import type { UsageProviderId as ProviderId } from './rpc.js'
import { isUsageProviderId } from './rpc.js'

export type { ProviderId }

export interface UsagePreferencesView {
  /** Show usage under the composer: the current model's provider plus `pinned`. */
  composer: boolean
  pinned: readonly ProviderId[]
  display: 'left' | 'used'
  paceWarnings: boolean
  /** Whether writes reach the profile. */
  writable: boolean
}

export const DEFAULT_PREFS: UsagePreferencesView = { composer: true, pinned: [], display: 'left', paceWarnings: true, writable: false }

/** The slice of a settings ConfigForm this store uses. */
export interface ConfigFormLike {
  getSnapshot(): { status: string; value: unknown; writable: boolean }
  subscribe(listener: () => void): () => void
  mutate(ops: readonly ({ op: 'set'; path: string[]; value: unknown } | { op: 'unset'; path: string[] })[]): Promise<boolean>
}

/** Narrow the namespace section's `usage` field, falling back field by field. */
export function parsePrefs(section: unknown, writable: boolean): UsagePreferencesView {
  const usage = section !== null && typeof section === 'object' && 'usage' in section ? section.usage : undefined
  if (usage === null || typeof usage !== 'object') return { ...DEFAULT_PREFS, writable }
  const read = (key: string): unknown => (key in usage ? (usage as Record<string, unknown>)[key] : undefined)
  const composer = read('composer')
  // Profiles saved before `composer` existed carry a three-way `gauge` mode.
  const legacyGauge = read('gauge')
  const display = read('display')
  const pinned = read('pinned')
  const pace = read('paceWarnings')
  return {
    composer: typeof composer === 'boolean' ? composer : legacyGauge !== 'off',
    pinned: Array.isArray(pinned) ? pinned.filter(isUsageProviderId) : [],
    display: display === 'used' ? 'used' : 'left',
    paceWarnings: typeof pace === 'boolean' ? pace : true,
    writable,
  }
}

export class PrefsStore {
  private snapshot: UsagePreferencesView = DEFAULT_PREFS
  private readonly listeners = new Set<() => void>()
  private unsubscribe: (() => void) | undefined
  private form: ConfigFormLike | undefined

  getSnapshot = (): UsagePreferencesView => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Bind the form once the settings service is available; returns the unbinder. */
  bind(form: ConfigFormLike): () => void {
    this.form = form
    const sync = (): void => {
      const view = form.getSnapshot()
      if (view.status !== 'ready') return
      this.publish(parsePrefs(view.value, view.writable))
    }
    this.unsubscribe = form.subscribe(sync)
    sync()
    return () => {
      this.unsubscribe?.()
      this.form = undefined
    }
  }

  /** Change some preferences; the shown value updates at once and settles on the Host's answer. */
  async set(patch: Partial<Omit<UsagePreferencesView, 'writable'>>): Promise<boolean> {
    const next = { ...this.snapshot, ...patch }
    this.publish(next)
    if (this.form === undefined) return false
    const ops: Parameters<ConfigFormLike['mutate']>[0][number][] = Object.entries(patch).map(([key, value]) => ({ op: 'set' as const, path: ['usage', key], value }))
    // `composer` replaces the legacy `gauge` mode; drop it on the first write.
    ops.push({ op: 'unset', path: ['usage', 'gauge'] })
    return this.form.mutate(ops)
  }

  togglePinned(provider: ProviderId): Promise<boolean> {
    const pinned = this.snapshot.pinned.includes(provider)
      ? this.snapshot.pinned.filter(p => p !== provider)
      : [...this.snapshot.pinned, provider]
    return this.set({ pinned })
  }

  private publish(next: UsagePreferencesView): void {
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }
}
