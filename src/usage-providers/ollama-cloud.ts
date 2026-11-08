/** Ollama Cloud usage from `ollama.com/api/balance`, with the plan from `/api/me`. */
import { monthBefore } from '../providers/copilot.js'
import type { ProviderUsage, UsageWindow } from '../providers/common.js'
import { bearerJson, clampPercent, finite, isRecord, timestamp } from './common.js'
import type { KeyProvider } from './common.js'

const BALANCE_URL = 'https://ollama.com/api/balance'
const ME_URL = 'https://ollama.com/api/me'

export function parseOllamaUsage(payload: unknown): UsageWindow[] {
  const included = isRecord(payload) && isRecord(payload.included) ? payload.included : {}
  const windows: UsageWindow[] = []
  const allowance = finite(included.allowance_usd)
  const balance = finite(included.balance_usd)
  if (allowance !== undefined && allowance > 0 && balance !== undefined) {
    const resetsAt = timestamp(isRecord(included.period) ? included.period.until : undefined)
    windows.push({
      kind: 'other', usedPercent: clampPercent((allowance - balance) / allowance * 100),
      ...resetsAt === undefined ? {} : { resetsAt, durationMs: monthBefore(resetsAt) },
    })
  }
  for (const [name, kind] of [['session', 'session'], ['weekly', 'weekly']] as const) {
    const limit = included[name]
    if (!isRecord(limit)) continue
    const remaining = finite(limit.remaining_percent)
    if (remaining === undefined) continue
    const resetsAt = timestamp(limit.resets_at)
    windows.push({ kind, usedPercent: clampPercent(100 - remaining), ...resetsAt === undefined ? {} : { resetsAt } })
  }
  return windows
}

export const ollamaCloud: KeyProvider = {
  id: 'ollama-cloud',
  name: 'Ollama Cloud',
  async fetchUsage(key, fetchFn, signal): Promise<ProviderUsage> {
    const windows = parseOllamaUsage(await bearerJson('Ollama Cloud', BALANCE_URL, key, fetchFn, signal))
    if (windows.length === 0) throw new Error('Ollama Cloud usage data could not be parsed')
    // The plan name is optional: a failure here drops the label, not the reading.
    const plan = await bearerJson('Ollama Cloud', ME_URL, key, fetchFn, signal, 'POST')
      .then(body => isRecord(body) && typeof body.Plan === 'string' && body.Plan !== '' ? body.Plan : undefined, () => undefined)
    return { supported: true, windows, ...plan === undefined ? {} : { plan } }
  },
}
