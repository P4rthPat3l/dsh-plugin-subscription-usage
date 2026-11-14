/**
 * Browser calls to the Host's `/api/subscriptions-auth.*` routes, and the
 * shapes those routes return. Only types cross from the Host modules, so the
 * bundle stays free of Node imports.
 */
import type { ConnectionHandle, RpcResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { AccountStatus, ProviderStatus, ProviderAccountCatalog } from '../auth/rpc.js'
import type { ProviderId } from '../auth/store.js'
import type { KeyProviderId, KeyProviderView } from '../usage-providers/index.js'
import type { ClaudePromptCacheTtlSetting, ProviderPreferences, SubscriptionTool } from '../provider-settings.js'
import type { DisplayUsage, UsageReadReason } from '../usage/service.js'
import type { ProxyConfigView, ProxyInput, ProxyTestResult } from '../http.js'

export type { KeyProviderId, KeyProviderView, AccountStatus, ProviderStatus, ProviderId, ProviderPreferences, DisplayUsage, UsageReadReason, ProxyConfigView, ProxyTestResult }

/** Every provider this plugin can route, in Models-page order. Names and metering come from `status`. */
export const PROVIDERS: readonly ProviderId[] = ['codex', 'claude', 'grok', 'copilot', 'antigravity']

/** Providers that read usage with a pasted key, in Usage-page order. Mirrors the Host's `KEY_PROVIDER_IDS`. */
export const KEY_PROVIDERS: readonly KeyProviderId[] = ['zai', 'ollama-cloud', 'kimi', 'minimax', 'cline-pass', 'openrouter', 'nanogpt']

/** Any provider the Usage page and gauge can show. */
export type UsageProviderId = ProviderId | KeyProviderId

export const USAGE_PROVIDERS: readonly UsageProviderId[] = [...PROVIDERS, ...KEY_PROVIDERS]

export const isUsageProviderId = (value: unknown): value is UsageProviderId =>
  typeof value === 'string' && (USAGE_PROVIDERS as readonly string[]).includes(value)

export const isProviderId = (value: unknown): value is ProviderId =>
  typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value)

/** The provider's short name from `status`, else its id. */
export const shortName = (status: StatusValue | undefined, provider: UsageProviderId): string =>
  status?.providers[provider]?.shortName ?? provider

/** Whether the Host reports usage for this provider. */
export const isMetered = (status: StatusValue | undefined, provider: UsageProviderId): boolean =>
  status?.providers[provider]?.metered === true

/** `status` response. */
export interface StatusValue {
  usageRevision: number
  /** Every key provider with whether a key is stored; configured ones also appear in `providers`. Absent from a Host that predates key providers. */
  keyProviders?: KeyProviderView[]
  providers: Partial<Record<UsageProviderId, ProviderStatus>>
}

/** One model row of `providerSettings`. */
export interface ProviderModelRow {
  id: string
  name: string
  contextWindow?: number
  efforts: { id: string; name: string }[]
  configured?: string
}

/** `providerSettings` response. */
export interface ProviderSettingsValue {
  provider: ProviderId
  settings: ProviderPreferences
  models: ProviderModelRow[]
  tools: readonly SubscriptionTool[]
  accounts: ProviderAccountCatalog[]
  /** Claude only: the Config cache lifetime the "default" choice resolves to. */
  promptCacheTtlDefault?: ClaudePromptCacheTtlSetting
}

/** The Host's business error text. */
export class SubscriptionsAuthError extends Error {}

/** Typed endpoint table: payload in, value out. */
export interface Endpoints {
  status: [{ sessionId?: string }, StatusValue]
  usage: [{ provider: UsageProviderId; account: string; reason: UsageReadReason }, DisplayUsage]
  keysSet: [{ provider: KeyProviderId; key: string }, { ok: true }]
  keysRemove: [{ provider: KeyProviderId }, { ok: true }]
  login: [{ provider: ProviderId; method?: 'oauth' | 'keychain' }, { authorizeUrl: string; userCode?: string }]
  manual: [{ provider: ProviderId; input: string }, { ok: true }]
  cancel: [{ provider: ProviderId }, { ok: true }]
  logout: [{ provider: ProviderId; account: string }, { ok: true }]
  setDefault: [{ provider: ProviderId; account: string }, { ok: true }]
  providerSettings: [{ provider: ProviderId; force?: boolean }, ProviderSettingsValue]
  setProviderSettings: [{ provider: ProviderId; settings: ProviderPreferences }, { ok: true }]
  setModelDefault: [{ provider: ProviderId; model: string; effort?: string }, { ok: true }]
  proxyGet: [Record<string, never>, ProxyConfigView]
  proxySet: [ProxyInput, ProxyConfigView]
  proxyTest: [{ url?: string; proxy?: { url: string } }, ProxyTestResult]
  image: [Record<string, unknown>, { mediaType: string; dataBase64: string }]
  video: [{ name: string }, { mediaType: string; dataBase64: string }]
  speed: [{ sessionId: string; model?: string }, { tier: 'standard' | 'fast'; fastModels: string[] }]
  setSpeed: [{ sessionId: string; tier: 'standard' | 'fast'; model?: string }, { ok: true }]
}

/**
 * Call one endpoint and unwrap its business result.
 * @throws SubscriptionsAuthError with the Host's message on transport or business failure.
 */
export async function call<E extends keyof Endpoints>(
  rpc: ConnectionHandle['rpc'],
  endpoint: E,
  payload: Endpoints[E][0],
): Promise<Endpoints[E][1]> {
  let result: RpcResult<unknown>
  try {
    result = await rpc.call('/api', `subscriptions-auth.${endpoint}`, payload)
  } catch (error) {
    throw new SubscriptionsAuthError(error instanceof Error ? error.message : String(error))
  }
  if (!result.ok) throw new SubscriptionsAuthError(result.error.message)
  // The Host route owns this shape; the endpoint table mirrors it.
  return result.value as Endpoints[E][1]
}
