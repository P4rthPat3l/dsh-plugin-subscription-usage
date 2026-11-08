/**
 * Browser half. Registers:
 * - the Models row body (`settings.models.provider-card`, keyed by our entry id)
 *   and the options block after the rows (`settings.models.footer`);
 * - the usage gauge under the composer (`conversation.composer.dock`) and in
 *   the New Session row (`conversation.hero.options`);
 * - the pace notice (`shell.overlay`);
 * - the retained upstream surfaces: image/video tool views, the Codex Speed
 *   toggle and `/fast`.
 */
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { CommandUiContract } from '@deepseek-ai/dsh-client-ui-commands/client'
import { en, zh, LOCALE_NS } from './locales.js'
import { css } from './styles.js'
import { SubscriptionsStore } from './store.js'
import { PrefsStore } from './prefs.js'
import type { ConfigFormLike } from './prefs.js'
import type { SurfaceInjected } from './context.js'
import type { T } from './meter.js'
import { ProviderCard } from './ProviderCard.js'
import { Footer } from './Footer.js'
import { Usage, UsageNavIcon } from './Usage.js'
import { Gauge } from './Gauge.js'
import type { CurrentModelSource, GaugeInjected } from './Gauge.js'
import { Notice } from './Notice.js'
import { ImageGenerateToolview, createImageLoader } from './ImageGenerateToolview.js'
import type { ImageGenerateToolviewInjected } from './ImageGenerateToolview.js'
import { VideoGenerateToolview, createVideoLoader } from './VideoGenerateToolview.js'
import type { VideoGenerateToolviewInjected } from './VideoGenerateToolview.js'
import { SpeedSelect, createSpeedLoader, createSpeedSetter } from './SpeedSelect.js'
import type { ModelDirectoriesLike, SpeedSelectInjected } from './SpeedSelect.js'
import { fastCommandDescription } from './fast-command.js'

/** The Host entry id from cordis.patch.yml; the Models page dispatches our card by it. */
const ENTRY_ID = 'subscription-models'

export const inject = ['slots', 'connection', 'locale']

/** The model-selection service as this plugin uses it. */
interface ModelDirectoriesService extends ModelDirectoriesLike {
  directoryFor(sessionId: string): ReturnType<ModelDirectoriesLike['directoryFor']> & {
    store: CurrentModelSource
  }
}

/** The settings forms service as this plugin uses it. */
interface ConfigFormsLike {
  get(entryId: string): ConfigFormLike
}

const hasMethod = (value: unknown, name: string): boolean =>
  typeof value === 'object' && value !== null && name in value && typeof (value as Record<string, unknown>)[name] === 'function'

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { en, zh }), 'dsh-subscription-models: copy')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-subscription-models'
    style.textContent = css
    document.head.appendChild(style)
    return () => { style.remove() }
  }, 'dsh-subscription-models: stylesheet')

  // In the browser the `connection` key holds the full client handle.
  const connection = ctx.get('connection') as unknown as ConnectionHandle
  const t: T = ctx.locale.bind(LOCALE_NS)
  const store = new SubscriptionsStore(connection.rpc)
  const prefs = new PrefsStore()
  const surface = (): SurfaceInjected => ({ store, prefs, rpc: connection.rpc, t })

  ctx.inject(['configForms'], scope => {
    const forms: unknown = scope.get('configForms')
    if (!hasMethod(forms, 'get')) return
    scope.effect(() => prefs.bind((forms as ConfigFormsLike).get(ENTRY_ID)), 'dsh-subscription-models: usage preferences')
  })

  ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
    name: 'settings.models.provider-card', key: ENTRY_ID, inject: surface,
  }, ProviderCard))
  ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
    name: 'settings.models.footer', id: 'subscription-models', order: 10, inject: surface,
  }, Footer))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'subscription-usage', order: 11, label: () => t('usage'), inject: surface,
  }, Usage))

  // The nav row keeps the shell's gear unless an icon is registered under the section id.
  ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
    name: 'settings.section.icon', id: 'subscription-usage',
  }, UsageNavIcon))

  const models = (): ModelDirectoriesService | undefined => {
    const service: unknown = ctx.get('modelDirectories')
    return hasMethod(service, 'directoryFor') ? service as ModelDirectoriesService : undefined
  }
  const gaugeInject = (sessionId: string): GaugeInjected => {
    let currentModel: CurrentModelSource | undefined
    try {
      currentModel = models()?.directoryFor(sessionId).store
    } catch {
      // An unknown session has no directory yet; the gauge then follows pinned providers only.
    }
    return { ...surface(), sessionId, currentModel }
  }
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock', id: 'subscription-models.gauge', order: 10, inject: gaugeInject,
  }, Gauge))
  ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({
    name: 'conversation.hero.options', id: 'subscription-models.gauge', order: 10, inject: gaugeInject,
  }, Gauge))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'subscription-models.notice', order: 50, inject: surface,
  }, Notice))

  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview', key: 'image_generate', locale: LOCALE_NS,
    inject: (): ImageGenerateToolviewInjected => ({ load: createImageLoader(connection.rpc) }),
  }, ImageGenerateToolview))
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview', key: 'video_generate', locale: LOCALE_NS,
    inject: (): VideoGenerateToolviewInjected => ({ loadVideo: createVideoLoader(connection.rpc) }),
  }, VideoGenerateToolview))
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right', id: 'codex-speed', order: 0, locale: LOCALE_NS,
    inject: (sessionId: string): SpeedSelectInjected => ({
      loadSpeed: createSpeedLoader(connection, models, sessionId),
      setSpeed: createSpeedSetter(connection, sessionId, models),
    }),
  }, SpeedSelect))

  ctx.inject(['commandUi'], (scope: ClientContext) => {
    const command = scope.get('commandUi') as CommandUiContract
    scope.effect(() => command.register({
      name: 'fast',
      description: fastCommandDescription(() => t('commandFast')),
      available: () => true,
      ui: {
        kind: 'popupSelect',
        options: async session => {
          const state = await createSpeedLoader(connection, models, session.sessionId)()
          if (!state.visible) throw new Error(t('commandFastUnavailable'))
          return ([
            { id: 'standard', label: t('speedStandard'), detail: t('speedStandardDescription') },
            { id: 'fast', label: t('speedFast'), detail: t('speedFastDescription') },
          ] as const).map(option => ({ ...option, active: option.id === state.tier }))
        },
        onSelect: async (option, session) => {
          await createSpeedSetter(connection, session.sessionId, models)(option.id === 'fast' ? 'fast' : 'standard')
        },
      },
    }), 'dsh-subscription-models: /fast')
  })
}
