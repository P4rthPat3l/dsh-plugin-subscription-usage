/** Z.ai coding plan usage from `api.z.ai/api/monitor/usage/quota/limit`. */
import type { ProviderUsage, UsageWindow } from '../providers/common.js'
import { bearerJson, clampPercent, finite, isRecord, timestamp } from './common.js'
import type { KeyProvider } from './common.js'

const URL = 'https://api.z.ai/api/monitor/usage/quota/limit'
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
/** Z.ai's `unit` codes for a token window, as the length of one unit. */
const UNIT_MS: Record<number, number> = { 3: HOUR_MS, 6: 7 * DAY_MS }

export function parseZaiUsage(payload: unknown): ProviderUsage {
  if (!isRecord(payload)) throw new Error('Z.ai returned no object')
  // A bad key or missing plan arrives as HTTP 200 with `success: false`.
  const code = payload.code
  if (payload.success === false || (code !== undefined && code !== null && code !== 200)) {
    throw new Error(typeof payload.msg === 'string' && payload.msg !== '' ? payload.msg : `Z.ai error ${String(code)}`)
  }
  const data = isRecord(payload.data) ? payload.data : {}
  const limits = Array.isArray(data.limits) ? data.limits : []
  const windows: UsageWindow[] = []
  for (const limit of limits) {
    if (!isRecord(limit)) continue
    const percent = finite(limit.percentage)
    if (percent === undefined) continue
    const resetsAt = timestamp(limit.nextResetTime)
    if (limit.type === 'TIME_LIMIT') {
      windows.push({ kind: 'other', scope: 'MCP', usedPercent: clampPercent(percent), durationMs: 30 * DAY_MS, ...resetsAt === undefined ? {} : { resetsAt } })
    } else if (limit.type === 'TOKENS_LIMIT' || limit.type === 'CREDIT_LIMIT') {
      const unit = finite(limit.unit)
      const number = finite(limit.number)
      const unitMs = unit === undefined ? undefined : UNIT_MS[unit]
      const durationMs = unitMs === undefined || number === undefined || number <= 0 ? undefined : unitMs * number
      const used = finite(limit.currentValue)
      const total = finite(limit.usage)
      windows.push({
        kind: durationMs === 5 * HOUR_MS ? 'session' : durationMs === 7 * DAY_MS ? 'weekly' : 'other',
        usedPercent: clampPercent(percent),
        ...durationMs === undefined ? {} : { durationMs },
        ...resetsAt === undefined ? {} : { resetsAt },
        ...used === undefined || total === undefined ? {} : { used, limit: total },
      })
    }
  }
  const plan = typeof data.level === 'string' && data.level !== '' ? data.level : undefined
  return { supported: true, windows, ...plan === undefined ? {} : { plan } }
}

export const zai: KeyProvider = {
  id: 'zai',
  name: 'Z.ai',
  async fetchUsage(key, fetchFn, signal) {
    return parseZaiUsage(await bearerJson('Z.ai', URL, key, fetchFn, signal))
  },
}
