/** Kimi Code usage from `/coding/v1/usages`. */
import { monthBefore } from '../providers/copilot.js'
import type { ProviderUsage, UsageWindow } from '../providers/common.js'
import { bearerJson, clampPercent, finite, isRecord, KeyRejectedError, timestamp } from './common.js'
import type { KeyProvider } from './common.js'

/** Which host serves a key is not documented, so the second is tried when the first rejects it. */
const URLS = ['https://api.kimi.com/coding/v1/usages', 'https://api.kimi.ai/coding/v1/usages'] as const
const HOUR_MS = 3_600_000

const RATIOS = [
  { key: 'limit_5h', kind: 'session', durationMs: 5 * HOUR_MS },
  { key: 'limit_7d', kind: 'weekly', durationMs: 7 * 24 * HOUR_MS },
  { key: 'limit_month_total', kind: 'other', durationMs: undefined },
] as const

export function parseKimiUsage(payload: unknown): UsageWindow[] {
  const usages = isRecord(payload) && isRecord(payload.usages) ? payload.usages : {}
  const windows: UsageWindow[] = []
  for (const { key, kind, durationMs } of RATIOS) {
    const entry = usages[key]
    if (!isRecord(entry)) continue
    const ratio = finite(entry.used_ratio)
    if (ratio === undefined) continue
    const resetsAt = timestamp(entry.reset_time)
    const length = durationMs ?? (resetsAt === undefined ? undefined : monthBefore(resetsAt))
    windows.push({
      kind, usedPercent: clampPercent(ratio * 100),
      ...length === undefined ? {} : { durationMs: length },
      ...resetsAt === undefined ? {} : { resetsAt },
    })
  }
  return windows
}

export const kimi: KeyProvider = {
  id: 'kimi',
  name: 'Kimi Code',
  async fetchUsage(key, fetchFn, signal): Promise<ProviderUsage> {
    let rejected: KeyRejectedError | undefined
    for (const url of URLS) {
      try {
        const windows = parseKimiUsage(await bearerJson('Kimi', url, key, fetchFn, signal))
        if (windows.length === 0) throw new Error('Kimi usage data could not be parsed')
        return { supported: true, windows }
      } catch (error) {
        if (!(error instanceof KeyRejectedError)) throw error
        rejected = error
      }
    }
    throw new Error(`${rejected?.message ?? 'Kimi rejected the key'}. It may not be a Kimi Code key.`)
  },
}
