/**
 * Composer usage gauge and its popover. Rendered under the composer
 * (`conversation.composer.dock`) once a conversation exists, and in the
 * New Session row (`conversation.hero.options`) before the first prompt.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { UsageProviderId as ProviderId } from './rpc.js'
import { isMetered, isUsageProviderId, USAGE_PROVIDERS, shortName } from './rpc.js'
import { activeAccountKey, splitAccounts, usageKey } from './store.js'
import type { StoreSnapshot } from './store.js'
import { Icon, Minis, tf } from './meter.js'
import type { T } from './meter.js'
import { Account } from './ProviderCard.js'
import { useNow } from './hooks.js'
import { usePrefs, useStore } from './context.js'
import type { SurfaceInjected } from './context.js'
import type { UsagePreferencesView } from './prefs.js'

/** The session's model selection, as `modelDirectories` publishes it. */
export interface CurrentModelSource {
  getSnapshot(): { current: { provider: string; model: string } | null }
  subscribe(listener: () => void): () => void
}

export interface GaugeInjected extends SurfaceInjected {
  sessionId: string
  /** Undefined when the model-selection service is not mounted. */
  currentModel: CurrentModelSource | undefined
}

const noSubscribe = (): (() => void) => () => undefined

/** Select the provider string itself, so the snapshot compares by value. */
function useCurrentProvider(source: CurrentModelSource | undefined): string | undefined {
  return useSyncExternalStore(source?.subscribe ?? noSubscribe, () => source?.getSnapshot().current?.provider)
}

/** A provider the composer can show: signed in and reporting usage. */
const showable = (snapshot: StoreSnapshot, id: ProviderId): boolean =>
  isMetered(snapshot.status, id) && (snapshot.status?.providers[id]?.accounts.length ?? 0) > 0

/** Providers the gauge shows: the current model's provider first, then the pinned ones. */
export function gaugeProviders(prefs: UsagePreferencesView, current: string | undefined, snapshot: StoreSnapshot): ProviderId[] {
  if (snapshot.status === undefined) return []
  const ids = new Set<ProviderId>(isUsageProviderId(current) ? [current, ...prefs.pinned] : prefs.pinned)
  return [...ids].filter(id => showable(snapshot, id))
}

/** Every provider the popover can list: the shown ones first, then the rest in page order. */
export function popoverProviders(shown: readonly ProviderId[], snapshot: StoreSnapshot): { shown: ProviderId[]; others: ProviderId[] } {
  return { shown: [...shown], others: USAGE_PROVIDERS.filter(id => !shown.includes(id) && showable(snapshot, id)) }
}

function windowsOf(snapshot: StoreSnapshot, provider: ProviderId) {
  const key = activeAccountKey(snapshot.status?.providers[provider])
  if (key === undefined) return undefined
  const entry = snapshot.usage.get(usageKey(provider, key))
  return entry?.kind === 'ready' ? entry.usage.windows : undefined
}

export type GaugeProps = Partial<GaugeInjected>

export function Gauge(props: GaugeProps) {
  const { store, prefs, rpc, t, sessionId } = props
  if (store === undefined || prefs === undefined || rpc === undefined || t === undefined || sessionId === undefined) return null
  return <GaugeBody {...props} store={store} prefs={prefs} rpc={rpc} t={t} sessionId={sessionId} currentModel={props.currentModel} />
}

function GaugeBody({ store, prefs, t, sessionId, currentModel, openSettings }: GaugeInjected) {
  const snapshot = useStore(store)
  const prefView = usePrefs(prefs)
  const current = useCurrentProvider(currentModel)
  const now = useNow(30_000)
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)

  useEffect(() => { store.focusSession(sessionId) }, [store, sessionId])

  if (!prefView.composer || snapshot.status === undefined) return null
  const shown = gaugeProviders(prefView, current, snapshot)
  // Nothing to show and nothing to open: no subscription reports usage.
  if (shown.length === 0 && popoverProviders(shown, snapshot).others.length === 0) return null

  const toggle = (): void => {
    setOpen(value => {
      // Opening re-reads anything older than a minute; the Host enforces that bound.
      if (!value) void store.refreshUsage('open')
      return !value
    })
  }

  return (
    <span className="dsm-gauge-slot">
      <button ref={anchor} type="button" className="dsm-gauge" aria-expanded={open} aria-haspopup="dialog" aria-label={t('usageLabel')}
        title={shown.length === 0 ? t('usageLabel') : undefined} onClick={toggle}>
        {shown.length === 0 ? <Icon name="meter" /> : shown.map(provider => (
          <span key={provider} className="dsm-gp">
            <span className="dsm-gp-name">{shortName(snapshot.status, provider)}</span>
            <Minis t={t} windows={windowsOf(snapshot, provider)} display={prefView.display} now={now} />
          </span>
        ))}
      </button>
      {open ? createPortal(
        <Popover t={t} store={store} prefs={prefs} snapshot={snapshot} prefView={prefView} shown={shown} now={now}
          anchor={anchor} onClose={() => { setOpen(false); anchor.current?.focus() }}
          {...openSettings === undefined ? {} : { onOpenSettings: () => { setOpen(false); openSettings() } }} />,
        document.body,
      ) : null}
    </span>
  )
}

function Popover({ t, store, prefs, snapshot, prefView, shown, now, anchor, onClose, onOpenSettings }: {
  t: T; store: SurfaceInjected['store']; prefs: SurfaceInjected['prefs']; snapshot: StoreSnapshot; prefView: UsagePreferencesView
  shown: ProviderId[]; now: number; anchor: React.RefObject<HTMLButtonElement | null>; onClose: () => void; onOpenSettings?: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | undefined>()
  const [openSections, setOpenSections] = useState(() => new Set<ProviderId>(shown))
  const [othersOpen, setOthersOpen] = useState(false)
  const [openMore, setOpenMore] = useState(() => new Set<ProviderId>())
  const [manualAt, setManualAt] = useState<number | undefined>()

  // Above the anchor like the host's stat dialogs; below it when there is no room (the New Session row).
  useLayoutEffect(() => {
    const place = (): void => {
      const a = anchor.current?.getBoundingClientRect()
      const p = panel.current?.getBoundingClientRect()
      if (a === undefined || p === undefined) return
      const left = Math.min(Math.max(8, a.left + a.width / 2 - p.width / 2), window.innerWidth - p.width - 8)
      const above = a.top - p.height - 8
      setPosition({ left, top: above >= 8 ? above : a.bottom + 8 })
    }
    place()
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('resize', place) }
  }, [anchor, openSections, openMore, othersOpen, snapshot])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    const onPointer = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (panel.current?.contains(target) === true || anchor.current?.contains(target) === true) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer, true)
    }
  }, [anchor, onClose])

  const { others } = popoverProviders(shown, snapshot)
  const refreshing = snapshot.refreshing.size > 0
  const cooling = manualAt !== undefined && now - manualAt < 30_000
  const toggleIn = (set: Set<ProviderId>, id: ProviderId): Set<ProviderId> => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  }

  const renderSection = (provider: ProviderId) => {
    const status = snapshot.status?.providers[provider]
    if (status === undefined) return null
    const split = splitAccounts(status)
    if (split === undefined) return null
    const { active, rest } = split
    const sectionOpen = openSections.has(provider)
    const pinned = prefView.pinned.includes(provider)
    const pinLabel = pinned ? t('unpin') : t('pin')
    return (
      <div key={provider} className="dsm-psec">
        <div className="dsm-psec-head">
          <button type="button" className="dsm-fold" aria-expanded={sectionOpen} onClick={() => { setOpenSections(s => toggleIn(s, provider)) }}>
            <span className="dsm-fold-name"><Icon name="right" size={12} className="dsm-chev" /><span className="dsm-psec-name">{shortName(snapshot.status, provider)}</span></span>
            {sectionOpen ? <span /> : <Minis t={t} windows={windowsOf(snapshot, provider)} display={prefView.display} now={now} />}
          </button>
          <button type="button" className="dsm-btn dsm-icon dsm-sm dsm-pin" aria-pressed={pinned} title={pinLabel} aria-label={pinLabel}
            onClick={() => { void prefs.togglePinned(provider) }}>
            <Icon name={pinned ? 'pinFilled' : 'pin'} size={12} />
          </button>
        </div>
        {sectionOpen ? (
          <div className="dsm-fold-body">
            <Account t={t} provider={provider} account={active} status={status} snapshot={snapshot} prefs={prefView} now={now} compact />
            {rest.length === 0 ? null : (
              <>
                <button type="button" className="dsm-fold" aria-expanded={openMore.has(provider)} onClick={() => { setOpenMore(s => toggleIn(s, provider)) }}>
                  <span className="dsm-fold-name">
                    <Icon name="right" size={12} className="dsm-chev" />
                    <span>{rest.length === 1 ? rest[0]!.account ?? rest[0]!.key : tf(t, 'moreAccounts', { count: rest.length })}</span>
                  </span>
                  {rest.length === 1 ? <MinisFor t={t} snapshot={snapshot} provider={provider} account={rest[0]!.key} prefs={prefView} now={now} /> : <span />}
                </button>
                {openMore.has(provider) ? (
                  <div className="dsm-fold-body">
                    {rest.map(account => <Account key={account.key} t={t} provider={provider} account={account} status={status} snapshot={snapshot} prefs={prefView} now={now} compact />)}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div ref={panel} className="dsm-pop" role="dialog" aria-label={t('usageLabel')}
      style={position === undefined ? { visibility: 'hidden', left: 0, top: 0 } : { left: position.left, top: position.top }}>
      <div className="dsm-pop-head">
        <b>{t('usage')}</b>
        <button type="button" className={`dsm-btn dsm-icon${refreshing ? ' dsm-spinning' : ''}`} disabled={refreshing || cooling}
          title={cooling ? tf(t, 'refreshedWait', { seconds: Math.ceil((30_000 - (now - (manualAt ?? now))) / 1000) }) : t('refreshNow')}
          aria-label={t('refreshNow')}
          onClick={() => { setManualAt(Date.now()); void store.refreshUsage('manual') }}>
          <Icon name={cooling && !refreshing ? 'check' : 'refresh'} />
        </button>
        {onOpenSettings === undefined ? null : (
          <button type="button" className="dsm-btn dsm-icon" title={t('usageSettings')} aria-label={t('usageSettings')} onClick={onOpenSettings}>
            <Icon name="gear" />
          </button>
        )}
      </div>
      {shown.map(renderSection)}
      {/* With nothing shown (a model without usage), the rest is the whole list, so it needs no fold. */}
      {shown.length === 0 ? others.map(renderSection) : others.length === 0 ? null : (
        <div className="dsm-psec dsm-others">
          <button type="button" className="dsm-fold" aria-expanded={othersOpen} onClick={() => { setOthersOpen(value => !value) }}>
            <span className="dsm-fold-name"><Icon name="right" size={12} className="dsm-chev" /><span className="dsm-psec-name">{tf(t, 'otherProviders', { count: others.length })}</span></span>
            <span />
          </button>
          {othersOpen ? others.map(renderSection) : null}
        </div>
      )}
    </div>
  )
}

function MinisFor({ t, snapshot, provider, account, prefs, now }: { t: T; snapshot: StoreSnapshot; provider: ProviderId; account: string; prefs: UsagePreferencesView; now: number }) {
  const entry = snapshot.usage.get(usageKey(provider, account))
  return <Minis t={t} windows={entry?.kind === 'ready' ? entry.usage.windows : undefined} display={prefs.display} now={now} />
}
