import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OAuthEndpointError } from '../../src/providers/common.js'
import type { ProviderUsage } from '../../src/providers/common.js'
import { PoolUsageTracker } from '../../src/providers/pool-usage.js'
import { UsageService } from '../../src/usage/service.js'
import type { ProviderId } from '../../src/auth/store.js'
import type { UsageProviderId } from '../../src/usage-providers/index.js'

const ENDPOINT: ProviderUsage = { supported: true, plan: 'max', windows: [
  { kind: 'session', usedPercent: 10 },
  { kind: 'weekly', usedPercent: 20 },
  { kind: 'weekly', scope: 'Opus', usedPercent: 30 },
] }

/** A service over a real tracker whose Claude fetcher counts calls; time is injected. */
function setup(fetcher: () => Promise<ProviderUsage> = () => Promise.resolve(ENDPOINT)) {
  const clock = { now: 1_000_000 }
  const realNow = Date.now
  Date.now = () => clock.now
  const calls = { count: 0 }
  const tracker = new PoolUsageTracker((provider: UsageProviderId) =>
    provider === 'claude' ? () => { calls.count++; return fetcher() } : undefined)
  const service = new UsageService({ tracker, hasEndpoint: provider => provider !== 'copilot', now: () => clock.now })
  return { service, tracker, calls, clock, restore: () => { Date.now = realNow } }
}

test('AC-006: a Claude reply updates the snapshot to live without calling the usage endpoint', async () => {
  const { service, calls, restore } = setup()
  try {
    const changed = service.observe('claude', 'a1', 's1', new Headers({
      'anthropic-ratelimit-unified-5h-utilization': '0.56',
      'anthropic-ratelimit-unified-7d-utilization': '0.46',
    }))
    assert.equal(changed, true)
    const usage = await service.read('claude', 'a1', 'poll')
    assert.equal(calls.count, 0)
    assert.equal(usage.source, 'live')
    assert.ok(Math.abs((usage.windows?.[0]?.usedPercent ?? 0) - 56) < 1e-9)
  } finally { restore() }
})

test('AC-006: live windows keep the endpoint\'s model-scoped lanes and plan', async () => {
  const { service, restore } = setup()
  try {
    await service.read('claude', 'a1', 'poll')
    service.observe('claude', 'a1', 's1', new Headers({ 'anthropic-ratelimit-unified-7d-utilization': '0.5' }))
    const usage = await service.read('claude', 'a1', 'poll')
    assert.equal(usage.plan, 'max')
    assert.deepEqual(usage.windows?.map(w => [w.kind, w.scope ?? '', Math.round(w.usedPercent)]), [
      ['weekly', '', 50], ['session', '', 10], ['weekly', 'Opus', 30],
    ])
  } finally { restore() }
})

test('AC-007: two manual refreshes 10 s apart cause one endpoint fetch', async () => {
  const { service, calls, clock, restore } = setup()
  try {
    await service.read('claude', 'a1', 'manual')
    clock.now += 10_000
    const second = await service.read('claude', 'a1', 'manual')
    assert.equal(calls.count, 1)
    assert.equal(second.manualReadyAt, 1_000_000 + 30_000)
    clock.now += 25_000
    await service.read('claude', 'a1', 'manual')
    assert.equal(calls.count, 2)
  } finally { restore() }
})

test('AC-008: opening with a 30 s old snapshot does not fetch; with a 90 s old snapshot it fetches once', async () => {
  const { service, calls, clock, restore } = setup()
  try {
    await service.read('claude', 'a1', 'poll')
    assert.equal(calls.count, 1)
    clock.now += 30_000
    await service.read('claude', 'a1', 'open')
    assert.equal(calls.count, 1)
    clock.now += 60_000
    await service.read('claude', 'a1', 'open')
    assert.equal(calls.count, 2)
  } finally { restore() }
})

test('AC-009: during a failure cooldown a manual refresh returns the last snapshot marked failed and does not fetch', async () => {
  let fail = false
  const { service, calls, clock, restore } = setup(() => fail
    ? Promise.reject(new OAuthEndpointError('claude usage (HTTP 429)', 429, undefined, 600_000))
    : Promise.resolve(ENDPOINT))
  try {
    await service.read('claude', 'a1', 'poll')
    fail = true
    clock.now += 31_000
    await service.read('claude', 'a1', 'manual')
    assert.equal(calls.count, 2)
    clock.now += 31_000
    const usage = await service.read('claude', 'a1', 'manual')
    assert.equal(calls.count, 2, 'the cooldown blocks the second manual fetch')
    assert.equal(usage.refreshFailed, true)
    assert.equal(usage.windows?.[0]?.usedPercent, 10)
  } finally { restore() }
})

test('AC-010: the served account is reported per session and falls back to the provider\'s latest', () => {
  const { service, restore } = setup()
  try {
    service.observe('claude', 'a1', 's1', new Headers())
    service.observe('claude', 'a2', 's2', new Headers())
    assert.equal(service.servedAccount('claude', 's1')?.account, 'a1')
    assert.equal(service.servedAccount('claude', 's2')?.account, 'a2')
    assert.equal(service.servedAccount('claude', 'unknown')?.account, 'a2')
    service.forget('claude', 'a2')
    assert.equal(service.servedAccount('claude', 's2'), undefined)
  } finally { restore() }
})

test('CASE-001: a provider without a usage endpoint reports unsupported and never fetches', async () => {
  const { service, calls, restore } = setup()
  try {
    assert.deepEqual(await service.read('copilot', 'u1', 'manual'), { supported: false })
    assert.equal(calls.count, 0)
  } finally { restore() }
})
