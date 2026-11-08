/**
 * Pace of one usage window: how much quota is used against how much of the
 * window has elapsed, and whether the current rate empties the window before
 * it resets. Pure, so the Host and the browser bundle share one definition.
 */
import type { UsageWindow } from '../providers/common.js'

/** Below this share of elapsed window a burst says little about the whole window. */
export const MIN_FORECAST_ELAPSED = 0.2
/** Below this usage the projection is noise. */
export const MIN_FORECAST_USED_PERCENT = 3
/** Projected use above this percent turns a window `tight`. */
export const TIGHT_PROJECTED_PERCENT = 85

/** Pace of one window. `calm` and `tight` may carry a projection; `over` always does. */
export type Pace =
  | { state: 'unknown' }
  | { state: 'out'; usedPercent: number }
  | { state: 'calm'; usedPercent: number; elapsed?: number; projectedPercent?: number }
  | { state: 'tight'; usedPercent: number; elapsed: number; projectedPercent: number }
  | { state: 'over'; usedPercent: number; elapsed: number; projectedPercent: number; emptyAt: number }

/** The states a meter colors by. */
export type PaceState = Pace['state']

/**
 * Compute the pace of one window at `now`.
 * @param window - the provider-reported window.
 * @param now - epoch milliseconds.
 * @returns the pace; `elapsed` is the share of the window passed, 0 to 1.
 */
export function pace(window: UsageWindow, now: number): Pace {
  const used = window.usedPercent
  if (!Number.isFinite(used)) return { state: 'unknown' }
  const usedPercent = Math.max(0, Math.min(100, used))
  if (usedPercent >= 100) return { state: 'out', usedPercent }
  const { durationMs, resetsAt } = window
  if (durationMs === undefined || resetsAt === undefined || !(durationMs > 0) || !Number.isFinite(resetsAt)) {
    return { state: 'calm', usedPercent }
  }
  const elapsed = Math.min(1, Math.max(0, 1 - (resetsAt - now) / durationMs))
  if (elapsed < MIN_FORECAST_ELAPSED || usedPercent < MIN_FORECAST_USED_PERCENT) {
    return { state: 'calm', usedPercent, elapsed }
  }
  const projectedPercent = usedPercent / elapsed
  if (projectedPercent > 100) {
    const ratePerMs = usedPercent / (elapsed * durationMs)
    return { state: 'over', usedPercent, elapsed, projectedPercent, emptyAt: now + (100 - usedPercent) / ratePerMs }
  }
  if (projectedPercent > TIGHT_PROJECTED_PERCENT) return { state: 'tight', usedPercent, elapsed, projectedPercent }
  return { state: 'calm', usedPercent, elapsed, projectedPercent }
}

/** Whether quota reads as remaining or as consumed. Display only; routing reads `usedPercent`. */
export type QuotaDisplay = 'left' | 'used'

/**
 * The percent a meter shows.
 * @param window - the window to show.
 * @param display - left or used.
 * @returns an integer percent, or undefined when the provider reported none.
 */
export function displayPercent(window: UsageWindow, display: QuotaDisplay): number | undefined {
  if (!Number.isFinite(window.usedPercent)) return undefined
  const used = Math.round(Math.max(0, Math.min(100, window.usedPercent)))
  return display === 'left' ? 100 - used : used
}
