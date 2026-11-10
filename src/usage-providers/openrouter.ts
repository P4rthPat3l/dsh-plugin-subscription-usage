/** OpenRouter key usage and spending limits from `openrouter.ai/api/v1/key`. */
import type { ProviderUsage, UsageWindow } from '../providers/common.js'
import { bearerJson, clampPercent, finite, isRecord } from './common.js'
import type { KeyProvider } from './common.js'

const URL = 'https://openrouter.ai/api/v1/key'
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

export function resolveOpenRouterReset(limitReset: string | null | undefined, nowMs = Date.now()): number | undefined {
  if (!limitReset) return undefined
  const d = new Date(nowMs)
  if (limitReset === 'daily') {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
  }
  if (limitReset === 'weekly') {
    const day = d.getUTCDay()
    const daysUntilNextMonday = ((8 - day) % 7) || 7
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntilNextMonday)
  }
  if (limitReset === 'monthly') {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
  }
  return undefined
}

export function parseOpenRouterUsage(payload: unknown, nowMs = Date.now()): ProviderUsage {
  if (!isRecord(payload)) throw new Error('OpenRouter returned no object')
  const data = isRecord(payload.data) ? payload.data : undefined
  if (!data) throw new Error('OpenRouter returned no data object')

  if (data.is_management_key === true) {
    throw new Error('Management key configured — quota needs an inference API key')
  }

  const limit = finite(data.limit)
  const limitRemaining = finite(data.limit_remaining)

  if (data.limit === null || limit === undefined) {
    throw new Error('This OpenRouter key has no credit or spending limit configured')
  }
  if (limitRemaining === undefined) {
    throw new Error('OpenRouter returned no remaining limit')
  }

  const used = Math.max(0, limit - limitRemaining)
  const usedPercent = limit > 0 ? clampPercent((used / limit) * 100) : 0

  const resetPeriod = typeof data.limit_reset === 'string' ? data.limit_reset : undefined
  const resetsAt = resolveOpenRouterReset(resetPeriod, nowMs)

  const kind: UsageWindow['kind'] = resetPeriod === 'weekly' ? 'weekly' : (resetPeriod === 'daily' ? 'session' : 'other')
  const durationMs = resetPeriod === 'weekly' ? 7 * DAY_MS : (resetPeriod === 'daily' ? DAY_MS : (resetPeriod === 'monthly' ? 30 * DAY_MS : undefined))

  const windows: UsageWindow[] = [{
    kind,
    usedPercent,
    ...durationMs === undefined ? {} : { durationMs },
    ...resetsAt === undefined ? {} : { resetsAt },
    used,
    limit,
  }]

  const plan = typeof data.label === 'string' && data.label !== '' ? data.label : undefined
  return { supported: true, windows, ...plan === undefined ? {} : { plan } }
}

export const openrouter: KeyProvider = {
  id: 'openrouter',
  name: 'OpenRouter',
  async fetchUsage(key, fetchFn, signal): Promise<ProviderUsage> {
    const payload = await bearerJson('OpenRouter', URL, key, fetchFn, signal)
    return parseOpenRouterUsage(payload)
  },
}
