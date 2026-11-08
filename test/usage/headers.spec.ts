import { test } from 'node:test'
import assert from 'node:assert/strict'
import { usageWindowsFromHeaders } from '../../src/usage/headers.js'

test('AC-004: Codex primary used-percent 34 with a 300-minute window parses to a 5 h session window at 34%', () => {
  const windows = usageWindowsFromHeaders('codex', new Headers({
    'x-codex-primary-used-percent': '34',
    'x-codex-primary-window-minutes': '300',
    'x-codex-primary-reset-at': '1794160602',
    'x-codex-secondary-used-percent': '100',
    'x-codex-secondary-window-minutes': '10080',
    'x-codex-secondary-reset-at': '1794373058',
  }))
  assert.deepEqual(windows, [
    { kind: 'session', usedPercent: 34, durationMs: 5 * 3_600_000, resetsAt: 1794160602_000 },
    { kind: 'weekly', usedPercent: 100, durationMs: 7 * 24 * 3_600_000, resetsAt: 1794373058_000 },
  ])
})

test('AC-005: Claude 7d utilization 0.46 parses to a weekly window at 46%', () => {
  const windows = usageWindowsFromHeaders('claude', new Headers({
    'anthropic-ratelimit-unified-5h-utilization': '0.56',
    'anthropic-ratelimit-unified-5h-reset': '1794144000',
    'anthropic-ratelimit-unified-7d-utilization': '0.46',
    'anthropic-ratelimit-unified-7d-reset': '1794542400',
  }))
  assert.equal(windows.length, 2)
  assert.equal(windows[1]?.kind, 'weekly')
  assert.ok(Math.abs((windows[1]?.usedPercent ?? 0) - 46) < 1e-9)
  assert.equal(windows[1]?.resetsAt, 1794542400_000)
  assert.equal(windows[0]?.durationMs, 5 * 3_600_000)
})

test('SEC-003: headers without usage fields produce no windows', () => {
  assert.deepEqual(usageWindowsFromHeaders('codex', new Headers({ 'x-codex-turn-state': 'opaque', 'x-codex-plan-type': 'plus' })), [])
  assert.deepEqual(usageWindowsFromHeaders('claude', new Headers({ 'anthropic-ratelimit-unified-5h-utilization': 'n/a' })), [])
})
