/**
 * The configurable-provider entries that make each subscription a row on the
 * DSH Models settings page. The Models page joins `llm.listConfigurableProviders`
 * with live routes and renders our `settings.models.provider-card` slot in every
 * row whose `settingsNs` is this plugin's entry id.
 */
import type { LlmConfigurableProvider } from '@deepseek-ai/dsh-llm'
import type { ProviderId } from './auth/store.js'

/** Row titles on the Models page. */
export const PROVIDER_DISPLAY_NAMES: Record<ProviderId, string> = {
  codex: 'ChatGPT (Codex)',
  claude: 'Claude',
  grok: 'Grok',
  copilot: 'GitHub Copilot',
  antigravity: 'Google Antigravity',
}

/**
 * Directory entries for the enabled providers.
 * @param providers - enabled provider ids in display order.
 * @param settingsNs - this plugin's Loader entry id; the Models page dispatches the card slot by it.
 * @returns one entry per provider, OAuth-authenticated with no API-key variables.
 */
export function directoryEntries(providers: readonly ProviderId[], settingsNs: string): LlmConfigurableProvider[] {
  return providers.map(provider => ({
    provider,
    displayName: PROVIDER_DISPLAY_NAMES[provider],
    settingsNs,
    // The row's settings address. An empty path marks the row configured once
    // the namespace is described, which our volatile `usage` field ensures.
    settingsPath: [],
    nativeAuth: { env: [], oauth: true },
  }))
}
