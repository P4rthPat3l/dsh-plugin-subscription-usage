/**
 * Plan-usage windows carried on ordinary model responses. Reading them after
 * every reply keeps meters current without calling the usage endpoints.
 *
 * Shapes observed on 2026-11-08 (docs/features/FEAT-001, ASM-002):
 * - Codex: `x-codex-{primary,secondary}-used-percent` (0..100),
 *   `-window-minutes`, `-reset-at` (epoch seconds). Sent on 2xx and 429.
 * - Claude: `anthropic-ratelimit-unified-{5h,7d}-utilization` (0..1),
 *   `-reset` (epoch seconds).
 * Only these fields are read; nothing else from the response is kept.
 */
import type { UsageWindow } from '../providers/common.js'

/** Providers whose replies carry usage headers. */
export type LiveUsageProvider = 'codex' | 'claude'

const MINUTE_MS = 60_000
const FIVE_HOURS_MS = 5 * 60 * MINUTE_MS
const SEVEN_DAYS_MS = 7 * 24 * 60 * MINUTE_MS

/** Read a finite number header, or undefined. */
function numberHeader(headers: Headers, name: string): number | undefined {
  const raw = headers.get(name)
  if (raw === null || raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

/** Epoch-seconds header to epoch milliseconds. */
function epochHeader(headers: Headers, name: string): number | undefined {
  const seconds = numberHeader(headers, name)
  return seconds === undefined || seconds <= 0 ? undefined : seconds * 1000
}

/** Kind from a window length, matching the endpoint parsers' session/weekly split. */
function kindOf(durationMs: number | undefined, fallback: UsageWindow['kind']): UsageWindow['kind'] {
  if (durationMs === undefined) return fallback
  if (durationMs <= 24 * 60 * MINUTE_MS) return 'session'
  if (durationMs <= 8 * 24 * 60 * MINUTE_MS) return 'weekly'
  return 'other'
}

function codexWindow(headers: Headers, slot: 'primary' | 'secondary'): UsageWindow | undefined {
  const usedPercent = numberHeader(headers, `x-codex-${slot}-used-percent`)
  if (usedPercent === undefined) return undefined
  const minutes = numberHeader(headers, `x-codex-${slot}-window-minutes`)
  const durationMs = minutes !== undefined && minutes > 0 ? minutes * MINUTE_MS : undefined
  const resetsAt = epochHeader(headers, `x-codex-${slot}-reset-at`)
  return {
    kind: kindOf(durationMs, slot === 'primary' ? 'session' : 'weekly'),
    usedPercent,
    ...durationMs === undefined ? {} : { durationMs },
    ...resetsAt === undefined ? {} : { resetsAt },
  }
}

function claudeWindow(headers: Headers, slot: '5h' | '7d'): UsageWindow | undefined {
  const utilization = numberHeader(headers, `anthropic-ratelimit-unified-${slot}-utilization`)
  if (utilization === undefined) return undefined
  const resetsAt = epochHeader(headers, `anthropic-ratelimit-unified-${slot}-reset`)
  return {
    kind: slot === '5h' ? 'session' : 'weekly',
    usedPercent: utilization * 100,
    durationMs: slot === '5h' ? FIVE_HOURS_MS : SEVEN_DAYS_MS,
    ...resetsAt === undefined ? {} : { resetsAt },
  }
}

/**
 * Parse the usage windows a reply carries.
 * @param provider - the provider that answered.
 * @param headers - the reply headers.
 * @returns the windows in session-then-weekly order; empty when the reply carries none.
 */
export function usageWindowsFromHeaders(provider: LiveUsageProvider, headers: Headers): UsageWindow[] {
  const windows = provider === 'codex'
    ? [codexWindow(headers, 'primary'), codexWindow(headers, 'secondary')]
    : [claudeWindow(headers, '5h'), claudeWindow(headers, '7d')]
  return windows.filter(window => window !== undefined)
}
