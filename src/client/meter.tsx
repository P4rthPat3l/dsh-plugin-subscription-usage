/**
 * Shared pieces of every usage surface: icons, the pace bar, one window row,
 * and the compact mini meter. All copy and colors route through the locale
 * `t` and `--dsw-alias-*` tokens.
 */
import type { ReactNode } from 'react'
import type { UsageWindow } from '../providers/common.js'
import { displayPercent, pace } from '../usage/pace.js'
import type { Pace, QuotaDisplay } from '../usage/pace.js'
import { format } from './locales.js'
import type { SubscriptionsKey } from './locales.js'

export type T = (key: SubscriptionsKey) => string

/** Translate with placeholders. */
export function tf(t: T, key: SubscriptionsKey, params: Record<string, string | number>): string {
  return format(t(key), params)
}

const PATHS = {
  refresh: <><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" /><path d="M13.5 2.5v3h-3" /></>,
  alert: <><path d="M8 1.8 15 14H1z" /><path d="M8 6.3v3.4M8 11.8v.01" /></>,
  check: <path d="m3.5 8.3 3 3 6-6.6" />,
  star: <path d="m8 2 1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3 4.3 13.3l.8-4.1L2 6.3l4.2-.5z" fill="currentColor" />,
  bolt: <path d="M9 1.8 3.5 9H8l-1 5.2L12.5 7H8z" fill="currentColor" stroke="none" />,
  pin: <><path d="M6 2.5h4l-.6 4 2.1 2.2v1H4.5v-1l2.1-2.2z" /><path d="M8 9.7v3.8" /></>,
  pinFilled: <><path d="M6 2.5h4l-.6 4 2.1 2.2v1H4.5v-1l2.1-2.2z" fill="currentColor" /><path d="M8 9.7v3.8" /></>,
  gear: <><circle cx="8" cy="8" r="2.2" /><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" /></>,
  ext: <path d="M9 3h4v4M13 3 7.5 8.5M12 9.5V13H3V4h3.5" />,
  copy: <><rect x="5" y="5" width="8.5" height="8.5" rx="1.5" /><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" /></>,
  x: <path d="m4 4 8 8M12 4l-8 8" />,
  right: <path d="m6 4 4 4-4 4" />,
  down: <path d="m5 6.5 3 3 3-3" />,
  meter: <><path d="M2.5 11a5.5 5.5 0 0 1 11 0" /><path d="m8 11 2.6-3.2" /></>,
  sparkle: <path d="M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6z" fill="currentColor" stroke="none" />,
} as const

export type IconName = keyof typeof PATHS

/** One 16-unit stroke icon. */
export function Icon({ name, size = 14, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', display: 'block' }}>
      {PATHS[name]}
    </svg>
  )
}

const H = 3_600_000
const D = 24 * H

/** "3h 6m", "2d 12h", "42m". */
export function shortDuration(ms: number): string {
  // Round once, then split, so 4h 59.6m reads 5h rather than 4h 60m.
  const total = Math.max(1, Math.round(ms / 60_000))
  const days = Math.floor(total / 1440)
  const hours = Math.floor((total % 1440) / 60)
  const minutes = total % 60
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  return `${Math.max(1, minutes)}m`
}

/**
 * A short point in time in the browser's locale: "6:04 PM" today, "Wed" within
 * the week, "12 Nov" beyond. The day alone keeps the time column narrow; the
 * tooltip carries the exact reset time.
 */
export function clockTime(at: number, now: number): string {
  const date = new Date(at)
  if (date.toDateString() === new Date(now).toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  if (Math.abs(at - now) < 6 * D) return date.toLocaleDateString(undefined, { weekday: 'short' })
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Weekday and time, for tooltips. */
export function fullTime(at: number): string {
  return new Date(at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

/** The window's length as "5h", "7d" or "30d", rounded to a whole unit; undefined when unknown. */
export function lengthLabel(durationMs: number | undefined): string | undefined {
  if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs <= 0) return undefined
  const hours = Math.round(durationMs / 3_600_000)
  if (hours < 1) return `${Math.max(1, Math.round(durationMs / 60_000))}m`
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`
}

/** "5h", "7d", "30d": the window's own length, else its kind, else "limit". */
export function kindLabel(t: T, kind: UsageWindow['kind'], durationMs?: number): string {
  const length = lengthLabel(durationMs)
  if (length !== undefined) return length
  return kind === 'session' ? t('window5h') : kind === 'weekly' ? t('window7d') : t('windowOther')
}

/** The length label, with a model scope when the window has one. A per-model quota is named by its scope alone. */
export function windowLabel(t: T, window: UsageWindow): string {
  if (window.scope === undefined) return kindLabel(t, window.kind, window.durationMs)
  return window.kind === 'other' ? window.scope : `${kindLabel(t, window.kind, window.durationMs)} ${window.scope}`
}

/** A window as shown, with the models it stands for when several share one quota. */
export type ShownWindow = UsageWindow & { models?: string[] }

const FAMILY_NAMES: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', gpt: 'GPT' }

/** "claude-opus-4-6-thinking" becomes "Claude"; "tab_flash_lite" becomes "Tab". */
function modelFamily(id: string): string {
  const head = id.split(/[-_]/)[0] ?? id
  return FAMILY_NAMES[head.toLowerCase()] ?? head.charAt(0).toUpperCase() + head.slice(1)
}

/**
 * Per-model windows that report the same usage and reset share one quota pool
 * (Antigravity reports one window per model), so they merge into one row named
 * by model family. A per-model window at 0% with no reset carries no information
 * and is hidden. Unscoped windows pass through unchanged.
 */
export function shownWindows(windows: readonly UsageWindow[] | undefined): ShownWindow[] {
  const out: ShownWindow[] = []
  const groups = new Map<string, { window: UsageWindow; models: string[] }>()
  for (const window of windows ?? []) {
    if (window.scope === undefined || window.kind !== 'other') {
      out.push(window)
      continue
    }
    if (window.resetsAt === undefined && window.usedPercent === 0) continue
    const minute = window.resetsAt === undefined ? '' : String(Math.round(window.resetsAt / 60_000))
    const key = `${Math.round(window.usedPercent)}/${minute}`
    const group = groups.get(key)
    if (group === undefined) {
      const entry = { window, models: [window.scope] }
      groups.set(key, entry)
    } else {
      group.models.push(window.scope)
    }
  }
  for (const { window, models } of groups.values()) {
    const families = [...new Set(models.map(modelFamily))]
    out.push({ ...window, scope: families.join(' · '), models })
  }
  return out
}

/**
 * What compact surfaces show: unscoped windows, session first. A provider that
 * only reports per-model windows (Antigravity) shows its two most used instead.
 */
export function primaryWindows(windows: readonly UsageWindow[] | undefined): ShownWindow[] {
  const order = { session: 0, weekly: 1, other: 2 } as const
  const all = shownWindows(windows)
  const unscoped = all.filter(w => w.scope === undefined).sort((a, b) => order[a.kind] - order[b.kind])
  if (unscoped.length > 0) return unscoped
  return [...all].sort((a, b) => b.usedPercent - a.usedPercent).slice(0, 2)
}

/** The pace bar: fill is quota, hatch is the forecast, color is the pace state. Drains in `left` mode. */
export function Bar({ window, p, display, height = 6 }: { window: UsageWindow; p: Pace; display: QuotaDisplay; height?: number }) {
  const used = p.state === 'unknown' ? 0 : p.usedPercent
  const left = display === 'left'
  const fill = left ? 100 - used : used
  let projection: ReactNode = null
  if (p.state === 'over' || p.state === 'tight') {
    const end = Math.min(100, p.projectedPercent)
    projection = <span className="dsm-proj" style={left ? { left: `${100 - end}%`, width: `${end - used}%` } : { left: `${used}%`, width: `${end - used}%` }} />
  }
  return (
    <span className={`dsm-bar dsm-${p.state}`} style={{ height }} role="meter" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={displayPercent(window, display) ?? 0}>
      <span className="dsm-fill" style={{ width: `${fill}%` }} />
      {projection}
    </span>
  )
}

function valueText(window: UsageWindow, display: QuotaDisplay): string {
  const value = displayPercent(window, display)
  return value === undefined ? '–' : `${value}%`
}

/** The time column: when this changes next. */
function timeText(t: T, window: UsageWindow, p: Pace, now: number): string {
  if (p.state === 'out' && window.resetsAt !== undefined) return tf(t, 'backAt', { time: clockTime(window.resetsAt, now) })
  if (p.state === 'over') return tf(t, 'emptyAt', { time: clockTime(p.emptyAt, now) })
  return window.resetsAt === undefined ? '' : tf(t, 'resetsIn', { time: shortDuration(Math.max(0, window.resetsAt - now)) })
}

function tooltip(t: T, window: ShownWindow, p: Pace, now: number): string {
  if (p.state === 'unknown') return t('notReported')
  const used = Math.round(p.usedPercent)
  const lines = [...window.models ?? [], tf(t, 'tipUsedLeft', { used, left: 100 - used })]
  if (window.used !== undefined && window.limit !== undefined) {
    lines.push(tf(t, 'tipCount', { used: Math.round(window.used), limit: window.limit }))
  }
  if ((p.state === 'calm' || p.state === 'tight' || p.state === 'over') && p.elapsed !== undefined) {
    lines.push(tf(t, 'tipElapsed', { percent: Math.round(p.elapsed * 100) }))
  }
  if (p.state === 'tight') lines.push(tf(t, 'tipPace', { percent: Math.round(p.projectedPercent) }))
  if (p.state === 'over') lines.push(tf(t, 'emptyAt', { time: fullTime(p.emptyAt) }))
  if (window.resetsAt !== undefined) lines.push(tf(t, 'tipResets', { time: fullTime(window.resetsAt) }))
  return lines.join('\n')
}

/** One window on the shared grid: label | bar | value | time. */
export function WindowRow({ t, window, display, now }: { t: T; window: ShownWindow; display: QuotaDisplay; now: number }) {
  const p = pace(window, now)
  const tip = tooltip(t, window, p, now)
  // The row is `display: contents` so its cells sit on the shared grid; each cell carries the tooltip.
  return (
    <div className={`dsm-w dsm-${p.state}`}>
      <span className="dsm-wl" title={window.scope === undefined ? tip : `${windowLabel(t, window)}\n${tip}`}>{windowLabel(t, window)}</span>
      <span title={tip}><Bar window={window} p={p} display={display} /></span>
      <span className="dsm-wv" title={tip}>{valueText(window, display)}</span>
      <span className="dsm-wt" title={tip}>{timeText(t, window, p, now)}</span>
    </div>
  )
}

/** Label, small bar and value, for summary rows and the gauge. */
export function Mini({ t, window, display, now }: { t: T; window: ShownWindow; display: QuotaDisplay; now: number }) {
  const p = pace(window, now)
  return (
    <span className={`dsm-mini dsm-${p.state}`} title={window.scope === undefined ? tooltip(t, window, p, now) : `${window.scope}\n${tooltip(t, window, p, now)}`}>
      <i>{window.kind === 'other' && window.scope !== undefined ? window.scope : kindLabel(t, window.kind, window.durationMs)}</i>
      <Bar window={window} p={p} display={display} height={4} />
      <b>{valueText(window, display)}</b>
    </span>
  )
}

/** The mini meters of an account's unscoped windows. */
export function Minis({ t, windows, display, now }: { t: T; windows: readonly UsageWindow[] | undefined; display: QuotaDisplay; now: number }) {
  const shown = primaryWindows(windows)
  if (shown.length === 0) return null
  return <span className="dsm-minis">{shown.map((w, i) => <Mini key={i} t={t} window={w} display={display} now={now} />)}</span>
}
