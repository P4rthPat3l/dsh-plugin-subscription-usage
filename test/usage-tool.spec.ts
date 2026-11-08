import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildUsageReport, USAGE_PROMPT_REMINDER } from '../src/tools/usage.js'
import type { UsageTarget, UsageToolSource } from '../src/tools/usage.js'
import { pace } from '../src/usage/pace.js'
import type { ProviderUsage, UsageWindow } from '../src/providers/common.js'

const H = 3_600_000
const NOW = Date.parse('2026-11-08T12:00:00Z')
const signal = new AbortController().signal

const codex: UsageTarget = { provider: 'codex', key: 'a', label: 'me@example.com' }
const claude: UsageTarget = { provider: 'claude', key: 'b', label: 'me@example.org' }
const zai: UsageTarget = { provider: 'zai', key: 'key', label: 'Z.ai' }

function window(usedPercent: number, elapsed: number): UsageWindow {
  return { kind: 'session', usedPercent, durationMs: 5 * H, resetsAt: NOW + (1 - elapsed) * 5 * H }
}

function source(targets: UsageTarget[], reads: Record<string, ProviderUsage | Error>, calls: boolean[] = []): UsageToolSource {
  return {
    targets: async () => targets,
    async read(target, refresh) {
      calls.push(refresh)
      const result = reads[target.provider]!
      if (result instanceof Error) throw result
      return result
    },
  }
}

const run = (s: UsageToolSource, args: { provider?: string; refresh?: boolean } = {}) =>
  buildUsageReport({ source: s, now: () => NOW }, args, signal)

test('AC-001: returns one entry per signed-in provider with windows and ISO reset', async () => {
  const report = await run(source([codex, claude], {
    codex: { supported: true, plan: 'plus', windows: [window(40, 0.5)] },
    claude: { supported: true, windows: [window(10, 0.5)] },
  }))
  assert.deepEqual(report.providers.map(entry => entry.provider), ['codex', 'claude'])
  const first = report.providers[0]!.windows![0]!
  assert.equal(first.usedPercent, 40)
  assert.equal(first.leftPercent, 60)
  assert.equal(first.resetsAt, new Date(NOW + 2.5 * H).toISOString())
  assert.equal(report.providers[0]!.plan, 'plus')
})

test('AC-002: pace matches pace() and emptyAt is set only when over', async () => {
  const over = window(71, 0.28)
  const calm = window(10, 0.5)
  const report = await run(source([codex, claude], {
    codex: { supported: true, windows: [over] },
    claude: { supported: true, windows: [calm] },
  }))
  const overReport = report.providers[0]!.windows![0]!
  const expected = pace(over, NOW)
  assert.equal(overReport.pace, 'over')
  assert.equal(expected.state, 'over')
  if (expected.state === 'over') assert.equal(overReport.emptyAt, new Date(expected.emptyAt).toISOString())
  const calmReport = report.providers[1]!.windows![0]!
  assert.equal(calmReport.pace, 'calm')
  assert.equal(calmReport.emptyAt, undefined)
})

test('AC-003: provider filter narrows the answer and an unknown id names the valid ones', async () => {
  const s = source([codex, claude], {
    codex: { supported: true, windows: [] },
    claude: { supported: true, windows: [] },
  })
  const one = await run(s, { provider: 'claude' })
  assert.deepEqual(one.providers.map(entry => entry.provider), ['claude'])
  await assert.rejects(run(s, { provider: 'nope' }), /Available: codex, claude/)
})

test('AC-004: refresh is passed to the read and defaults to false', async () => {
  const calls: boolean[] = []
  const s = source([codex], { codex: { supported: true, windows: [] } }, calls)
  await run(s)
  await run(s, { refresh: true })
  assert.deepEqual(calls, [false, true])
})

test('AC-005: one failing provider reports an error and the others still return', async () => {
  const report = await run(source([codex, claude], {
    codex: new Error('boom'),
    claude: { supported: true, windows: [window(5, 0.5)] },
  }))
  assert.equal(report.providers[0]!.error, 'boom')
  assert.equal(report.providers[1]!.windows!.length, 1)
})

test('AC-006: no accounts gives an empty list with a note, and an unsupported provider has no windows', async () => {
  const empty = await run(source([], {}))
  assert.deepEqual(empty.providers, [])
  assert.match(empty.note!, /No subscription/)
  const grok = await run(source([{ provider: 'grok', key: 'g', label: 'g@example.com' }], { grok: { supported: false } }))
  assert.equal(grok.providers[0]!.windows, undefined)
  assert.match(grok.providers[0]!.note!, /no usage/)
})

test('AC-007: the report holds only the account label, never a key or token field', async () => {
  const report = await run(source([zai], {
    zai: { supported: true, windows: [window(1, 0.5)] },
  }))
  const text = JSON.stringify(report)
  assert.ok(text.includes('"account":"Z.ai"'))
  assert.doesNotMatch(text, /token|secret|apiKey|"key"|tail/i)
})

test('AC-010: the prompt reminder names the tool', () => {
  assert.match(USAGE_PROMPT_REMINDER, /subscription_usage/)
})
