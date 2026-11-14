---
doc_type: research
title: Keeping provider prompt caches warm, feasibility across Claude, Codex, Grok, Copilot and Antigravity
status: research
created: 2026-11-12
last_updated: 2026-11-12
owner: Parth Patel
scope: dsh-plugin-subscription-usage 0.3.2, installed DSH 0.2.2 build
tags:
  - prompt-cache
  - claude
  - codex
  - cost
---

# Keeping provider prompt caches warm

Research only at the time of writing. The question: can this plugin keep a session's provider prompt cache warm, so a 5 to 6 minute wait for a subagent does not end in a 0% cache hit and a full-price prompt rewrite?

Implementation update, 2026-11-12: option A is implemented as [FEAT-004](../features/FEAT-004-claude-prompt-cache-lifetime.md). The live wire check is pending because the Claude usage limit was exhausted.

## Answer

For Claude, yes, and most of the fix already exists in the plugin. The plugin marks Anthropic cache breakpoints and has a `claudePromptCacheTtl` option (`5m` or `1h`). It defaults to `5m`, which is why a 5 to 6 minute idle wait loses the cache. Two changes close the gap for Claude without any extra requests: send the missing `extended-cache-ttl-2025-04-11` beta value when the 1 hour TTL is selected, and pick the TTL per session the way Claude Code does, 1 hour for the main conversation and 5 minutes for subagents.

The other providers do not justify a warming feature now:

- ChatGPT/Codex: local sessions kept reading cache across 6, 7 and 8 minute gaps. The ChatGPT backend TTL is undocumented and not controllable. Measure before building anything.
- Grok: automatic caching with no TTL guarantee and no cache-touch request. A replay might help, but every replay spends subscription quota.
- Copilot: documented inactivity TTL is 1 hour for most models and 24 hours for OpenAI models. A 5 minute wait is not what causes a 0% hit there.
- Antigravity (Gemini through the Cloud Code endpoint): implicit caching only. The TTL and explicit cache API are not available on the subscription path.
- Z.ai, Ollama Cloud and Kimi Code are usage-metered providers in this plugin, not routed model providers. A warm loop in this plugin cannot affect them. Kimi's API does have a 5m/1h TTL option, but the plugin does not send Kimi traffic.

An idle keep-warm loop is technically feasible in this plugin with no DSH core change. DSH exposes the exact last agent request at the `llm/stream` waterfall and has an official idle slot, `agent.runMaintenance`. A shipped DSH plugin already replays a byte-identical prefix for compaction. The loop would be roughly 100 to 200 lines, default off, and only worth shipping where the cache cannot be configured or the gap can exceed the TTL. For Claude, the 1 hour TTL is simpler and more reliable than pinging.

## What the local sessions show

I decoded the compressed session logs in `~/.dsh/sessions` and summed the usage records reported by the plugin's translators. The sample covers 1,146 Claude turns across many sessions.

| Measure | Value |
|---|---|
| Claude turns sampled | 1,146 |
| Cache read tokens | 255.66M |
| Cache write tokens | 8.35M |
| Turns after a gap over 5 minutes with 0 cache read and a full rewrite | 16 |
| Tokens rewritten by those 16 turns | 3.70M |
| Share of weighted Claude input cost burned by those rewrites | 12.3% |

The gaps were 6, 6, 7, 7, 7, 7, 10, 11, 12, 16, 18, 32 and 37 minutes, plus three long resumes at 95, 696 and 1,278 minutes. The cost concentrates in long contexts. One 7 minute wait rewrote 575,636 tokens. Another rewrote 297,286. A 12 minute wait rewrote 245,047. That is the exact failure in the report: short agentic waits, large context, no cache read.

Weighted cost assumes input 1x, cache read 0.1x, cache write 1.25x and output 1x. Opus 5.5 cache reads are actually 0.05x, so the rewrite share is slightly higher than shown. The model is an API-price equivalent, not a subscription quota measurement.

The same logs show no idle expiry for the other routed providers in this sample:

- Codex: 5 gaps over 4 minutes; 6, 7 and 8 minute gaps still had cache reads. No full rewrite.
- Ollama (the harness's own model provider): 53 gaps over 4 minutes; no zero-cache full rewrite. An 8 minute gap still read 562,560 cached tokens.
- Copilot: 10 gaps over 4 minutes, 3 of them with no cache read at 6 and 8 minutes, but Copilot documents a 1 hour inactivity TTL, so those turns more likely changed the prefix or started a new conversation.
- Antigravity: 5 gaps over 4 minutes. The 4 minute gap read 19,237 cached tokens, the longer gaps showed no cache read. The sample is too small to separate idle expiry from requests that never cache.

## Why the 5 minute default loses

Anthropic's cache lifetime starts when the request reaches the API, not when the response finishes. The default is 5 minutes, and a cache hit refreshes the entry for free. A wait longer than 5 minutes therefore guarantees a miss. The 1 hour TTL exists for exactly this case. Writes cost 2x base input instead of 1.25x, reads stay at 0.1x, and the 1 hour path is requested with `cache_control: {type: "ephemeral", ttl: "1h"}`.

The plugin already builds four breakpoints per request, one on the tools plus system block and up to three across the history, so the cache structure is in place. The remaining defects are the beta value and the default choice.

### The 1 hour option is present but incomplete

| Piece | Where |
|---|---|
| Config field `claudePromptCacheTtl: '5m' \| '1h'`, default `5m` | [src/index.ts:189](../src/index.ts), [src/index.ts:265](../src/index.ts) |
| Adapter option and per-request override | [src/providers/claude.ts:575-583](../src/providers/claude.ts), [src/providers/claude.ts:897-898](../src/providers/claude.ts), [src/index.ts:1054-1055](../src/index.ts) |
| TTL applied to every mark | [src/translate/anthropic.ts:57-71](../src/translate/anthropic.ts), [src/translate/anthropic.ts:260-311](../src/translate/anthropic.ts) |
| Per-provider preference `promptCacheTtl` | [src/provider-settings.ts:41](../src/provider-settings.ts), [src/provider-settings.ts:127](../src/provider-settings.ts), [src/provider-settings.ts:204](../src/provider-settings.ts) |
| Tests only assert the body markers | [test/claude-cache-ttl.spec.ts](../test/claude-cache-ttl.spec.ts) |

Two gaps remain.

First, the OAuth request path never sends the beta value for 1 hour caching. `CLAUDE_BETA_FALLBACK` in [src/providers/claude.ts:173-182](../src/providers/claude.ts) lists the flags the plugin presents as Claude Code, and it does not include `extended-cache-ttl-2025-04-11`. Claude Code's own binary version 2.1.319 contains that exact string, and the Claude Code gateway docs state that on the Anthropic Messages path the one-hour TTL travels in `anthropic-beta` and the gateway must forward it. Without it, the 1 hour option may be ignored or rejected. That has not been tested against the live endpoint yet.

Second, the Claude Code behavior the plugin should copy is per bucket: main conversation gets 1 hour on a subscription within included usage, while subagents, compaction and session titles get 5 minutes. The plugin already forces auxiliary requests to 5 minutes through `options.purpose` ([src/providers/claude.ts:630](../src/providers/claude.ts)), so only the main versus subagent split is missing. `GenerateOptions.sessionId` is available to the adapter, and the plugin's host can resolve delegation depth through DSH's session or agent services, so the override callback can become session-aware.

The per-provider preference already exists in the settings API, and the RPC returns `promptCacheTtlDefault` for the UI ([src/index.ts:1453](../src/index.ts)). The Claude manage panel in [src/client/ProviderCard.tsx](../src/client/ProviderCard.tsx) has no control for it. So today the usable knob is the plugin config field, and it is not documented in the README or feature doc.

## What the harness allows

These facts come from the installed DSH 0.2.2 build (`/opt/DSH NEXT/resources/app.asar`) and the pinned `@deepseek-ai/dsh-llm` types.

- Adapter contract: `stream(options: GenerateOptions): AsyncIterable<StreamChunk>`. `GenerateOptions` carries provider, model, messages, tools, system, maxTokens, reasoningEffort, sessionId and purpose. The adapter sees the full derived history and the session id, but no turn timing.
- The exact agent request is observable at the public `llm/stream` waterfall, and `isAgentLoopRequest()` filters out auxiliary calls. A plugin can capture the last loop request per session without touching private state.
- The exact request is also reconstructible from the session log: `requestHeader().config` plus `deriveMessages()`, `toolHistory()` and `tools`. The compaction plugin already replays that envelope byte for byte so its summarisation request reads the warm prefix.
- Idle is a real state: the subagent tool returns immediately, the parent turn ends, `agent/status` becomes `idle`, and the parent session stays live until the child's notice arrives. The supported idle hook is `agent.runMaintenance(task)`, which keeps public status idle while it runs and is already used for idle compaction.
- `ctx.llm.stream()` has no turn gate and can be called from a host plugin. Breaking the iteration closes the provider stream.
- The plugin already uses raw timers under `ctx.effect` ([src/index.ts:1474-1500](../src/index.ts)), so a warm timer needs no new dependency.
- Cache reporting already works: the client computes cache hit from `cacheReadTokens` over prompt tokens, and the plugin's translators map cache read and cache write tokens. A warm request appends no assistant message, so it does not move the visible accounting, but the next real request shows the refreshed hit.

## Design options

### Option A: Claude TTL parity (recommended first)

Small patch, no new traffic:

1. Add `extended-cache-ttl-2025-04-11` to `anthropic-beta` when the resolved TTL is `1h`. Keep sending the current flags otherwise, so a 5 minute session is byte-identical to today. If the live endpoint returns `400 Unexpected value(s)` for that beta, keep the `ttl` field and drop the beta, because the direct API documents the field without it; Claude Code 2.1.319 does send it.
2. Resolve the TTL per session bucket: main conversation `1h`, subagent sessions `5m`, auxiliary requests `5m`. This requires passing `sessionId` into the override callback and looking up delegation depth in the host.
3. Add a TTL control to the Claude manage panel and document it. The preference field and RPC value already exist.
4. Parse the 1 hour versus 5 minute cache-write breakdown from usage (`ephemeral_1h_input_tokens` and `ephemeral_5m_input_tokens`) so the choice is visible and testable.

Cost: 1 hour writes cost 2x instead of 1.25x on new tokens. In the sampled sessions, 13 of the 16 rewrites happened after gaps under an hour, so the 1 hour TTL covers those and leaves the 95, 696 and 1,278 minute resumes alone. That is 4.93M tokens carrying the extra 0.75x write rate, against 3.42M tokens of avoided rewrites. The API-price equivalent is about 0.6% lower overall in this sample, and positive per session for any session that actually pauses past 5 minutes. On a subscription, Claude Code itself already uses this policy within included usage and drops to 5 minutes only when drawing on usage credits, so matching it is defensible.

### Option B: idle keep-warm replay (the feature asked for)

An OpenCode-style loop. OpenCode documents this as a first-class feature: warming is off by default, the interval is 90% of the model's cache TTL (4 minutes when unknown), the window is 30 minutes from the last real request, warm requests are real billed calls, a warm request that misses stops warming for that session, and subagent sessions are not warmed. OpenChamber ships the same idea with a hard-coded 4 minute interval.

A DSH version:

1. Capture the last loop request per session from the `llm/stream` waterfall, or rebuild it from the session log.
2. On `agent/status` idle, arm a timer at 90% of the known TTL, 4 to 4.5 minutes for Claude.
3. On fire, run inside `agent.runMaintenance` with a hard 5 to 15 second timeout. Replay the captured request through `ctx.llm.stream`, read the first chunk, then close the stream. The adapter rebuilds a byte-identical body, so the prefix reads from cache and refreshes the TTL. The request is aborted before real output is billed.
4. Re-arm while the session stays idle, up to a configured window and count. Disarm on a new loop request, on agent running, on abort, or on session dispose.
5. Skip requests with images or file references, because their bytes are resolved per request. Skip auxiliary purposes. Keep the replay's `purpose` absent, because a defined purpose changes Claude's cache marks to 5 minutes.
6. Detect a miss from the warm request's usage, and stop warming that session if cache read is zero and cache write is non-zero.

For Claude specifically, the documented `max_tokens: 0` pre-warm is cleaner than replay plus abort. It returns without generating output. It cannot be used when the real request uses `thinking.type: "enabled"`, and it must reuse the same thinking and effort configuration because those values are rendered into the prompt. Newer models in this plugin resolve to adaptive thinking when discovery reports it. The docs do not list adaptive as rejected, but that pair is not verified.

Cost and risk: every warm request is billed, counts against rate limits, and does not appear in session accounting. `runMaintenance` delays a real user prompt until the warm call finishes, so the timeout must be short. Byte identity is necessary but not proven sufficient for a hit across accounts, beta header sets or provider routing. Pool failover can switch accounts, and cache domains differ per account. None of this can be verified from docs; it needs one live measurement per provider.

### Option C: other providers

Do not build now. Codex already shows cache reads across 6 to 8 minute gaps in local data, the ChatGPT backend TTL is undocumented, and the public API's `prompt_cache_options.ttl` and prewarm fields are not documented for that backend. Grok has no TTL guarantee and no cache-touch request. Copilot's documented TTL is longer than the reported gap and has no control surface. Antigravity is implicit-only with no TTL or cache object on the subscription path.

If the feature is built for Claude, the loop is provider-agnostic by construction, so enabling Codex or Grok later is a config flag plus a measurement, not new plumbing.

## Cost comparison on the sampled Claude sessions

Weighted token equivalents, using the plugin's reported usage and the 0.1x read assumption. Actual 37.68M. The 1 hour TTL covers the 13 gaps under an hour and costs 37.44M. Warm replay costs 34.55M with 34 pings over those same 13 gaps, capped at 60 minutes.

| Scenario | Weighted cost | Change | Notes |
|---|---|---|---|
| Current 5m | 37.68M | baseline | 16 full rewrites |
| 1h TTL | 37.44M | -0.6% | 13 rewrites avoided, extra write rate on every turn, 3 long resumes still rewrite |
| Warm replay | 34.55M | -8.3% | assumes every ping hits and bills only a cache read |

The warm replay looks cheaper because it keeps the 1.25x write rate and pays only reads while idle. That advantage depends on pings hitting, on the aborted request refreshing the TTL, and on subscription quota weighting cache reads the way API pricing does. None of those three is proven for the Claude subscription path. The 1 hour TTL depends on one documented beta value and one config decision.

## Recommendation

1. Ship Option A first. It is a small, testable patch that removes the reported loss for waits under an hour and matches Claude Code's own default policy.
2. Verify it live when the account is not rate limited. The research attempt returned HTTP 429 on the first request, so the beta value, the 1 hour accounting and a 6 minute cache hit are still unverified on the wire. The verification is two small requests plus a six minute wait, and it can read `ephemeral_1h_input_tokens` from the response.
3. Decide on Option B after that. Build it only if the 1 hour path is rejected on the subscription endpoint, if runs regularly pause longer than an hour, or if Codex turns out to expire too. Scope it to a config-gated Claude warm loop first, off by default.
4. Do not build warming for Codex, Grok, Copilot or Antigravity yet. Add measurement instead: keep reporting `cached_tokens` per turn and watch the next real sessions.

## Open questions

- Does the Claude Code OAuth endpoint accept `extended-cache-ttl-2025-04-11` on the request, and is the 1 hour TTL billed as 1 hour writes? Needs a live request.
- Does a warm request that is aborted after the first chunk still refresh the cache TTL? Needs a live request with a 6 minute gap.
- Does the subscription usage limit count cache reads at the same weight as API pricing? Not documented publicly; affects whether warming saves quota or only shifts it.
- Can the plugin resolve main versus subagent sessions reliably through DSH's session or agent services for the per-bucket TTL? The session header carries delegation depth, so this looks possible, but it needs a small adapter option change.
- Which exact `extended-cache-ttl` beta value is current? `extended-cache-ttl-2025-04-11` is present in Claude Code 2.1.319 and is the value to try first. The public beta reference does not list it because 1 hour caching is generally available on the direct API.

## Sources

Anthropic prompt caching and pre-warm: https://platform.claude.com/docs/en/build-with-claude/prompt-caching

Anthropic cache diagnostics: https://platform.claude.com/docs/en/build-with-claude/cache-diagnostics

Claude Code prompt caching, TTL buckets and verification: https://code.claude.com/docs/en/prompt-caching

Claude Code gateway compatibility, beta forwarding for the one-hour TTL: https://code.claude.com/docs/en/llm-gateway-protocol

OpenCode session warming: https://opencode.ai/docs/warming/

OpenChamber warming source: https://github.com/openchamber/openchamber/blob/main/packages/web/server/lib/session-warming/runtime.js

OpenAI prompt caching: https://developers.openai.com/api/docs/guides/prompt-caching

xAI prompt caching: https://docs.x.ai/developers/advanced-api-usage/prompt-caching

GitHub Copilot cache preservation: https://docs.github.com/en/copilot/tutorials/optimize-ai-usage

Gemini caching: https://ai.google.dev/gemini-api/docs/caching

Kimi context caching: https://platform.kimi.ai/docs/guide/context-caching

Z.ai cache: https://docs.z.ai/guides/capabilities/cache

Ollama Cloud usage: https://docs.ollama.com/api/cloud-usage
