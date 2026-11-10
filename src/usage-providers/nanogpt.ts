/** NanoGPT subscription usage from `nano-gpt.com/api/subscription/v1/usage`. */
import type { ProviderUsage, UsageWindow } from '../providers/common.js'
import { bearerJson, clampPercent, finite, isRecord, timestamp } from './common.js'
import type { KeyProvider } from './common.js'

const URL = 'https://nano-gpt.com/api/subscription/v1/usage'
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

export function parseNanoGptUsage(payload: unknown): ProviderUsage {
  if (!isRecord(payload)) throw new Error('NanoGPT returned no object')
  const limits = isRecord(payload.limits) ? payload.limits : {}

  const dailyQuota = payload.dailyInputTokens !== undefined ? payload.dailyInputTokens : payload.daily
  const quotas = [
    {
      kind: 'session' as const,
      durationMs: DAY_MS,
      quota: dailyQuota,
      limit: finite(limits.dailyInputTokens) ?? (isRecord(dailyQuota) ? finite(dailyQuota.limit) : undefined),
    },
    {
      kind: 'weekly' as const,
      durationMs: 7 * DAY_MS,
      quota: payload.weeklyInputTokens,
      limit: finite(limits.weeklyInputTokens) ?? (isRecord(payload.weeklyInputTokens) ? finite(payload.weeklyInputTokens.limit) : undefined),
    },
    {
      kind: 'other' as const,
      durationMs: undefined,
      quota: payload.monthly,
      limit: isRecord(payload.monthly) ? finite(payload.monthly.limit) : undefined,
    },
  ]

  const windows: UsageWindow[] = []
  for (const { kind, durationMs, quota, limit } of quotas) {
    if (!isRecord(quota) || quota.degraded === true) continue
    const rawPercent = finite(quota.percentUsed)
    const used = finite(quota.used)
    let usedPercent: number | undefined

    if (rawPercent !== undefined) {
      usedPercent = clampPercent(rawPercent * 100)
    } else if (used !== undefined && limit !== undefined && limit > 0) {
      usedPercent = clampPercent((used / limit) * 100)
    }

    if (usedPercent !== undefined) {
      const resetsAt = timestamp(quota.resetAt)
      windows.push({
        kind,
        usedPercent,
        ...durationMs === undefined ? {} : { durationMs },
        ...resetsAt === undefined ? {} : { resetsAt },
        ...used !== undefined && limit !== undefined ? { used, limit } : {},
      })
    }
  }

  if (windows.length === 0) throw new Error('NanoGPT usage data could not be parsed')
  const plan = typeof payload.state === 'string' && payload.state !== 'active' ? payload.state : undefined
  return { supported: true, windows, ...plan === undefined ? {} : { plan } }
}

export const nanogpt: KeyProvider = {
  id: 'nanogpt',
  name: 'NanoGPT',
  async fetchUsage(key, fetchFn, signal): Promise<ProviderUsage> {
    const payload = await bearerJson('NanoGPT', URL, key, fetchFn, signal)
    return parseNanoGptUsage(payload)
  },
}
