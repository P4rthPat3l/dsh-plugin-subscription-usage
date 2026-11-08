/**
 * Frame-wide pace notice in `shell.overlay`: one line when a window will
 * empty before it resets, or has run out. Each crossing shows once and stays
 * dismissed for that window, keyed by provider, account, window and reset.
 */
import { useEffect, useMemo, useState } from 'react'
import type { UsageWindow } from '../providers/common.js'
import { pace } from '../usage/pace.js'
import { isMetered, USAGE_PROVIDERS, shortName } from './rpc.js'
import type { UsageProviderId as ProviderId } from './rpc.js'
import { usageKey } from './store.js'
import type { StoreSnapshot } from './store.js'
import { clockTime, Icon, tf, windowLabel } from './meter.js'
import type { T } from './meter.js'
import { useNow } from './hooks.js'
import { usePrefs, useStore } from './context.js'
import type { SurfaceInjected } from './context.js'

const DISMISSED_KEY = 'dsh-plugin-subscription-usage.dismissed-notices'

export interface PaceNotice {
  id: string
  tone: 'warn' | 'error'
  text: string
}

/** Dismissals survive reloads; one entry per window crossing. */
function readDismissed(): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]')
    return new Set(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

/**
 * The most urgent notice across the serving accounts, or undefined.
 * Only serving or default accounts warn; an idle account's pace is not the user's problem yet.
 */
export function currentNotice(t: T, snapshot: StoreSnapshot, now: number, dismissed: ReadonlySet<string>): PaceNotice | undefined {
  const candidates: (PaceNotice & { rank: number })[] = []
  for (const provider of USAGE_PROVIDERS) {
    if (!isMetered(snapshot.status, provider)) continue
    const status = snapshot.status?.providers[provider]
    if (status === undefined) continue
    for (const account of status.accounts) {
      if (account.key !== status.servingAccount && !account.isDefault) continue
      const entry = snapshot.usage.get(usageKey(provider, account.key))
      if (entry?.kind !== 'ready') continue
      for (const window of entry.usage.windows ?? []) {
        const notice = noticeFor(t, shortName(snapshot.status, provider), provider, account.key, window, now)
        if (notice !== undefined && !dismissed.has(notice.id)) candidates.push(notice)
      }
    }
  }
  candidates.sort((a, b) => a.rank - b.rank)
  const top = candidates[0]
  return top === undefined ? undefined : { id: top.id, tone: top.tone, text: top.text }
}

function noticeFor(t: T, name: string, provider: ProviderId, account: string, window: UsageWindow, now: number): (PaceNotice & { rank: number }) | undefined {
  const p = pace(window, now)
  const id = `${provider}/${account}/${window.kind}/${window.scope ?? ''}/${window.resetsAt ?? ''}`
  const label = windowLabel(t, window)
  if (p.state === 'out') return { id: `${id}/out`, tone: 'error', rank: 0, text: tf(t, 'noticeOut', { provider: name, window: label }) }
  if (p.state === 'over') {
    return { id: `${id}/over`, tone: 'warn', rank: p.emptyAt - now, text: tf(t, 'noticeEmpty', { provider: name, window: label, time: clockTime(p.emptyAt, now) }) }
  }
  return undefined
}

export type NoticeProps = Partial<SurfaceInjected>

export function Notice(props: NoticeProps) {
  const { store, prefs, t } = props
  if (store === undefined || prefs === undefined || t === undefined) return null
  return <NoticeBody store={store} prefs={prefs} t={t} />
}

function NoticeBody({ store, prefs, t }: Pick<SurfaceInjected, 'store' | 'prefs' | 't'>) {
  const snapshot = useStore(store)
  const view = usePrefs(prefs)
  const now = useNow(60_000)
  const [dismissed, setDismissed] = useState(readDismissed)
  const notice = useMemo(() => view.paceWarnings ? currentNotice(t, snapshot, now, dismissed) : undefined, [view.paceWarnings, t, snapshot, now, dismissed])

  useEffect(() => {
    const onStorage = (event: StorageEvent): void => { if (event.key === DISMISSED_KEY) setDismissed(readDismissed()) }
    window.addEventListener('storage', onStorage)
    return () => { window.removeEventListener('storage', onStorage) }
  }, [])

  if (notice === undefined) return null
  const dismiss = (): void => {
    const next = new Set(dismissed)
    next.add(notice.id)
    // Old windows never return; keep the list short.
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next].slice(-50)))
    setDismissed(next)
  }
  return (
    <div className="dsm-notice-host" style={{ pointerEvents: 'auto' }}>
      <div className={`dsm-notice${notice.tone === 'error' ? ' dsm-err' : ''}`} role="status" aria-live="polite">
        <Icon name="alert" />
        <span>{notice.text}</span>
        <button type="button" className="dsm-btn dsm-icon" aria-label={t('dismiss')} title={t('dismiss')} onClick={dismiss}><Icon name="x" /></button>
      </div>
    </div>
  )
}
