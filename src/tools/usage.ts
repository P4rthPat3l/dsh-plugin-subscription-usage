/**
 * `subscription_usage` tool: lets the agent read how much of each
 * subscription limit is used before it starts long or heavy work. Read-only;
 * it reuses the usage snapshots the Settings page shows.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { ProviderUsage } from '../providers/common.js'
import { pace } from '../usage/pace.js'

/** One signed-in account the tool may report on. */
export interface UsageTarget {
  provider: string
  /** Account key passed to `read`. */
  key: string
  /** Label safe to show the model: an email or login, never a secret. */
  label: string
}

/** Where the tool gets accounts and snapshots from. */
export interface UsageToolSource {
  /** One account per provider that has a usage endpoint. */
  targets(): Promise<UsageTarget[]>
  read(target: UsageTarget, refresh: boolean, signal: AbortSignal): Promise<ProviderUsage>
}

export interface UsageToolOptions {
  source: UsageToolSource
  /** Clock, injectable for tests. */
  now?: () => number
}

interface WindowReport {
  kind: string
  scope?: string
  usedPercent: number
  leftPercent: number
  resetsAt?: string
  pace: string
  emptyAt?: string
}

interface ProviderReport {
  provider: string
  account: string
  plan?: string
  windows?: WindowReport[]
  stale?: boolean
  fetchedAt?: string
  note?: string
  error?: string
}

export interface UsageReport {
  providers: ProviderReport[]
  note?: string
}

function iso(ms: number | undefined): string | undefined {
  return ms !== undefined && Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
}

function reportWindows(usage: ProviderUsage, now: number): WindowReport[] {
  return (usage.windows ?? []).map(window => {
    const state = pace(window, now)
    const used = Number.isFinite(window.usedPercent) ? Math.max(0, Math.min(100, window.usedPercent)) : 0
    const resetsAt = iso(window.resetsAt)
    const emptyAt = state.state === 'over' ? iso(state.emptyAt) : undefined
    return {
      kind: window.kind,
      ...window.scope === undefined ? {} : { scope: window.scope },
      usedPercent: Math.round(used),
      leftPercent: 100 - Math.round(used),
      ...resetsAt === undefined ? {} : { resetsAt },
      pace: state.state,
      ...emptyAt === undefined ? {} : { emptyAt },
    }
  })
}

/**
 * Collect usage for the requested provider, or for every signed-in provider.
 * One provider's failure becomes an `error` on its own entry.
 */
export async function buildUsageReport(
  options: UsageToolOptions,
  args: { provider?: string; refresh?: boolean },
  signal: AbortSignal,
): Promise<UsageReport> {
  const now = (options.now ?? Date.now)()
  const all = await options.source.targets()
  const known = [...new Set(all.map(target => target.provider))]
  if (args.provider !== undefined && !known.includes(args.provider)) {
    throw new Error(`subscription_usage: no signed-in provider "${args.provider}". Available: ${known.length > 0 ? known.join(', ') : 'none'}`)
  }
  const targets = args.provider === undefined ? all : all.filter(target => target.provider === args.provider)
  if (targets.length === 0) return { providers: [], note: 'No subscription or usage key is set up.' }
  const providers = await Promise.all(targets.map(async (target): Promise<ProviderReport> => {
    const base = { provider: target.provider, account: target.label }
    try {
      const usage = await options.source.read(target, args.refresh === true, signal)
      if (!usage.supported) return { ...base, note: 'This provider reports no usage.' }
      const fetchedAt = iso(usage.fetchedAt)
      return {
        ...base,
        ...usage.plan === undefined ? {} : { plan: usage.plan },
        windows: reportWindows(usage, now),
        ...usage.stale === true || usage.refreshFailed === true ? { stale: true } : {},
        ...fetchedAt === undefined ? {} : { fetchedAt },
      }
    } catch (error) {
      return { ...base, error: error instanceof Error ? error.message : String(error) }
    }
  }))
  return { providers }
}

/** Build the `subscription_usage` tool definition. */
export function createUsageTool(options: UsageToolOptions): ToolDefinition {
  return defineTool({
    name: 'subscription_usage',
    description: 'Read how much of each AI subscription limit is used (ChatGPT Codex, Claude, Grok, Copilot, Antigravity, Z.ai, Ollama Cloud, Kimi Code, MiniMax, ClinePass, OpenRouter, NanoGPT). '
      + 'Returns per provider the plan, each window\'s percent used and left, the reset time, and a pace state: calm, tight, over (will run out before reset, with emptyAt) or out. '
      + 'Call it before long, critical or heavy work, and prefer a provider whose pace is calm. Read-only. It returns cached data unless refresh is true.',
    parameters: {
      provider: { type: 'string', description: 'Limit the answer to one provider id, such as codex or claude. Omit for all.' },
      refresh: { type: 'boolean', description: 'Fetch fresh numbers instead of the cached snapshot.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    presentCall: args => ({
      card: 'generic',
      title: args.provider === undefined ? 'subscription_usage' : `subscription_usage: ${args.provider}`,
      kind: 'search',
    }),
    async execute(args, exec) {
      return JSON.stringify(await buildUsageReport(options, args, exec.signal))
    },
  })
}

/** The system prompt reminder, kept short so it costs little on every step. */
export const USAGE_PROMPT_REMINDER = 'Before long, critical or heavy work on a subscription model, call subscription_usage to check how much of the limit is left, and prefer a provider whose pace is calm.'
