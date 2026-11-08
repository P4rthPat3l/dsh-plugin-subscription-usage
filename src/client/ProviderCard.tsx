/**
 * The body of one subscription row on the Models page, rendered in the
 * `settings.models.provider-card` slot. The active account shows in full;
 * other accounts fold behind one summary row; Manage opens Accounts, Models
 * and Tools inline.
 */
import { useEffect, useRef, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the Models page's SlotMap merge (`settings.models.provider-card`).
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { AccountStatus, ProviderId, UsageProviderId, ProviderModelRow, ProviderPreferences, ProviderSettingsValue, ProviderStatus } from './rpc.js'
import { call, isMetered, isProviderId } from './rpc.js'
import { splitAccounts, usageKey } from './store.js'
import type { StoreSnapshot } from './store.js'
import { Icon, shortDuration, shownWindows, tf, WindowRow } from './meter.js'
import type { T } from './meter.js'
import { useNow } from './hooks.js'
import { usePrefs, useStore } from './context.js'
import type { SurfaceInjected } from './context.js'
import type { UsagePreferencesView } from './prefs.js'

export type ProviderCardProps = PropsRuntime<'settings.models.provider-card'> & Partial<SurfaceInjected>

/** How often a busy sign-in re-reads status until the account lands. */
const SIGN_IN_POLL_MS = 2000

export function ProviderCard(props: ProviderCardProps) {
  const { store, prefs, rpc, t } = props
  const provider = props.provider.provider
  if (store === undefined || prefs === undefined || rpc === undefined || t === undefined || !isProviderId(provider)) return null
  return <CardBody provider={provider} store={store} prefs={prefs} rpc={rpc} t={t} />
}

type Mode = { kind: 'view' } | { kind: 'manage' } | { kind: 'signin'; userCode?: string; url?: string }

function CardBody({ provider, store, prefs, rpc, t }: { provider: ProviderId } & SurfaceInjected) {
  const snapshot = useStore(store)
  const prefView = usePrefs(prefs)
  const now = useNow(30_000)
  const status = snapshot.status?.providers[provider]
  const [mode, setMode] = useState<Mode>({ kind: 'view' })
  const [error, setError] = useState<string | undefined>()
  const [moreOpen, setMoreOpen] = useState(false)

  // A busy sign-in polls status until the account lands or the attempt ends.
  const busy = status?.busy === true
  useEffect(() => {
    if (mode.kind !== 'signin' && !busy) return
    const timer = setInterval(() => { void store.refreshStatus() }, SIGN_IN_POLL_MS)
    return () => { clearInterval(timer) }
  }, [mode.kind, busy, store])
  const accountCount = status?.accounts.length ?? 0
  const startCount = useRef(accountCount)
  useEffect(() => {
    if (mode.kind === 'signin' && !busy && accountCount !== startCount.current) setMode({ kind: 'view' })
  }, [mode.kind, busy, accountCount])
  useEffect(() => {
    if (status?.detail !== undefined) setError(status.detail)
  }, [status?.detail])

  const signIn = async (method?: 'oauth' | 'keychain'): Promise<void> => {
    setError(undefined)
    startCount.current = accountCount
    try {
      const response = await call(rpc, 'login', { provider, ...method === undefined ? {} : { method } })
      if (response.authorizeUrl === '') {
        await store.refreshStatus()
        return
      }
      if (response.userCode !== undefined && response.userCode !== '') {
        setMode({ kind: 'signin', userCode: response.userCode, url: response.authorizeUrl })
      } else {
        window.open(response.authorizeUrl, '_blank', 'noopener')
        setMode({ kind: 'signin' })
      }
      void store.refreshStatus()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }
  const cancel = async (): Promise<void> => {
    setMode({ kind: 'view' })
    await call(rpc, 'cancel', { provider }).catch(() => undefined)
    await store.refreshStatus()
  }

  if (status === undefined) {
    return snapshot.statusError === undefined ? null : <div className="dsm-sub"><span className="dsm-card-error">{snapshot.statusError}</span></div>
  }

  if (mode.kind === 'signin') {
    return (
      <div className="dsm-sub">
        <SignIn t={t} provider={provider} mode={mode} rpc={rpc} onCancel={() => { void cancel() }} onError={setError} />
        {error === undefined ? null : <span className="dsm-card-error" role="alert">{error}</span>}
      </div>
    )
  }

  if (status.accounts.length === 0) {
    return (
      <div className="dsm-sub">
        <div className="dsm-foot">
          <button type="button" className="dsm-btn dsm-primary" onClick={() => { void signIn() }}>{t('signIn')}</button>
          {provider === 'claude'
            ? <button type="button" className="dsm-btn dsm-ghost" onClick={() => { void signIn('keychain') }}>{t('claudeImport')}</button>
            : <span className="dsm-muted">{t('noApiKey')}</span>}
        </div>
        {error === undefined ? null : <span className="dsm-card-error" role="alert">{error}</span>}
      </div>
    )
  }

  const split = splitAccounts(status)
  if (split === undefined) return null
  const { active, rest } = split

  return (
    <div className="dsm-sub">
      <Account t={t} provider={provider} account={active} status={status} snapshot={snapshot} prefs={prefView} now={now} hideUsage onSignIn={() => { void signIn() }} />
      {rest.length === 0 ? null : (
        <>
          <button type="button" className="dsm-fold" aria-expanded={moreOpen} onClick={() => { setMoreOpen(open => !open) }}>
            <span className="dsm-fold-name">
              <Icon name="right" size={12} className="dsm-chev" />
              <span>{rest.length === 1 ? label(rest[0]!) : tf(t, 'moreAccounts', { count: rest.length })}</span>
              {rest.length === 1 ? <AccountTags t={t} account={rest[0]!} status={status} /> : null}
            </span>
          </button>
          {moreOpen ? (
            <div className="dsm-fold-body">
              {rest.map(account => <Account key={account.key} t={t} provider={provider} account={account} status={status} snapshot={snapshot} prefs={prefView} now={now} hideUsage onSignIn={() => { void signIn() }} />)}
            </div>
          ) : null}
        </>
      )}
      {mode.kind === 'manage'
        ? <ManagePanel t={t} provider={provider} status={status} rpc={rpc} onClose={() => { setMode({ kind: 'view' }); void store.refreshStatus() }}
            onAddAccount={() => { void signIn() }} />
        : (
          <div className="dsm-foot">
            <button type="button" className="dsm-btn" onClick={() => { setMode({ kind: 'manage' }) }}>{t('manage')}</button>
            <PickerCount t={t} status={status} />
          </div>
        )}
      {error === undefined ? null : <span className="dsm-card-error" role="alert">{error}</span>}
    </div>
  )
}

const label = (account: AccountStatus): string => account.account ?? account.key

function usageOf(snapshot: StoreSnapshot, provider: UsageProviderId, account: string) {
  const entry = snapshot.usage.get(usageKey(provider, account))
  return entry?.kind === 'ready' ? entry.usage : undefined
}

/** Plan tag, default star, and serving bolt. */
export function AccountTags({ t, account, status }: { t: T; account: AccountStatus; status: ProviderStatus }) {
  return (
    <>
      {account.plan === undefined ? null : <span className="dsm-tag">{account.plan}</span>}
      {account.isDefault ? <span className="dsm-glyph dsm-star" title={t('defaultAccount')} aria-label={t('defaultAccount')}><Icon name="star" size={12} /></span> : null}
      {status.servingAccount === account.key
        ? <span className="dsm-glyph dsm-live" title={t('servingAccount')} aria-label={t('servingAccount')}><Icon name="bolt" size={12} /></span>
        : null}
    </>
  )
}

/** "live", "4m ago", or a stale warning, at the end of an account header. */
export function Freshness({ t, snapshot, provider, account, now }: { t: T; snapshot: StoreSnapshot; provider: UsageProviderId; account: string; now: number }) {
  if (!isMetered(snapshot.status, provider)) return <span className="dsm-fresh" title={t('noUsageDataTitle')}>{t('noUsageData')}</span>
  const entry = snapshot.usage.get(usageKey(provider, account))
  if (entry === undefined || entry.kind === 'loading') return null
  if (entry.kind === 'error') return <span className="dsm-fresh dsm-stale" title={entry.message}><Icon name="alert" size={12} />{t('usageUnavailable')}</span>
  const usage = entry.usage
  const fetchedAt = usage.fetchedAt ?? entry.receivedAt
  if (usage.refreshFailed === true || usage.stale === true && usage.retryAt !== undefined) {
    const when = usage.retryAt === undefined ? '' : tf(t, 'resetsIn', { time: shortDuration(Math.max(0, usage.retryAt - now)) })
    return (
      <span className="dsm-fresh dsm-stale" title={tf(t, 'staleTitle', { when })}>
        <Icon name="alert" size={12} />{tf(t, 'staleShort', { time: shortDuration(Math.max(0, now - fetchedAt)) })}
      </span>
    )
  }
  if (usage.source === 'live' && now - fetchedAt < 10 * 60_000) {
    return <span className="dsm-fresh" title={t('liveTitle')}><span className="dsm-live-dot" />{t('live')}</span>
  }
  return <span className="dsm-fresh">{tf(t, 'agoShort', { time: shortDuration(Math.max(0, now - fetchedAt)) })}</span>
}

/** One account: header, then its windows on the shared grid. */
export function Account({ t, provider, account, status, snapshot, prefs, now, onSignIn, compact, hideUsage }: {
  t: T; provider: UsageProviderId; account: AccountStatus; status: ProviderStatus; snapshot: StoreSnapshot
  prefs: UsagePreferencesView; now: number; onSignIn?: () => void; compact?: boolean; hideUsage?: boolean
}) {
  const usage = usageOf(snapshot, provider, account.key)
  const expired = usage === undefined && snapshot.usage.get(usageKey(provider, account.key))?.kind === 'error'
    && account.expiresAt !== undefined && account.expiresAt < now
  return (
    <div className={compact === true ? 'dsm-pacct' : 'dsm-acct'}>
      <div className="dsm-acct-head">
        <span className="dsm-acct-name">{label(account)}</span>
        <AccountTags t={t} account={account} status={status} />
        {hideUsage === true ? null : <Freshness t={t} snapshot={snapshot} provider={provider} account={account.key} now={now} />}
      </div>
      {expired && onSignIn !== undefined ? (
        <div className="dsm-alert" role="alert">
          <Icon name="alert" /><span>{t('signInExpired')}</span>
          <button type="button" className="dsm-btn dsm-primary" onClick={onSignIn}>{t('signInAgain')}</button>
        </div>
      ) : hideUsage === true || usage?.windows === undefined || usage.windows.length === 0 ? null : (
        <div className="dsm-wins">
          {shownWindows(usage.windows).map((window, index) => <WindowRow key={index} t={t} window={window} display={prefs.display} now={now} />)}
        </div>
      )}
    </div>
  )
}

function PickerCount({ t, status }: { t: T; status: ProviderStatus }) {
  const total = status.catalogSize
  if (total === undefined) return null
  const visible = status.visibleModels === undefined ? total : status.visibleModels.length
  return <span className="dsm-muted dsm-num" title={t('modelsCountTitle')}>{tf(t, 'modelsCount', { visible, total })}</span>
}

function SignIn({ t, provider, mode, rpc, onCancel, onError }: {
  t: T; provider: ProviderId; mode: Extract<Mode, { kind: 'signin' }>; rpc: SurfaceInjected['rpc']
  onCancel: () => void; onError: (message: string | undefined) => void
}) {
  const [draft, setDraft] = useState('')
  if (mode.userCode !== undefined) {
    return (
      <div className="dsm-signin">
        <ol className="dsm-steps">
          <li data-s="done"><Icon name="check" size={12} />{t('stepCodeIssued')}</li>
          <li data-s="now"><span className="dsm-spin" />{t('stepWaitingGithub')}</li>
        </ol>
        <div className="dsm-foot" style={{ flexWrap: 'wrap' }}>
          <span className="dsm-code">{mode.userCode}</span>
          <button type="button" className="dsm-btn dsm-icon" aria-label={t('copyCode')} title={t('copyCode')}
            onClick={() => { void navigator.clipboard?.writeText(mode.userCode ?? '') }}><Icon name="copy" /></button>
          {mode.url === undefined ? null : (
            <a className="dsm-btn" href={mode.url} target="_blank" rel="noopener noreferrer">{new URL(mode.url).host + new URL(mode.url).pathname}<Icon name="ext" size={12} /></a>
          )}
          <button type="button" className="dsm-btn dsm-ghost" style={{ marginLeft: 'auto' }} onClick={onCancel}>{t('cancel')}</button>
        </div>
      </div>
    )
  }
  const submit = async (): Promise<void> => {
    const input = draft.trim()
    if (input === '') return
    onError(undefined)
    try {
      await call(rpc, 'manual', { provider, input })
      setDraft('')
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : String(failure))
    }
  }
  return (
    <div className="dsm-signin">
      <ol className="dsm-steps">
        <li data-s="done"><Icon name="check" size={12} />{t('stepTabOpened')}</li>
        <li data-s="now"><span className="dsm-spin" />{t('stepApprove')}</li>
        <li><Icon name="check" size={12} />{t('stepLoadModels')}</li>
      </ol>
      <div className="dsm-foot" style={{ alignItems: 'flex-start' }}>
        <details className="dsm-fallback" style={{ flex: 1 }}>
          <summary><Icon name="down" size={12} />{t('pasteRedirect')}</summary>
          <form className="dsm-foot" onSubmit={event => { event.preventDefault(); void submit() }}>
            <input className="dsm-input" value={draft} placeholder={t('pastePlaceholder')} onChange={event => { setDraft(event.target.value) }} />
            <button type="submit" className="dsm-btn" disabled={draft.trim() === ''}>{t('continue')}</button>
          </form>
        </details>
        <button type="button" className="dsm-btn dsm-ghost" onClick={onCancel}>{t('cancel')}</button>
      </div>
    </div>
  )
}

const TOOL_LABEL = { web_search: 'toolWebSearch', image_generate: 'toolImage', video_generate: 'toolVideo', x_search: 'toolXSearch' } as const

function ManagePanel({ t, provider, status, rpc, onClose, onAddAccount }: {
  t: T; provider: ProviderId; status: ProviderStatus; rpc: SurfaceInjected['rpc']; onClose: () => void; onAddAccount: () => void
}) {
  const [tab, setTab] = useState<'accounts' | 'models' | 'tools'>('accounts')
  const [loaded, setLoaded] = useState<ProviderSettingsValue | undefined>()
  const [draft, setDraft] = useState<ProviderPreferences | undefined>()
  const [efforts, setEfforts] = useState<Record<string, string | undefined>>({})
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    let live = true
    call(rpc, 'providerSettings', { provider }).then(value => {
      if (!live) return
      setLoaded(value)
      setDraft(value.settings)
    }, (failure: unknown) => { if (live) setError(tf(t, 'loadFailed', { message: failure instanceof Error ? failure.message : String(failure) })) })
    return () => { live = false }
  }, [rpc, provider, t])

  const accountAction = async (endpoint: 'logout' | 'setDefault', account: string): Promise<void> => {
    setError(undefined)
    try {
      await call(rpc, endpoint, { provider, account })
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  const save = async (): Promise<void> => {
    if (draft === undefined || loaded === undefined) return
    setSaving(true)
    setError(undefined)
    try {
      await call(rpc, 'setProviderSettings', { provider, settings: draft })
      for (const [model, effort] of Object.entries(efforts)) {
        await call(rpc, 'setModelDefault', { provider, model, ...effort === undefined ? {} : { effort } })
      }
      onClose()
    } catch (failure) {
      setError(tf(t, 'saveFailed', { message: failure instanceof Error ? failure.message : String(failure) }))
    } finally {
      setSaving(false)
    }
  }

  const models = loaded?.models ?? []
  const allIds = models.map(m => m.id)
  const visible = new Set(draft?.visibleModels ?? allIds)
  const automatic = draft?.visibleModels === undefined
  const setVisible = (ids: string[] | undefined): void => {
    setDraft(current => {
      const next: ProviderPreferences = { ...current }
      if (ids === undefined) delete next.visibleModels
      else next.visibleModels = ids
      return next
    })
  }
  const accountPrefs = draft?.accounts ?? {}
  const setPool = (account: string, enabled: boolean): void => {
    setDraft(current => ({ ...current, accounts: { ...current?.accounts, [account]: { ...current?.accounts?.[account], poolEnabled: enabled } } }))
  }
  const toolsOn = draft?.tools ?? {}
  const shown = models.filter(m => search === '' || m.id.toLowerCase().includes(search.toLowerCase()) || m.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="dsm-panel">
      <div className="dsm-tabs" role="tablist">
        {(['accounts', 'models', 'tools'] as const).filter(id => id !== 'tools' || (loaded?.tools.length ?? 0) > 0).map(id => (
          <button key={id} type="button" role="tab" className="dsm-tab" aria-selected={tab === id} onClick={() => { setTab(id) }}>
            {t(id === 'accounts' ? 'tabAccounts' : id === 'models' ? 'tabModels' : 'tabTools')}
          </button>
        ))}
      </div>
      {tab === 'accounts' ? (
        <>
          {status.accounts.map(account => (
            <div key={account.key} className="dsm-row">
              <span className="dsm-grow"><span className="dsm-ellipsis">{label(account)}</span><AccountTags t={t} account={account} status={status} /></span>
              {status.accounts.length > 1 ? (
                <>
                  <span className="dsm-note">{t('pool')}</span>
                  <button type="button" role="switch" className="dsm-switch" aria-checked={accountPrefs[account.key]?.poolEnabled !== false}
                    aria-label={tf(t, 'poolInclude', { account: label(account) })}
                    onClick={() => { setPool(account.key, accountPrefs[account.key]?.poolEnabled === false) }} />
                </>
              ) : null}
              {account.isDefault ? null : (
                <button type="button" className="dsm-btn dsm-icon" title={t('makeDefault')} aria-label={t('makeDefault')}
                  onClick={() => { void accountAction('setDefault', account.key) }}><Icon name="star" /></button>
              )}
              <button type="button" className="dsm-btn dsm-danger" onClick={() => { void accountAction('logout', account.key) }}>{t('signOut')}</button>
            </div>
          ))}
          <div className="dsm-row"><button type="button" className="dsm-btn" onClick={onAddAccount}>+ {t('addAccount')}</button></div>
        </>
      ) : null}
      {tab === 'models' ? (
        <>
          <input className="dsm-input" value={search} placeholder={tf(t, 'searchModels', { count: models.length })} onChange={event => { setSearch(event.target.value) }} />
          <div className="dsm-row">
            <span className="dsm-grow">{t('autoShowNew')}</span>
            <button type="button" role="switch" className="dsm-switch" aria-checked={automatic} aria-label={t('autoShowNew')}
              onClick={() => { setVisible(automatic ? allIds : undefined) }} />
          </div>
          <div className="dsm-row">
            <button type="button" className="dsm-btn" onClick={() => { setVisible(allIds) }}>{t('selectAll')}</button>
            <button type="button" className="dsm-btn" onClick={() => { setVisible([]) }}>{t('deselectAll')}</button>
          </div>
          <div className="dsm-list">
            {shown.map(model => (
              <ModelRow key={model.id} t={t} model={model} on={visible.has(model.id)}
                effort={model.id in efforts ? efforts[model.id] : model.configured}
                onToggle={() => {
                  const next = new Set(visible)
                  if (next.has(model.id)) next.delete(model.id); else next.add(model.id)
                  setVisible(allIds.filter(id => next.has(id)))
                }}
                onEffort={effort => { setEfforts(current => ({ ...current, [model.id]: effort })) }} />
            ))}
          </div>
          <span className="dsm-note">{tf(t, 'pickerCount', { visible: visible.size, total: models.length })}</span>
        </>
      ) : null}
      {tab === 'tools' ? (
        <>
          {(loaded?.tools ?? []).map(tool => (
            <div key={tool} className="dsm-row">
              <span className="dsm-grow">{t(TOOL_LABEL[tool])}</span>
              <button type="button" role="switch" className="dsm-switch" aria-checked={toolsOn[tool] !== false} aria-label={t(TOOL_LABEL[tool])}
                onClick={() => { setDraft(current => ({ ...current, tools: { ...current?.tools, [tool]: current?.tools?.[tool] === false } })) }} />
            </div>
          ))}
          <span className="dsm-note">{t('toolsNote')}</span>
        </>
      ) : null}
      <div className="dsm-panel-foot">
        {error === undefined ? null : <span className="dsm-card-error" role="alert">{error}</span>}
        <button type="button" className="dsm-btn dsm-ghost" onClick={onClose}>{t('cancel')}</button>
        <button type="button" className="dsm-btn dsm-primary" disabled={saving || draft === undefined} onClick={() => { void save() }}>
          {saving ? t('saving') : t('save')}
        </button>
      </div>
    </div>
  )
}

function ModelRow({ t, model, on, effort, onToggle, onEffort }: {
  t: T; model: ProviderModelRow; on: boolean; effort: string | undefined; onToggle: () => void; onEffort: (effort: string | undefined) => void
}) {
  return (
    <div className="dsm-row">
      <button type="button" role="switch" className="dsm-switch" aria-checked={on} aria-label={tf(t, 'showInPicker', { model: model.id })} onClick={onToggle} />
      <span className="dsm-grow">
        <span className="dsm-ellipsis dsm-num">{model.id}</span>
        {model.contextWindow === undefined ? null : <span className="dsm-note">{Math.round(model.contextWindow / 1000)}K</span>}
      </span>
      {model.efforts.length === 0 ? null : (
        <select className="dsm-select" aria-label={tf(t, 'effortFor', { model: model.id })} value={effort ?? ''}
          onChange={event => { onEffort(event.target.value === '' ? undefined : event.target.value) }}>
          <option value="">{t('effortAuto')}</option>
          {model.efforts.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}
        </select>
      )}
    </div>
  )
}
