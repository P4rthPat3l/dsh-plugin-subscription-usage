import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime } from '@deepseek-ai/dsh-llm'
import '../keep-alive.js'
import * as plugin from '../../src/index.js'
import { directoryEntries } from '../../src/models-directory.js'

test('AC-001: each enabled provider is a configurable provider under the plugin namespace', async () => {
  const home = await mkdtemp(join(tmpdir(), 'models-directory-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const ctx = new Context()
  const llm = new LlmRuntime(ctx)
  try {
    const runtime = ctx.plugin(plugin, { providers: ['codex', 'claude', 'grok'] })
    await new Promise(resolve => setTimeout(resolve, 20))
    const rows = llm.listConfigurableProviders()
    assert.deepEqual(rows.map(row => [row.provider, row.displayName]), [
      ['codex', 'ChatGPT (Codex)'], ['claude', 'Claude'], ['grok', 'Grok'],
    ])
    // Without a Loader entry the namespace falls back to the package name.
    assert.ok(rows.every(row => row.settingsNs === 'dsh-subscription-models'))
    assert.ok(rows.every(row => row.nativeAuth?.oauth === true && row.nativeAuth.env.length === 0))
    await runtime.dispose()
    assert.deepEqual(llm.listConfigurableProviders(), [])
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous
    await rm(home, { recursive: true, force: true })
  }
})

test('AC-001: directory entries keep provider order and the given namespace', () => {
  const entries = directoryEntries(['copilot', 'antigravity'], 'subscription-models')
  assert.deepEqual(entries.map(entry => [entry.provider, entry.settingsNs, entry.settingsPath]), [
    ['copilot', 'subscription-models', []], ['antigravity', 'subscription-models', []],
  ])
})
