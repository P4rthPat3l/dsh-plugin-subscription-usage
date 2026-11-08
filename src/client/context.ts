/**
 * What every surface receives through slot `inject`: the shared store, the
 * RPC caller, the copy function, and the usage preferences form.
 */
import { useSyncExternalStore } from 'react'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type { ProviderId, UsagePreferencesView } from './prefs.js'
import type { SubscriptionsStore, StoreSnapshot } from './store.js'
import type { T } from './meter.js'
import type { PrefsStore } from './prefs.js'

export interface SurfaceInjected {
  store: SubscriptionsStore
  prefs: PrefsStore
  rpc: ConnectionHandle['rpc']
  t: T
  /** Open Settings at the Models page, when the shell offers it. */
  openSettings?: () => void
}

export function useStore(store: SubscriptionsStore): StoreSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

export function usePrefs(prefs: PrefsStore): UsagePreferencesView {
  return useSyncExternalStore(prefs.subscribe, prefs.getSnapshot)
}

export type { ProviderId }
