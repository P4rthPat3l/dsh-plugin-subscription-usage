/**
 * The Claude cache lifetime: Config -> resolved TTL -> request body and beta
 * header, plus the degradation path when the endpoint rejects one-hour
 * caching. Body assembly itself is covered in models.spec.ts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import './keep-alive.js'
import { MessageId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { ClaudeAdapter, CLAUDE_BETA_FALLBACK, EXTENDED_CACHE_TTL_BETA } from '../src/providers/claude.js'
import { AccountTokenManager } from '../src/providers/accounts.js'
import { isClaudeSubagentSession, readClaudePromptCacheTtl, resolveClaudePromptCacheTtl } from '../src/provider-settings.js'
import type { ClaudeSession } from '../src/auth/store.js'
import type { PromptCacheTtl } from '../src/translate/anthropic.js'

// The compaction and session-title plugins declare these purposes at runtime;
// this test has neither installed, so it declares the one it exercises.
declare module '@deepseek-ai/dsh-llm' {
  interface LlmRequestPurposeMap {
    'compaction': true
  }
}

const session: ClaudeSession = { accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3_600_000, scopes: 'scope' }
const SessionId = (id: string): NonNullable<GenerateOptions['sessionId']> => id as NonNullable<GenerateOptions['sessionId']>

function tokens(): AccountTokenManager<ClaudeSession> {
  return new AccountTokenManager<ClaudeSession>({
    provider: 'claude',
    displayName: 'Test',
    makeOptions: () => ({ preemptMs: 0, refresh: s => Promise.resolve(s), isPermanent: () => false }),
    io: {
      list: () => Promise.resolve([{ key: 'acct', session }]),
      get: () => Promise.resolve(session),
      save: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    },
  })
}

interface Sent {
  body: Record<string, unknown>
  beta: string
}

interface Capture {
  calls: Sent[]
  restore: () => void
}

/** Replace global fetch for one test and record every request the adapter POSTs. */
function captureFetch(respond: (call: number) => { status: number; body: string }): Capture {
  const calls: Sent[] = []
  const original = globalThis.fetch
  let index = 0
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers as HeadersInit)
    calls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown>, beta: headers.get('anthropic-beta') ?? '' })
    const next = respond(index++)
    return new Response(next.body, { status: next.status, headers: { 'content-type': 'application/json' } })
  }) as typeof globalThis.fetch
  return { calls, restore: () => { globalThis.fetch = original } }
}

interface SentOptions {
  promptCacheTtl?: PromptCacheTtl
  override?: (sessionId?: GenerateOptions['sessionId']) => PromptCacheTtl | undefined
  purpose?: GenerateOptions['purpose']
  sessionId?: GenerateOptions['sessionId']
  onWarn?: (message: string) => void
}

function adapter(options: SentOptions): ClaudeAdapter {
  return new ClaudeAdapter({
    models: [{ id: 'claude-opus-5-5', name: 'Claude Opus 5.5' }],
    streamIdleTimeoutMs: 1000,
    tokens: tokens(),
    discovery: false,
    resolveCliVersion: async () => '2.1.999',
    ...options.promptCacheTtl === undefined ? {} : { promptCacheTtl: options.promptCacheTtl },
    ...options.override === undefined ? {} : { promptCacheTtlOverride: options.override },
    ...options.onWarn === undefined ? {} : { onWarn: options.onWarn },
  })
}

async function run(instance: ClaudeAdapter, options: SentOptions = {}): Promise<void> {
  const generate: GenerateOptions = {
    provider: 'claude',
    model: 'claude-opus-5-5',
    system: 'be brief',
    messages: [{ id: MessageId('m'), role: 'user', content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } }],
    maxTokens: 1_000,
    ...options.purpose === undefined ? {} : { purpose: options.purpose },
    ...options.sessionId === undefined ? {} : { sessionId: options.sessionId },
  }
  for await (const _chunk of instance.stream(generate)) { /* drain */ }
}

/** Send one turn against a 400 reply and return the body and beta it sent. */
async function sent(options: SentOptions = {}): Promise<Sent> {
  const capture = captureFetch(() => ({
    status: 400,
    body: JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'stop here' } }),
  }))
  try {
    await assert.rejects(run(adapter(options), options))
    assert.equal(capture.calls.length, 1)
    return capture.calls[0]
  } finally {
    capture.restore()
  }
}

const markers = (turn: Sent): unknown[] =>
  [...(turn.body.system as Record<string, unknown>[]), ...(turn.body.messages as { content: Record<string, unknown>[] }[]).flatMap(entry => entry.content)]
    .filter(block => block.cache_control !== undefined)
    .map(block => block.cache_control)

const hasExtendedBeta = (beta: string): boolean => beta.split(',').includes(EXTENDED_CACHE_TTL_BETA)

test('AC-004: a Claude turn sends five-minute cache marks and no extended beta unless told otherwise', async () => {
  for (const ttl of [undefined, '5m'] as const) {
    const turn = await sent(ttl === undefined ? {} : { promptCacheTtl: ttl })
    assert.deepEqual(markers(turn), [{ type: 'ephemeral' }, { type: 'ephemeral' }], `promptCacheTtl=${String(ttl)}`)
    assert.equal(turn.beta, CLAUDE_BETA_FALLBACK, 'the beta header stays byte-identical to the current release')
  }
})

test('AC-001: a Claude turn sends one-hour marks and the extended beta when configured for them', async () => {
  const turn = await sent({ promptCacheTtl: '1h' })
  assert.deepEqual(
    markers(turn),
    [{ type: 'ephemeral', ttl: '1h' }, { type: 'ephemeral', ttl: '1h' }],
    'both the tools+system mark and the conversation tail mark carry the one-hour TTL',
  )
  assert.equal(hasExtendedBeta(turn.beta), true)
  assert.ok(turn.beta.startsWith(CLAUDE_BETA_FALLBACK))
})

test('AC-005: the per-turn override beats the configured value and receives the session id', async () => {
  const oneHour = [{ type: 'ephemeral', ttl: '1h' }, { type: 'ephemeral', ttl: '1h' }]
  const fiveMinutes = [{ type: 'ephemeral' }, { type: 'ephemeral' }]
  let seen: string | undefined
  const override = (sessionId?: GenerateOptions['sessionId']): PromptCacheTtl => {
    seen = sessionId === undefined ? undefined : String(sessionId)
    return '1h'
  }
  assert.deepEqual(markers(await sent({ promptCacheTtl: '5m', override, sessionId: SessionId('sess-1') })), oneHour)
  assert.equal(seen, 'sess-1', 'the host needs the id to pick the subagent bucket')
  assert.deepEqual(markers(await sent({ promptCacheTtl: '1h', override: () => '5m' })), fiveMinutes, 'override 5m over config 1h')
  assert.deepEqual(markers(await sent({ promptCacheTtl: '1h', override: () => undefined })), oneHour, 'no override follows config')
})

test('AC-005: a later save applies without rebuilding the adapter', async () => {
  let current: PromptCacheTtl | undefined
  const instance = adapter({ promptCacheTtl: '5m', override: () => current })
  const capture = captureFetch(() => ({
    status: 400,
    body: JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'stop here' } }),
  }))
  try {
    await assert.rejects(run(instance))
    current = '1h'
    await assert.rejects(run(instance))
    assert.equal(capture.calls.length, 2)
    assert.deepEqual(markers(capture.calls[0]), [{ type: 'ephemeral' }, { type: 'ephemeral' }])
    assert.deepEqual(markers(capture.calls[1]), [{ type: 'ephemeral', ttl: '1h' }, { type: 'ephemeral', ttl: '1h' }])
  } finally {
    capture.restore()
  }
})

test('AC-003: auxiliary requests stay on five minutes even when one hour is configured', async () => {
  const turn = await sent({ promptCacheTtl: '1h', purpose: 'compaction' })
  assert.deepEqual(markers(turn), [{ type: 'ephemeral' }, { type: 'ephemeral' }])
  assert.equal(hasExtendedBeta(turn.beta), false)
})

test('AC-006: a rejected one-hour request retries at five minutes, warns once, and stays degraded', async () => {
  const capture = captureFetch(call => ({
    status: 400,
    body: JSON.stringify({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: call === 0
          ? "Unexpected value(s) `extended-cache-ttl-2025-04-11` for the `anthropic-beta` header."
          : 'second failure',
      },
    }),
  }))
  const warnings: string[] = []
  const instance = adapter({ promptCacheTtl: '1h', onWarn: message => { warnings.push(message) } })
  try {
    await assert.rejects(run(instance), /second failure/)
    assert.equal(capture.calls.length, 2, 'one retry after the rejection')
    assert.equal(hasExtendedBeta(capture.calls[0].beta), true, 'the first attempt used the extended beta')
    assert.equal(hasExtendedBeta(capture.calls[1].beta), false, 'the retry dropped the beta')
    assert.equal(JSON.stringify(capture.calls[1].body).includes('"ttl"'), false, 'the retry dropped the one-hour marks')
    assert.equal(warnings.length, 1, 'one warning per rejection')

    await assert.rejects(run(instance), /second failure/)
    assert.equal(capture.calls.length, 3, 'later requests do not retry the rejected one-hour attempt')
    assert.equal(hasExtendedBeta(capture.calls[2].beta), false)
    assert.equal(JSON.stringify(capture.calls[2].body).includes('"ttl"'), false)
    assert.equal(warnings.length, 1, 'the warning is not repeated')
  } finally {
    capture.restore()
  }
})

test('CASE-003: a 400 that does not name the cache fields surfaces without a retry', async () => {
  const capture = captureFetch(() => ({
    status: 400,
    body: JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'model not found' } }),
  }))
  const instance = adapter({ promptCacheTtl: '1h' })
  try {
    await assert.rejects(run(instance), /model not found/)
    assert.equal(capture.calls.length, 1)
  } finally {
    capture.restore()
  }
})

test('AC-001/AC-002/CASE-001/CASE-006/CASE-007: auto picks the bucket from the live session header', () => {
  const bucket = (header: Parameters<typeof isClaudeSubagentSession>[0]): string =>
    resolveClaudePromptCacheTtl('auto', isClaudeSubagentSession(header))
  assert.equal(bucket(undefined), '5m', 'CASE-001: an unknown session stays conservative')
  assert.equal(bucket({ origin: 'subagent' }), '5m', 'AC-002: a subagent session')
  assert.equal(bucket({ delegationDepth: 2 }), '5m', 'CASE-007: a nested subagent')
  assert.equal(bucket({}), '1h', 'AC-001: a top-level main session')
  assert.equal(bucket({ delegationDepth: 0 }), '1h', 'CASE-006: a top-level fork keeps the main bucket')
  assert.equal(resolveClaudePromptCacheTtl('5m', false), '5m')
  assert.equal(resolveClaudePromptCacheTtl('1h', true), '1h')
})

test('AC-007: readClaudePromptCacheTtl accepts the three values and rejects the rest', () => {
  assert.equal(readClaudePromptCacheTtl(undefined), 'auto', 'the Config default')
  for (const value of ['auto', '5m', '1h'] as const) assert.equal(readClaudePromptCacheTtl(value), value)
  for (const value of ['2h', '1H', '60m', '', 3600, true]) {
    assert.throws(() => readClaudePromptCacheTtl(value), /claudePromptCacheTtl/, `rejects ${JSON.stringify(value)}`)
  }
})

test('AC-006/CASE-004: a 403 or 422 rejection with the beta wording also retries at five minutes', async () => {
  for (const [status, message] of [
    [422, "Unexpected value(s) `extended-cache-ttl-2025-04-11` for the `anthropic-beta` header."],
    [403, 'extended-cache-ttl is not enabled for this account'],
    [400, 'cache_control: Extra inputs are not permitted'],
  ] as const) {
    const capture = captureFetch(call => ({
      status: call === 0 ? status : 400,
      body: JSON.stringify({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: call === 0 ? message : 'second failure',
        },
      }),
    }))
    const instance = adapter({ promptCacheTtl: '1h' })
    try {
      await assert.rejects(run(instance), /second failure/, `status ${status} should retry`)
      assert.equal(capture.calls.length, 2, `status ${status}: one retry`)
      assert.equal(hasExtendedBeta(capture.calls[0].beta), true)
      assert.equal(hasExtendedBeta(capture.calls[1].beta), false)
      assert.equal(JSON.stringify(capture.calls[1].body).includes('"ttl"'), false)
    } finally {
      capture.restore()
    }
  }
})
