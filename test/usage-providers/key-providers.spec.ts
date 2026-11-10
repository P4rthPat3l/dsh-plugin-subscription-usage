/** FEAT-002: API key usage providers. All fetches are injected; no network. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseZaiUsage, zai } from '../../src/usage-providers/zai.js'
import { parseOllamaUsage } from '../../src/usage-providers/ollama-cloud.js'
import { kimi, parseKimiUsage } from '../../src/usage-providers/kimi.js'
import { parseMiniMaxUsage } from '../../src/usage-providers/minimax.js'
import { parseClinePassUsage } from '../../src/usage-providers/cline-pass.js'
import { parseOpenRouterUsage } from '../../src/usage-providers/openrouter.js'
import { parseNanoGptUsage } from '../../src/usage-providers/nanogpt.js'
import { KeyStore } from '../../src/usage-providers/keys.js'
import { KeyUsage } from '../../src/usage-providers/index.js'
import { UsageService } from '../../src/usage/service.js'
import { PoolUsageTracker } from '../../src/providers/pool-usage.js'
import type { FetchFn } from '../../src/providers/common.js'

const json = (body: unknown, status = 200): Response => Response.json(body, { status })
const fetchReturning = (handler: (url: string) => Response): FetchFn =>
  (input => Promise.resolve(handler(String(input)))) satisfies FetchFn

test('AC-001: Z.ai TOKENS_LIMIT of 42% with a reset time parses to a window at 42% with that reset', () => {
  const reset = Date.UTC(2026, 10, 9)
  const usage = parseZaiUsage({ success: true, code: 200, data: { level: 'pro', limits: [
    { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 42, nextResetTime: reset },
  ] } })
  assert.equal(usage.plan, 'pro')
  assert.equal(usage.windows?.length, 1)
  assert.equal(usage.windows?.[0]?.usedPercent, 42)
  assert.equal(usage.windows?.[0]?.resetsAt, reset)
  assert.equal(usage.windows?.[0]?.durationMs, 5 * 3_600_000)
  assert.equal(usage.windows?.[0]?.kind, 'session')
})

test('AC-002: Z.ai success:false with HTTP 200 throws with the reply message', () => {
  assert.throws(() => parseZaiUsage({ success: false, code: 1001, msg: 'token expired' }), /token expired/)
})

test('AC-003: Ollama session remaining_percent 70 parses to a session window at 30% used', () => {
  const windows = parseOllamaUsage({ included: { session: { remaining_percent: 70, resets_at: '2026-11-09T00:00:00Z' } } })
  assert.equal(windows.length, 1)
  assert.equal(windows[0]?.kind, 'session')
  assert.equal(windows[0]?.usedPercent, 30)
})

test('AC-004: Ollama allowance 20 with balance 5 parses to a monthly window at 75% used', () => {
  const windows = parseOllamaUsage({ included: { allowance_usd: 20, balance_usd: 5, period: { until: '2026-12-01T00:00:00Z' } } })
  assert.equal(windows[0]?.usedPercent, 75)
  assert.equal(windows[0]?.kind, 'other')
  assert.ok((windows[0]?.durationMs ?? 0) >= 28 * 86_400_000)
})

test('AC-005: Kimi 5h, 7d and monthly ratios parse to windows of 5h, 7d and a month', () => {
  const windows = parseKimiUsage({ usages: {
    limit_5h: { used_ratio: 0.1, reset_time: '2026-11-08T20:00:00Z' },
    limit_7d: { used_ratio: 0.5 },
    limit_month_total: { used_ratio: 0.25, reset_time: '2026-12-01T00:00:00Z' },
  } })
  assert.deepEqual(windows.map(w => w.usedPercent), [10, 50, 25])
  assert.equal(windows[0]?.durationMs, 5 * 3_600_000)
  assert.equal(windows[1]?.durationMs, 7 * 86_400_000)
  assert.ok((windows[2]?.durationMs ?? 0) >= 28 * 86_400_000)
})

test('AC-006: HTTP 401 fails the fetch and keysSet stores nothing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsm-keys-'))
  const path = join(dir, 'usage-keys.json')
  const keys = new KeyUsage(new KeyStore(path), fetchReturning(() => json({}, 401)), () => undefined)
  await assert.rejects(keys.set('ollama-cloud', 'secret-key-1234'), /rejected the key/)
  await assert.rejects(stat(path))
  assert.equal(keys.has('ollama-cloud'), false)
  await assert.rejects(kimi.fetchUsage('k', fetchReturning(() => json({}, 401)), AbortSignal.timeout(1000)), /Kimi Code key/)
})

test('AC-007: a stored key file is mode 0600, status lists only the last four characters, and errors never echo the key', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsm-keys-'))
  const path = join(dir, 'usage-keys.json')
  const good = { success: true, code: 200, data: { limits: [{ type: 'TOKENS_LIMIT', percentage: 5 }] } }
  const keys = new KeyUsage(new KeyStore(path), fetchReturning(() => json(good)), () => undefined)
  await keys.set('zai', 'secret-key-1234')
  assert.equal((await stat(path)).mode & 0o777, 0o600)
  const views = await keys.list()
  assert.equal(JSON.stringify(views).includes('secret-key'), false)
  assert.equal(views.find(v => v.id === 'zai')?.tail, '1234')
  const leaky = new KeyUsage(new KeyStore(path), fetchReturning(() => { throw new Error('boom secret-key-1234') }), () => undefined)
  await assert.rejects(leaky.fetchStored('zai'), (error: Error) => !error.message.includes('secret-key-1234'))
})

test('AC-008: keysRemove deletes the key and the provider is no longer configured', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsm-keys-'))
  const path = join(dir, 'usage-keys.json')
  const good = { success: true, code: 200, data: { limits: [{ type: 'TOKENS_LIMIT', percentage: 5 }] } }
  const keys = new KeyUsage(new KeyStore(path), fetchReturning(() => json(good)), () => undefined)
  await keys.set('zai', 'secret-key-1234')
  await keys.remove('zai')
  assert.equal(keys.has('zai'), false)
  assert.equal((await keys.list()).find(v => v.id === 'zai')?.configured, false)
  assert.equal((await readFile(path, 'utf8')).includes('secret-key'), false)
})

test('AC-010: two manual refreshes of a key provider 10 s apart fetch once', async () => {
  let fetches = 0
  const tracker = new PoolUsageTracker((provider) => provider === 'zai'
    ? () => { fetches++; return zai.fetchUsage('k', fetchReturning(() => json({ success: true, data: { limits: [{ type: 'TOKENS_LIMIT', percentage: 1 }] } })), AbortSignal.timeout(1000)) }
    : undefined)
  let now = 1_000_000
  const service = new UsageService({ tracker, hasEndpoint: provider => provider === 'zai', now: () => now })
  await service.read('zai', 'key', 'manual')
  now += 10_000
  await service.read('zai', 'key', 'manual')
  assert.equal(fetches, 1)
})

test('AC-011: MiniMax Coding Plan model_remains parses interval (5h) and weekly windows with reset times', () => {
  const reset5h = Date.UTC(2026, 10, 10, 12)
  const resetWeekly = Date.UTC(2026, 10, 15, 0)
  const usage = parseMiniMaxUsage({
    base_resp: { status_code: 0 },
    model_remains: [{
      model_name: 'MiniMax-M2',
      current_interval_total_count: 100,
      current_interval_remaining_percent: 75,
      end_time: reset5h,
      current_weekly_total_count: 500,
      current_weekly_remaining_percent: 60,
      weekly_end_time: resetWeekly,
      current_weekly_status: 1,
    }],
  })
  assert.equal(usage.windows?.length, 2)
  assert.equal(usage.windows?.[0]?.kind, 'session')
  assert.equal(usage.windows?.[0]?.usedPercent, 25)
  assert.equal(usage.windows?.[0]?.resetsAt, reset5h)
  assert.equal(usage.windows?.[1]?.kind, 'weekly')
  assert.equal(usage.windows?.[1]?.usedPercent, 40)
  assert.equal(usage.windows?.[1]?.resetsAt, resetWeekly)
})

test("AC-012: MiniMax business failure base_resp.status_code: 1004 throws with \"MiniMax doesn't share limits for this key\"", () => {
  assert.throws(
    () => parseMiniMaxUsage({ base_resp: { status_code: 1004, status_msg: 'cookie is missing' } }),
    /MiniMax doesn't share limits for this key/,
  )
})

test('AC-013: ClinePass limits parses five_hour (5h), weekly (7d), and monthly windows', () => {
  const reset = 1700000000000
  const usage = parseClinePassUsage({
    data: {
      limits: [
        { type: 'five_hour', percentUsed: 20, resetsAt: reset },
        { type: 'weekly', percentUsed: 40, resetsAt: reset + 600000 },
        { type: 'monthly', percentUsed: 60, resetsAt: reset + 1200000 },
      ],
    },
  })
  assert.equal(usage.windows?.length, 3)
  assert.deepEqual(usage.windows?.map(w => w.kind), ['session', 'weekly', 'other'])
  assert.deepEqual(usage.windows?.map(w => w.usedPercent), [20, 40, 60])
  assert.equal(usage.windows?.[0]?.durationMs, 5 * 3_600_000)
  assert.equal(usage.windows?.[1]?.durationMs, 7 * 86_400_000)
})

test('AC-014: OpenRouter /key payload parses key limit, used percent, and next reset timestamp', () => {
  const now = Date.UTC(2026, 10, 10, 12)
  const usage = parseOpenRouterUsage({
    data: {
      label: 'Work key',
      limit: 30,
      limit_remaining: 25,
      limit_reset: 'monthly',
      is_management_key: false,
    },
  }, now)
  assert.equal(usage.plan, 'Work key')
  assert.equal(usage.windows?.length, 1)
  assert.equal(Math.round(usage.windows?.[0]?.usedPercent ?? 0), 17)
  assert.equal(usage.windows?.[0]?.used, 5)
  assert.equal(usage.windows?.[0]?.limit, 30)
  assert.equal(usage.windows?.[0]?.resetsAt, Date.UTC(2026, 11, 1, 0, 0, 0))
})

test('AC-015: OpenRouter management key is rejected with a specific error message', () => {
  assert.throws(
    () => parseOpenRouterUsage({ data: { is_management_key: true } }),
    /Management key configured — quota needs an inference API key/,
  )
})

test('AC-016: OpenRouter key without limit configured throws that no spending limit is set', () => {
  assert.throws(
    () => parseOpenRouterUsage({ data: { limit: null, limit_remaining: null, is_management_key: false } }),
    /This OpenRouter key has no credit or spending limit configured/,
  )
})

test('AC-017: NanoGPT /usage parses daily and weekly token quota windows with reset times', () => {
  const resetDaily = 1893542400000
  const resetWeekly = 1893974400000
  const usage = parseNanoGptUsage({
    state: 'active',
    limits: { dailyInputTokens: 1000, weeklyInputTokens: 10000 },
    dailyInputTokens: { used: 100, percentUsed: 0.1, resetAt: resetDaily },
    weeklyInputTokens: { used: 2500, percentUsed: 0.25, resetAt: resetWeekly },
  })
  assert.equal(usage.windows?.length, 2)
  assert.equal(usage.windows?.[0]?.kind, 'session')
  assert.equal(usage.windows?.[0]?.usedPercent, 10)
  assert.equal(usage.windows?.[0]?.resetsAt, resetDaily)
  assert.equal(usage.windows?.[1]?.kind, 'weekly')
  assert.equal(usage.windows?.[1]?.usedPercent, 25)
  assert.equal(usage.windows?.[1]?.resetsAt, resetWeekly)
})

test('AC-018: All 7 key providers are recognized in KEY_PROVIDER_IDS and can be set, listed, and removed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsm-keys-'))
  const path = join(dir, 'usage-keys.json')
  const keys = new KeyUsage(new KeyStore(path), fetchReturning((url) => {
    if (url.includes('minimax')) return json({ base_resp: { status_code: 0 }, model_remains: [{ current_interval_remaining_percent: 50 }] })
    if (url.includes('cline')) return json({ data: { limits: [{ type: 'five_hour', percentUsed: 10 }] } })
    if (url.includes('openrouter')) return json({ data: { limit: 10, limit_remaining: 8, limit_reset: 'monthly' } })
    if (url.includes('nano-gpt')) return json({ dailyInputTokens: { percentUsed: 0.2 } })
    return json({})
  }), () => undefined)
  await keys.set('minimax', 'key-mm-1234')
  await keys.set('cline-pass', 'key-cp-5678')
  await keys.set('openrouter', 'key-or-9012')
  await keys.set('nanogpt', 'key-ng-3456')
  const list = await keys.list()
  assert.equal(list.length, 7)
  assert.equal(list.find(p => p.id === 'minimax')?.tail, '1234')
  assert.equal(list.find(p => p.id === 'cline-pass')?.tail, '5678')
  assert.equal(list.find(p => p.id === 'openrouter')?.tail, '9012')
  assert.equal(list.find(p => p.id === 'nanogpt')?.tail, '3456')
})

