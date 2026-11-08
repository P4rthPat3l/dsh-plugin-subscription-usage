/**
 * Plugin-wide options after the Models provider rows
 * (`settings.models.footer`): the subscription-only proxy. Usage options live in the Usage page.
 */
import { useEffect, useState } from 'react'
import type { ProxyConfigView } from './rpc.js'
import { call } from './rpc.js'
import { tf } from './meter.js'
import type { T } from './meter.js'
import type { SurfaceInjected } from './context.js'

export type FooterProps = Partial<SurfaceInjected>

export function Footer(props: FooterProps) {
  const { store, prefs, rpc, t } = props
  if (store === undefined || prefs === undefined || rpc === undefined || t === undefined) return null
  return <FooterBody rpc={rpc} t={t} />
}

function FooterBody({ rpc, t }: Omit<SurfaceInjected, 'store' | 'prefs'>) {
  return (
    <section className="dsm-footer-block" aria-labelledby="dsm-footer-title">
      <h3 id="dsm-footer-title">{t('subscriptions')}</h3>
      <ProxyRow t={t} rpc={rpc} />
    </section>
  )
}

function ProxyRow({ t, rpc }: { t: T; rpc: SurfaceInjected['rpc'] }) {
  const [config, setConfig] = useState<ProxyConfigView | undefined>()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [bypass, setBypass] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    call(rpc, 'proxyGet', {}).then(value => { if (live) setConfig(value) }, () => undefined)
    return () => { live = false }
  }, [rpc])

  const edit = (): void => {
    setUrl(config?.url ?? '')
    setBypass((config?.bypass ?? []).join(', '))
    setEnabled(config?.enabled ?? false)
    setMessage(undefined)
    setOpen(true)
  }
  const save = async (): Promise<void> => {
    setBusy(true)
    setMessage(undefined)
    try {
      const saved = await call(rpc, 'proxySet', {
        enabled, url: url.trim(), bypass: bypass.split(',').map(entry => entry.trim()).filter(entry => entry !== ''),
      })
      setConfig(saved)
      setOpen(false)
    } catch (failure) {
      setMessage(tf(t, 'saveFailed', { message: failure instanceof Error ? failure.message : String(failure) }))
    } finally {
      setBusy(false)
    }
  }
  const test = async (): Promise<void> => {
    setBusy(true)
    setMessage(undefined)
    try {
      const result = await call(rpc, 'proxyTest', url.trim() === '' ? {} : { proxy: { url: url.trim() } })
      setMessage(result.ok && result.status !== undefined
        ? tf(t, 'proxyTestOk', { status: result.status, ms: result.latencyMs ?? 0 })
        : result.error ?? '')
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="dsm-row">
        <span className="dsm-grow">{t('proxy')} <span className="dsm-note">{config?.enabled === true ? config.url : t('proxyOff')}</span></span>
        {open ? null : <button type="button" className="dsm-btn" onClick={edit}>{t('configure')}</button>}
      </div>
      {open ? (
        <div className="dsm-panel" style={{ paddingTop: 12 }}>
          <div className="dsm-row">
            <span className="dsm-grow">{t('proxyEnabled')}</span>
            <button type="button" role="switch" className="dsm-switch" aria-checked={enabled} aria-label={t('proxyEnabled')} onClick={() => { setEnabled(value => !value) }} />
          </div>
          <input className="dsm-input" value={url} placeholder="http://127.0.0.1:7890" aria-label={t('proxyUrl')} onChange={event => { setUrl(event.target.value) }} />
          <input className="dsm-input" value={bypass} placeholder={t('proxyBypass')} aria-label={t('proxyBypass')} onChange={event => { setBypass(event.target.value) }} />
          <div className="dsm-panel-foot">
            {message === undefined ? null : <span className="dsm-note" role="status" style={{ marginRight: 'auto' }}>{message}</span>}
            <button type="button" className="dsm-btn dsm-ghost" disabled={busy} onClick={() => { void test() }}>{t('proxyTest')}</button>
            <button type="button" className="dsm-btn dsm-ghost" onClick={() => { setOpen(false) }}>{t('cancel')}</button>
            <button type="button" className="dsm-btn dsm-primary" disabled={busy} onClick={() => { void save() }}>{t('save')}</button>
          </div>
        </div>
      ) : null}
    </>
  )
}
