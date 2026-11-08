/**
 * The Usage settings page (`settings.section`): one block per signed-in
 * provider that reports usage, plus the display options. Accounts and models
 * stay on the Models page.
 */
import { useState } from 'react'
import { call, KEY_PROVIDERS } from './rpc.js'
import type { KeyProviderId } from './rpc.js'
import { splitAccounts, usageKey } from './store.js'
import type { StoreSnapshot } from './store.js'
import { Account } from './ProviderCard.js'
import { Icon, tf } from './meter.js'
import { useNow } from './hooks.js'
import { usePrefs, useStore } from './context.js'
import type { SurfaceInjected } from './context.js'
import type { UsageProviderId as ProviderId, ProviderStatus } from './rpc.js'
import { isMetered, USAGE_PROVIDERS, shortName } from './rpc.js'

/** The Usage row's icon in the settings nav; the shell passes the edge size. */
export function UsageNavIcon({ size }: { size: number }) {
  return <Icon name="meter" size={size} />
}

export type UsageProps = Partial<SurfaceInjected>

export function Usage(props: UsageProps) {
  const { store, prefs, rpc, t } = props
  if (store === undefined || prefs === undefined || rpc === undefined || t === undefined) return null
  return <UsageBody store={store} prefs={prefs} rpc={rpc} t={t} />
}

function Segmented<V extends string>({ label, value, options, disabled, onChange }: {
  label: string; value: V; options: readonly (readonly [V, string])[]; disabled: boolean; onChange: (value: V) => void
}) {
  return (
    <span className="dsm-seg" role="group" aria-label={label}>
      {options.map(([option, text]) => (
        <button key={option} type="button" aria-pressed={value === option} disabled={disabled} onClick={() => { onChange(option) }}>{text}</button>
      ))}
    </span>
  )
}

function maxManualReady(snapshot: StoreSnapshot, provider: ProviderId, status: ProviderStatus): number | undefined {
  const times = status.accounts.map(a => {
    const entry = snapshot.usage.get(usageKey(provider, a.key))
    return entry?.kind === 'ready' ? entry.usage.manualReadyAt : undefined
  }).filter(at => at !== undefined)
  return times.length === 0 ? undefined : Math.max(...times)
}

function UsageBody({ store, prefs, rpc, t }: Omit<SurfaceInjected, never>) {
  const snapshot = useStore(store)
  const view = usePrefs(prefs)
  const now = useNow(30_000)
  const readOnly = !view.writable
  const providers = USAGE_PROVIDERS.filter(provider => {
    const status = snapshot.status?.providers[provider]
    return status !== undefined && status.accounts.length > 0 && isMetered(snapshot.status, provider)
  })
  return (
    <section className="dsm-footer-block dsm-usage" aria-labelledby="dsm-usage-title" style={{ marginTop: 0, borderTop: 'none', paddingTop: 0 }}>
      <h3 id="dsm-usage-title">{t('usage')}</h3>
      <div className="dsm-row">
        <span className="dsm-grow">{t('showQuotaAs')}</span>
        <Segmented label={t('showQuotaAs')} value={view.display} disabled={readOnly}
          options={[['left', t('displayLeft')], ['used', t('displayUsed')]] as const}
          onChange={display => { void prefs.set({ display }) }} />
      </div>
      <div className="dsm-row">
        <span className="dsm-grow">{t('paceWarnings')}</span>
        <button type="button" role="switch" className="dsm-switch" aria-checked={view.paceWarnings} aria-label={t('paceWarnings')} disabled={readOnly}
          onClick={() => { void prefs.set({ paceWarnings: !view.paceWarnings }) }} />
      </div>
      <div className="dsm-row">
        <span className="dsm-grow">{t('composerUsage')} <span className="dsm-note">{t('composerUsageNote')}</span></span>
        <button type="button" role="switch" className="dsm-switch" aria-checked={view.composer} aria-label={t('composerUsage')} disabled={readOnly}
          onClick={() => { void prefs.set({ composer: !view.composer }) }} />
      </div>
      {providers.length === 0 ? <p className="dsm-muted" style={{ margin: '12px 0 0' }}>{t('usageEmpty')}</p> : null}
      {providers.map(provider => {
        const status = snapshot.status?.providers[provider]
        const split = status === undefined ? undefined : splitAccounts(status)
        if (status === undefined || split === undefined) return null
        const pinned = view.pinned.includes(provider)
        const pinLabel = pinned ? t('unpin') : t('pin')
        const refreshing = status.accounts.some(a => snapshot.refreshing.has(usageKey(provider, a.key)))
        const readyAt = maxManualReady(snapshot, provider, status)
        const cooling = readyAt !== undefined && readyAt > now
        return (
          <div key={provider} className="dsm-usage-block" style={{ borderTop: '.5px solid var(--dsw-alias-border-l1)', padding: '10px 0' }}>
            <div className="dsm-row" style={{ minHeight: 28 }}>
              <span className="dsm-grow" style={{ fontWeight: 500 }}>{shortName(snapshot.status, provider)}</span>
              <button type="button" className="dsm-btn dsm-icon dsm-pin" aria-pressed={pinned} title={pinLabel} aria-label={pinLabel} disabled={readOnly}
                onClick={() => { void prefs.togglePinned(provider) }}>
                <Icon name={pinned ? 'pinFilled' : 'pin'} />
              </button>
              {isKey(provider) ? (
                <button type="button" className="dsm-btn dsm-ghost"
                  onClick={() => { void call(rpc, 'keysRemove', { provider }).then(() => store.refreshStatus()) }}>{t('removeKey')}</button>
              ) : null}
              <button type="button" className={`dsm-btn dsm-icon${refreshing ? ' dsm-spinning' : ''}`} disabled={refreshing || cooling}
                title={cooling ? tf(t, 'refreshedWait', { seconds: Math.ceil((readyAt - now) / 1000) }) : t('refreshUsage')}
                aria-label={tf(t, 'refreshUsageNamed', { name: provider })}
                onClick={() => { void store.refreshUsage('manual', provider) }}>
                <Icon name="refresh" />
              </button>
            </div>
            <Account t={t} provider={provider} account={split.active} status={status} snapshot={snapshot} prefs={view} now={now} compact />
            {split.rest.map(account => <Account key={account.key} t={t} provider={provider} account={account} status={status} snapshot={snapshot} prefs={view} now={now} compact />)}
          </div>
        )
      })}
      <AddProvider t={t} store={store} rpc={rpc} unconfigured={KEY_PROVIDERS.filter(id => snapshot.status?.keyProviders?.find(v => v.id === id)?.configured !== true)} names={snapshot.status?.keyProviders ?? []} />
    </section>
  )
}

const isKey = (provider: ProviderId): provider is KeyProviderId => (KEY_PROVIDERS as readonly string[]).includes(provider)

function AddProvider({ t, store, rpc, unconfigured, names }: {
  t: SurfaceInjected['t']; store: SurfaceInjected['store']; rpc: SurfaceInjected['rpc']
  unconfigured: readonly KeyProviderId[]; names: readonly { id: KeyProviderId; name: string }[]
}) {
  const [picked, setPicked] = useState<KeyProviderId | undefined>()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  if (unconfigured.length === 0) return null
  const save = async (id: KeyProviderId): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      await call(rpc, 'keysSet', { provider: id, key })
      setKey('')
      setPicked(undefined)
      await store.refreshStatus()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }
  const nameOf = (id: KeyProviderId): string => names.find(v => v.id === id)?.name ?? id
  return (
    <div className="dsm-usage-block" style={{ borderTop: '.5px solid var(--dsw-alias-border-l1)', padding: '10px 0' }}>
      <div className="dsm-row" style={{ minHeight: 28 }}>
        <span className="dsm-grow dsm-muted">{t('addProvider')}</span>
        {unconfigured.map(id => (
          <button key={id} type="button" className="dsm-btn" aria-pressed={picked === id} onClick={() => { setPicked(picked === id ? undefined : id); setError(undefined) }}>{nameOf(id)}</button>
        ))}
      </div>
      {picked === undefined ? null : (
        <div className="dsm-panel" style={{ paddingTop: 8 }}>
          <input className="dsm-input" type="password" autoComplete="off" value={key} placeholder={t('apiKey')} aria-label={`${nameOf(picked)} ${t('apiKey')}`}
            onChange={event => { setKey(event.target.value) }} />
          <div className="dsm-panel-foot">
            <span className="dsm-note" role="status" style={{ marginRight: 'auto' }}>{busy ? t('keyChecking') : error ?? t('keyHelp')}</span>
            <button type="button" className="dsm-btn dsm-primary" disabled={busy || key.trim() === ''} onClick={() => { void save(picked) }}>{t('addKey')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
