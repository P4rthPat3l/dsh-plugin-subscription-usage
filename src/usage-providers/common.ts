/** Helpers shared by the API key usage providers. */
import type { FetchFn } from '../providers/common.js'
import type { ProviderUsage } from '../providers/common.js'

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

/** An epoch in seconds or milliseconds, or an ISO date string, as epoch milliseconds. */
export function timestamp(value: unknown): number | undefined {
  const number = finite(value)
  if (number !== undefined) return number < 1_000_000_000_000 ? number * 1000 : number
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? undefined : parsed
  }
  return undefined
}

export const clampPercent = (value: number): number => Math.min(100, Math.max(0, value))

/** One key provider: how to read usage with an API key. */
export interface KeyProvider {
  id: KeyProviderId
  name: string
  /** @throws with a message that never contains the key. */
  fetchUsage(key: string, fetchFn: FetchFn, signal: AbortSignal): Promise<ProviderUsage>
}

/** Ids of the providers that read usage with a pasted API key. */
export const KEY_PROVIDER_IDS = ['zai', 'ollama-cloud', 'kimi'] as const
export type KeyProviderId = (typeof KEY_PROVIDER_IDS)[number]

export const isKeyProviderId = (value: unknown): value is KeyProviderId =>
  typeof value === 'string' && (KEY_PROVIDER_IDS as readonly string[]).includes(value)

export class KeyRejectedError extends Error {}

/** GET or POST one JSON endpoint with a bearer key. */
export async function bearerJson(
  name: string, url: string, key: string, fetchFn: FetchFn, signal: AbortSignal, method: 'GET' | 'POST' = 'GET',
): Promise<unknown> {
  const response = await fetchFn(url, { method, headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, signal })
  if (response.status === 401 || response.status === 403) throw new KeyRejectedError(`${name} rejected the key (HTTP ${response.status})`)
  if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`)
  return response.json()
}
