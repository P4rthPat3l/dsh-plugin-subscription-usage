/** ClinePass usage from `api.cline.bot/api/v1/users/me/plan/usage-limits`. */
import type { ProviderUsage, UsageWindow } from '../providers/common.js'
import { bearerJson, clampPercent, finite, isRecord, timestamp } from './common.js'
import type { KeyProvider } from './common.js'

const URL = 'https://api.cline.bot/api/v1/users/me/plan/usage-limits'
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

const LIMIT_MAP: Record<string, { kind: UsageWindow['kind']; durationMs?: number }> = {
  five_hour: { kind: 'session', durationMs: 5 * HOUR_MS },
  weekly: { kind: 'weekly', durationMs: 7 * DAY_MS },
  monthly: { kind: 'other', durationMs: 30 * DAY_MS },
}

export function parseClinePassUsage(payload: unknown): ProviderUsage {
  if (!isRecord(payload)) throw new Error('ClinePass returned no object')
  const data = isRecord(payload.data) ? payload.data : {}
  const limits = Array.isArray(data.limits) ? data.limits : []
  const windows: UsageWindow[] = []

  for (const item of limits) {
    if (!isRecord(item)) continue
    const type = typeof item.type === 'string' ? item.type : undefined
    if (!type || !LIMIT_MAP[type]) continue

    const percent = finite(item.percentUsed) ?? (typeof item.percentUsed === 'string' ? finite(Number(item.percentUsed)) : undefined)
    if (percent === undefined) continue

    const config = LIMIT_MAP[type]
    const resetsAt = timestamp(item.resetsAt)
    windows.push({
      kind: config.kind,
      usedPercent: clampPercent(percent),
      ...config.durationMs === undefined ? {} : { durationMs: config.durationMs },
      ...resetsAt === undefined ? {} : { resetsAt },
    })
  }

  if (windows.length === 0) throw new Error('ClinePass usage data could not be parsed')
  return { supported: true, windows }
}

export const clinePass: KeyProvider = {
  id: 'cline-pass',
  name: 'ClinePass',
  async fetchUsage(key, fetchFn, signal): Promise<ProviderUsage> {
    const payload = await bearerJson('ClinePass', URL, key, fetchFn, signal)
    return parseClinePassUsage(payload)
  },
}
