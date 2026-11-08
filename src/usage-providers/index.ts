/**
 * Usage providers read with a pasted API key. They are separate from the
 * OAuth `ProviderId` set, which drives login, model routing and the pool.
 */
import type { FetchFn, ProviderUsage } from '../providers/common.js'
import { isKeyProviderId, KEY_PROVIDER_IDS } from './common.js'
import type { KeyProvider, KeyProviderId } from './common.js'
import { KeyStore } from './keys.js'
import { kimi } from './kimi.js'
import { ollamaCloud } from './ollama-cloud.js'
import { zai } from './zai.js'

import type { ProviderId } from '../auth/store.js'

export { isKeyProviderId, KEY_PROVIDER_IDS }
/** Anything the Usage page can read: an OAuth provider or a key provider. */
export type UsageProviderId = ProviderId | KeyProviderId
export type { KeyProviderId }

const PROVIDERS: Record<KeyProviderId, KeyProvider> = { zai, 'ollama-cloud': ollamaCloud, kimi }

/** The only account a key provider has. */
export const KEY_ACCOUNT = 'key'

/** One key provider as `status` reports it. */
export interface KeyProviderView {
  id: KeyProviderId
  name: string
  configured: boolean
  /** Last four characters of the key, for recognition. */
  tail?: string
}

const KEY_TIMEOUT_MS = 20_000

export class KeyUsage {
  /** Providers with a stored key; kept in memory so the tracker can look up a fetcher synchronously. */
  private readonly configured = new Set<KeyProviderId>()

  constructor(
    private readonly store: KeyStore,
    private readonly fetchFn: FetchFn,
    private readonly onChanged: (id: KeyProviderId) => void,
  ) {}

  /** Load the stored keys once at startup. */
  async load(): Promise<void> {
    this.configured.clear()
    for (const id of Object.keys(await this.store.read())) if (isKeyProviderId(id)) this.configured.add(id)
  }

  has(id: KeyProviderId): boolean {
    return this.configured.has(id)
  }

  async list(): Promise<KeyProviderView[]> {
    const keys = await this.store.read()
    return KEY_PROVIDER_IDS.map(id => {
      const key = keys[id]
      return { id, name: PROVIDERS[id].name, configured: key !== undefined, ...key === undefined ? {} : { tail: key.slice(-4) } }
    })
  }

  /** Read usage with the stored key; the tracker polls this. */
  async fetchStored(id: KeyProviderId): Promise<ProviderUsage> {
    const key = (await this.store.read())[id]
    if (key === undefined) throw new Error('No key is stored')
    return this.fetch(id, key)
  }

  /** Check the key with one usage read, then store it. A bad key stores nothing. */
  async set(id: KeyProviderId, key: string): Promise<void> {
    const trimmed = key.trim()
    if (trimmed === '') throw new Error('The key is empty')
    await this.fetch(id, trimmed)
    await this.store.set(id, trimmed)
    this.configured.add(id)
    this.onChanged(id)
  }

  async remove(id: KeyProviderId): Promise<void> {
    await this.store.remove(id)
    this.configured.delete(id)
    this.onChanged(id)
  }

  private async fetch(id: KeyProviderId, key: string): Promise<ProviderUsage> {
    try {
      return await PROVIDERS[id].fetchUsage(key, this.fetchFn, AbortSignal.timeout(KEY_TIMEOUT_MS))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(message.split(key).join('…'))
    }
  }
}

export { KeyStore }
