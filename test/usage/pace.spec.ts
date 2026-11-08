import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayPercent, pace } from '../../src/usage/pace.js'
import type { UsageWindow } from '../../src/providers/common.js'

const H = 3_600_000
const NOW = Date.parse('2026-11-08T12:00:00Z')

/** A window with `elapsed` share of `durationMs` passed at NOW. */
function windowAt(usedPercent: number, elapsed: number, durationMs = 5 * H): UsageWindow {
  return { kind: 'session', usedPercent, durationMs, resetsAt: NOW + (1 - elapsed) * durationMs }
}

test('AC-002: pace is over with emptyAt when 71% is used at 28% of a 5 h window', () => {
  const result = pace(windowAt(71, 0.28), NOW)
  assert.equal(result.state, 'over')
  if (result.state !== 'over') return
  assert.ok(Math.abs(result.projectedPercent - 71 / 0.28) < 1e-9)
  // 29% left at 71% per 1.4 h of elapsed time empties in about 34 minutes.
  const minutes = (result.emptyAt - NOW) / 60_000
  assert.ok(minutes > 33 && minutes < 36, `empties in ${minutes} min`)
})

test('AC-003: pace is calm with no projection before 20% of the window has elapsed', () => {
  const result = pace(windowAt(60, 0.1), NOW)
  assert.equal(result.state, 'calm')
  assert.equal('projectedPercent' in result ? result.projectedPercent : undefined, undefined)
})

test('BR-002: projected use above 85% is tight, at most 85% is calm, 100% used is out', () => {
  assert.equal(pace(windowAt(45, 0.5), NOW).state, 'tight')
  assert.equal(pace(windowAt(40, 0.5), NOW).state, 'calm')
  assert.equal(pace(windowAt(100, 0.5), NOW).state, 'out')
})

test('BR-001: usage under 3% never forecasts, even late in the window', () => {
  assert.equal(pace(windowAt(2, 0.9), NOW).state, 'calm')
})

test('CASE-002: a window without reset time shows plain percent with no tick', () => {
  const result = pace({ kind: 'weekly', usedPercent: 40 }, NOW)
  assert.deepEqual(result, { state: 'calm', usedPercent: 40 })
})

test('AC-013: switching Left to Used shows 21% instead of 79% for a window at 21% used', () => {
  const window = windowAt(21, 0.4)
  assert.equal(displayPercent(window, 'left'), 79)
  assert.equal(displayPercent(window, 'used'), 21)
})

test('pace reports unknown for a non-finite percent', () => {
  assert.deepEqual(pace({ kind: 'session', usedPercent: Number.NaN }, NOW), { state: 'unknown' })
  assert.equal(displayPercent({ kind: 'session', usedPercent: Number.NaN }, 'left'), undefined)
})
