/** MiniMax Coding Plan usage from `/v1/token_plan/remains` or `/v1/api/openplatform/coding_plan/remains`. */
import type { ProviderUsage, UsageWindow } from '../providers/common.js'
import { bearerJson, clampPercent, finite, isRecord, KeyRejectedError, timestamp } from './common.js'
import type { KeyProvider } from './common.js'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const WINDOW_STATUS_INACTIVE = 3
const TEXT_MODELS = ['general', 'chat', 'text']

const DOMAINS = [
  { token: 'https://api.minimax.io/v1/token_plan/remains', coding: 'https://api.minimax.io/v1/api/openplatform/coding_plan/remains' },
  { token: 'https://api.minimaxi.com/v1/token_plan/remains', coding: 'https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains' },
] as const

const pickChatModel = (models: unknown[]): Record<string, unknown> | undefined => {
  const records = models.filter(isRecord)
  const m3 = records.find(m => typeof m.model_name === 'string' && /^minimax-m/i.test(m.model_name) && (finite(m.current_interval_total_count) ?? 0) > 0)
  if (m3) return m3
  const text = records.find(m => typeof m.model_name === 'string' && TEXT_MODELS.includes(m.model_name.toLowerCase()))
  if (text) return text
  const percent = records.find(m => typeof m.current_interval_remaining_percent === 'number')
  if (percent) return percent
  return records[0]
}

export function parseMiniMaxUsage(payload: unknown, isTokenPlan = true): ProviderUsage {
  if (!isRecord(payload)) throw new Error('MiniMax returned no object')
  const baseResp = isRecord(payload.base_resp) ? payload.base_resp : undefined
  if (baseResp) {
    const code = finite(baseResp.status_code)
    if (code !== undefined && code !== 0) {
      if (code === 1004) throw new Error("MiniMax doesn't share limits for this key")
      const msg = typeof baseResp.status_msg === 'string' && baseResp.status_msg.trim() !== '' ? baseResp.status_msg.trim() : undefined
      throw new Error(msg ?? `MiniMax error ${code}`)
    }
  }

  const remains = Array.isArray(payload.model_remains) ? payload.model_remains : []
  const model = pickChatModel(remains)
  if (!model) throw new Error('MiniMax returned no model quota data')

  const windows: UsageWindow[] = []

  // 1. Rolling 5h interval window
  const intervalTotal = finite(model.current_interval_total_count)
  const intervalUsage = finite(model.current_interval_usage_count)
  const intervalRemainingPercent = finite(model.current_interval_remaining_percent)
  const intervalStart = timestamp(model.start_time)
  const intervalEnd = timestamp(model.end_time)
  const intervalRemainsTime = finite(model.remains_time)

  let intervalUsedPercent: number | undefined
  if (intervalRemainingPercent !== undefined) {
    intervalUsedPercent = clampPercent(100 - intervalRemainingPercent)
  } else if (intervalTotal !== undefined && intervalTotal > 0 && intervalUsage !== undefined) {
    const used = isTokenPlan ? Math.max(0, intervalTotal - intervalUsage) : intervalUsage
    intervalUsedPercent = clampPercent((used / intervalTotal) * 100)
  }

  if (intervalUsedPercent !== undefined) {
    const durationMs = (intervalStart !== undefined && intervalEnd !== undefined && intervalEnd > intervalStart)
      ? intervalEnd - intervalStart
      : (intervalRemainsTime !== undefined && intervalRemainsTime > 0 ? intervalRemainsTime : 5 * HOUR_MS)
    windows.push({
      kind: 'session',
      usedPercent: intervalUsedPercent,
      durationMs,
      ...intervalEnd === undefined ? {} : { resetsAt: intervalEnd },
      ...intervalTotal !== undefined && intervalUsage !== undefined ? { used: intervalUsage, limit: intervalTotal } : {},
    })
  }

  // 2. Weekly window (if active and supported)
  const weeklyStatus = finite(model.current_weekly_status)
  if (weeklyStatus !== WINDOW_STATUS_INACTIVE) {
    const weeklyTotal = finite(model.current_weekly_total_count)
    const weeklyUsage = finite(model.current_weekly_usage_count)
    const weeklyRemainingPercent = finite(model.current_weekly_remaining_percent)
    const weeklyStart = timestamp(model.weekly_start_time)
    const weeklyEnd = timestamp(model.weekly_end_time)
    const weeklyRemainsTime = finite(model.weekly_remains_time)

    let weeklyUsedPercent: number | undefined
    if (weeklyRemainingPercent !== undefined) {
      weeklyUsedPercent = clampPercent(100 - weeklyRemainingPercent)
    } else if (weeklyTotal !== undefined && weeklyTotal > 0 && weeklyUsage !== undefined) {
      const used = isTokenPlan ? Math.max(0, weeklyTotal - weeklyUsage) : weeklyUsage
      weeklyUsedPercent = clampPercent((used / weeklyTotal) * 100)
    }

    if (weeklyUsedPercent !== undefined) {
      const durationMs = (weeklyStart !== undefined && weeklyEnd !== undefined && weeklyEnd > weeklyStart)
        ? weeklyEnd - weeklyStart
        : (weeklyRemainsTime !== undefined && weeklyRemainsTime > 0 ? weeklyRemainsTime : 7 * DAY_MS)
      windows.push({
        kind: 'weekly',
        usedPercent: weeklyUsedPercent,
        durationMs,
        ...weeklyEnd === undefined ? {} : { resetsAt: weeklyEnd },
        ...weeklyTotal !== undefined && weeklyUsage !== undefined ? { used: weeklyUsage, limit: weeklyTotal } : {},
      })
    }
  }

  if (windows.length === 0) throw new Error('MiniMax usage data could not be parsed')
  return { supported: true, windows }
}

export const minimax: KeyProvider = {
  id: 'minimax',
  name: 'MiniMax',
  async fetchUsage(key, fetchFn, signal): Promise<ProviderUsage> {
    let lastError: Error | undefined
    for (const domain of DOMAINS) {
      // Try token_plan first, fallback to coding_plan
      for (const [url, isToken] of [[domain.token, true], [domain.coding, false]] as const) {
        try {
          const payload = await bearerJson('MiniMax', url, key, fetchFn, signal)
          return parseMiniMaxUsage(payload, isToken)
        } catch (error) {
          if (error instanceof KeyRejectedError) throw error
          lastError = error instanceof Error ? error : new Error(String(error))
        }
      }
    }
    throw lastError ?? new Error('MiniMax returned no usable quota data')
  },
}
