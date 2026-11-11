import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gaugeDetail, gaugeProviders, popoverProviders } from '../../src/client/Gauge.js'
import { currentNotice } from '../../src/client/Notice.js'
import { DEFAULT_PREFS, parsePrefs } from '../../src/client/prefs.js'
import type { UsagePreferencesView } from '../../src/client/prefs.js'
import { splitAccounts, usageKey } from '../../src/client/store.js'
import type { StoreSnapshot, UsageEntry } from '../../src/client/store.js'
import type { AccountStatus, ProviderStatus, StatusValue, UsageProviderId } from '../../src/client/rpc.js'
import { en } from '../../src/client/locales.js'
import { shownWindows, tightestWindow, windowLabel } from '../../src/client/meter.js'
import type { SubscriptionsKey } from '../../src/client/locales.js'
import type { UsageWindow } from '../../src/providers/common.js'

const H = 3_600_000
const NOW = Date.parse('2026-11-08T12:00:00Z')
const t = (key: SubscriptionsKey): string => en[key]

const account = (key: string, isDefault = false): AccountStatus => ({ key, account: `${key}@example.com`, isDefault })

function provider(accounts: AccountStatus[], servingAccount?: string): ProviderStatus {
  return { busy: false, accounts, ...servingAccount === undefined ? {} : { servingAccount } }
}

function snapshot(providers: Partial<Record<UsageProviderId, ProviderStatus>>, usage: [string, UsageEntry][] = []): StoreSnapshot {
  const all: Partial<Record<UsageProviderId, ProviderStatus>> = {
    codex: provider([]), claude: provider([]), grok: provider([]), copilot: provider([]), antigravity: provider([]),
    ...providers,
  }
  const status: StatusValue = { usageRevision: 1, keyProviders: [], providers: all }
  return { status, statusError: undefined, usage: new Map(usage), refreshing: new Set() }
}

const prefs = (over: Partial<UsagePreferencesView>): UsagePreferencesView => ({ ...DEFAULT_PREFS, ...over })

test('AC-011: the active account is the one that served last, and the rest fold', () => {
  const status = provider([account('a', true), account('b'), account('c')], 'b')
  const split = splitAccounts(status)
  assert.equal(split?.active.key, 'b')
  assert.deepEqual(split?.rest.map(a => a.key), ['a', 'c'])
})

test('AC-011: without a serving account the default account is active', () => {
  const split = splitAccounts(provider([account('a'), account('b', true)]))
  assert.equal(split?.active.key, 'b')
  assert.deepEqual(split?.rest.map(a => a.key), ['a'])
})

const metered = (status: ProviderStatus): ProviderStatus => ({ ...status, metered: true, shortName: 'X' })

test('AC-012: the gauge shows the current model\'s provider first, then the pinned ones', () => {
  const snap = snapshot({ codex: metered(provider([account('a', true)])), claude: metered(provider([account('b', true)])) })
  assert.deepEqual(gaugeProviders(prefs({}), 'claude', snap), ['claude'])
  assert.deepEqual(gaugeProviders(prefs({ pinned: ['codex'] }), 'claude', snap), ['claude', 'codex'])
  assert.deepEqual(gaugeProviders(prefs({ pinned: ['claude'] }), 'claude', snap), ['claude'])
})

test('AC-012: pinning works without a metered current model, and unsigned or unmetered providers never show', () => {
  const snap = snapshot({
    codex: metered(provider([account('a', true)])), copilot: provider([account('c', true)]), antigravity: metered(provider([])),
  })
  assert.deepEqual(gaugeProviders(prefs({ pinned: ['codex', 'antigravity', 'copilot'] }), 'copilot', snap), ['codex'])
  assert.deepEqual(gaugeProviders(prefs({}), 'deepseek', snap), [])
})

test('AC-016: with nothing shown the popover still lists every signed-in metered provider', () => {
  const snap = snapshot({ codex: metered(provider([account('a', true)])), claude: metered(provider([account('b', true)])), copilot: provider([account('c', true)]) })
  assert.deepEqual(popoverProviders([], snap), { shown: [], others: ['codex', 'claude'] })
  assert.deepEqual(popoverProviders(['claude'], snap), { shown: ['claude'], others: ['codex'] })
})

test('AC-020: the gauge takes the widest detail the box can give, and the icon when none fits', () => {
  // Unmeasured (no flex box found, or the hidden copies have not run): show everything rather than hide a window.
  assert.equal(gaugeDetail(undefined, 300, 200, 100), 'full')
  assert.equal(gaugeDetail(500, undefined, 200, 100), 'full')
  assert.equal(gaugeDetail(500, 300, 200, 100), 'full')
  assert.equal(gaugeDetail(299.4, 300, 200, 100), 'full')
  assert.equal(gaugeDetail(299, 300, 200, 100), 'tight')
  assert.equal(gaugeDetail(199, 300, 200, 100), 'current')
  assert.equal(gaugeDetail(99, 300, 200, 100), 'icon')
})

test('AC-020: a crowded gauge keeps the window that needs attention, then the fuller one', () => {
  const D = 24 * H
  // A calm session at 80% against a weekly at 40% that is over pace: state beats size.
  const calmSession: UsageWindow = { kind: 'session', usedPercent: 80 }
  const overWeekly: UsageWindow = { kind: 'weekly', usedPercent: 40, durationMs: 7 * D, resetsAt: NOW + 0.7 * 7 * D }
  assert.deepEqual(tightestWindow([calmSession, overWeekly], NOW).map(w => w.usedPercent), [40])
  // Same state: the fuller window wins.
  assert.deepEqual(tightestWindow([
    { kind: 'session', usedPercent: 25 },
    { kind: 'weekly', usedPercent: 7 },
  ], NOW).map(w => w.usedPercent), [25])
  // Same state and same use: the session window wins.
  assert.deepEqual(tightestWindow([
    { kind: 'session', usedPercent: 50 },
    { kind: 'weekly', usedPercent: 50 },
  ], NOW).map(w => w.kind), ['session'])
  // One window or none passes straight through.
  assert.deepEqual(tightestWindow([overWeekly], NOW).map(w => w.usedPercent), [40])
  assert.deepEqual(tightestWindow(undefined, NOW), [])
})

test('AC-017: windows are named by their length, falling back to kind then limit', () => {
  const D = 24 * H
  assert.equal(windowLabel(t, { kind: 'session', usedPercent: 1, durationMs: 5 * H }), '5h')
  assert.equal(windowLabel(t, { kind: 'weekly', usedPercent: 1, durationMs: 7 * D }), '7d')
  assert.equal(windowLabel(t, { kind: 'other', usedPercent: 1, durationMs: 30 * D }), '30d')
  assert.equal(windowLabel(t, { kind: 'weekly', usedPercent: 1 }), '7d')
  assert.equal(windowLabel(t, { kind: 'other', usedPercent: 1 }), 'limit')
})

test('AC-018: a pre-existing gauge:off profile keeps the composer hidden; any other legacy mode shows it', () => {
  assert.equal(parsePrefs({ usage: { gauge: 'off' } }, true).composer, false)
  assert.equal(parsePrefs({ usage: { gauge: 'pinned', pinned: ['codex'] } }, true).composer, true)
  assert.equal(parsePrefs({ usage: { composer: false, gauge: 'current' } }, true).composer, false)
  assert.equal(parsePrefs({}, true).composer, true)
})

const overWindow: UsageWindow = { kind: 'session', usedPercent: 71, durationMs: 5 * H, resetsAt: NOW + 0.72 * 5 * H }
const ready = (windows: UsageWindow[]): UsageEntry => ({ kind: 'ready', usage: { supported: true, windows }, receivedAt: NOW })

test('AC-015: a window crossing into over raises one notice that stays dismissed for that window', () => {
  const snap = snapshot({ claude: metered(provider([account('a', true)])) }, [[usageKey('claude', 'a'), ready([overWindow])]])
  const notice = currentNotice(t, snap, NOW, new Set())
  assert.ok(notice !== undefined)
  assert.equal(notice.tone, 'warn')
  assert.equal(currentNotice(t, snap, NOW, new Set([notice.id])), undefined)
  // The next window has a new reset time, so it can warn again.
  const next = snapshot({ claude: metered(provider([account('a', true)])) }, [[usageKey('claude', 'a'), ready([{ ...overWindow, resetsAt: overWindow.resetsAt! + 5 * H }])]])
  assert.notEqual(currentNotice(t, next, NOW + 5 * H, new Set([notice.id])), undefined)
})

test('AC-015: an idle account that is neither serving nor default raises no notice', () => {
  const snap = snapshot({ claude: metered(provider([account('a', true), account('b')], 'a')) }, [[usageKey('claude', 'b'), ready([overWindow])]])
  assert.equal(currentNotice(t, snap, NOW, new Set()), undefined)
})

test('CASE-006: per-model windows with the same usage and reset merge into one row named by model family', () => {
  const resetsAt = NOW + 5 * H
  const windows: UsageWindow[] = [
    { kind: 'other', scope: 'gemini-2.5-pro', usedPercent: 0, resetsAt },
    { kind: 'other', scope: 'gemini-3-flash', usedPercent: 0, resetsAt },
    { kind: 'other', scope: 'claude-opus-4-6-thinking', usedPercent: 58, resetsAt: NOW + 137 * H },
    { kind: 'other', scope: 'gpt-oss-120b-medium', usedPercent: 58, resetsAt: NOW + 137 * H },
    { kind: 'other', scope: 'tab_flash_lite_preview', usedPercent: 0 },
  ]
  const rows = shownWindows(windows)
  assert.deepEqual(rows.map(r => [r.scope, r.usedPercent]), [['Gemini', 0], ['Claude · GPT', 58]])
  assert.deepEqual(rows[1]?.models, ['claude-opus-4-6-thinking', 'gpt-oss-120b-medium'])
  // Unscoped windows are never merged.
  const plain: UsageWindow[] = [{ kind: 'session', usedPercent: 10, resetsAt }, { kind: 'weekly', usedPercent: 10, resetsAt }]
  assert.equal(shownWindows(plain).length, 2)
})

test('AC-009: a configured key provider is listed in the popover; an unconfigured one is not', () => {
  const snap = snapshot({ codex: metered(provider([account('a', true)])), zai: metered(provider([account('key', true)])) })
  assert.deepEqual(popoverProviders([], snap).others.sort(), ['codex', 'zai'])
  assert.deepEqual(popoverProviders([], snapshot({ codex: metered(provider([account('a', true)])) })).others, ['codex'])
})
