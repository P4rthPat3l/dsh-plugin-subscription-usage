---
doc_type: feature
feature_id: FEAT-002
title: API key usage providers (Z.ai, Ollama Cloud, Kimi Code)
status: active
implementation_status: shipped_unverified
owner: Parth Patel
created: 2026-11-08
last_updated: 2026-11-08
last_verified_commit: null
version: 0.1.0
tags:
  - dsh-plugin
  - subscriptions
  - usage
related_features:
  - FEAT-001
---

# API key usage providers

> The Usage page shows limits for Z.ai, Ollama Cloud and Kimi Code. The user pastes an API key per provider and the plugin reads only usage with it. These providers are usage-only: no sign-in flow, no model routing.

## 1. Feature Snapshot

| Field | Details |
|---|---|
| Document status | Active |
| Implementation status | Built and unit tested; not run against real keys or in the GUI |
| Trigger | Opening Settings, Usage; clicking Refresh |
| Outcome | Percent-used meters with reset times for three more providers, next to the OAuth ones |
| Entry points | `settings.section` id `subscription-usage` (existing), new RPC endpoints `keys*` |
| Data stores | New `~/.dsh/plugins/subscriptions/usage-keys.json`, mode 0600 |

Source: OpenChamber's quota fetchers (`packages/web/server/lib/quota/providers/{zai,ollama-cloud,kimi}.js`), read on 2026-11-08.

## 2. Problem and Outcome

The Usage page covers only the five OAuth providers. Z.ai, Ollama Cloud and Kimi Code are paid with an API key and have usage endpoints, but the plugin has no place to hold a key.

## 3. Scope

In scope: the three providers above, key entry and removal on the Usage page, meters, refresh, pace warnings, pins, composer gauge.
Out of scope: routing chat requests through these providers, cookie or browser-session auth, balance-only providers (DeepSeek, OpenRouter, MiniMax), gift resets, Cursor.

## 6. User Journey

1. Open Settings, Usage. Under the provider blocks a row reads "Add a provider" with Z.ai, Ollama Cloud and Kimi Code.
2. Pick one, paste the key, save. The plugin checks it by fetching usage once. A bad key shows the error and stores nothing.
3. The provider block appears with its meters, Refresh, Pin and a "Remove key" action.
4. Pinned providers show in the composer gauge like the OAuth ones.

## 9. Data Flow

Client `keysSet {provider, key}` -> Host validates by fetching usage -> writes `usage-keys.json` -> returns status. `status` then lists the provider as `metered` with one account whose key is the provider id. The Client never receives the key, only `configured: true` and a masked tail.

## 14. Business Rules

| ID | Rule |
|---|---|
| BR-001 | A key is stored only after one successful usage fetch with it. |
| BR-002 | A key is never returned to the Client, logged, or included in an error message. |
| BR-003 | Percent used comes from the provider's own percentage. Where only remaining percent is given, used is 100 minus remaining, clamped to 0 to 100. |
| BR-004 | A window's `durationMs` comes from the provider when it states one, so labels read 5h, 7d, 30d. A window with no stated length is `kind: 'other'`. |
| BR-005 | Z.ai replies HTTP 200 with `success: false` for a bad key or no plan. That is a failure, not an empty result. |
| BR-006 | These providers join the existing refresh policy unchanged: 60 s on open, 30 s manual, 5 min poll, failure cooldown never bypassed. |

## 11. Implementation Map (Current, uncommitted working tree)

| Path | Change |
|---|---|
| `src/usage-providers/` | `zai.ts`, `ollama-cloud.ts`, `kimi.ts` parsers; `common.ts` ids and `bearerJson`; `index.ts` `KeyUsage` and `UsageProviderId` |
| `src/usage-providers/keys.ts` | Read, write and remove `usage-keys.json` atomically, mode 0600 |
| `src/auth/rpc.ts` | Endpoints `keysSet`, `keysRemove`; `status` adds `keyProviders` and lists a configured key provider as a one-account metered provider with account key `key` |
| `src/usage/service.ts`, `src/providers/pool-usage.ts` | Typed by `UsageProviderId`, so key providers share the cache and cooldown |
| `src/client/Usage.tsx` | "Add a provider" row, key input, Remove key |
| `src/client/rpc.ts` | `UsageProviderId`, `USAGE_PROVIDERS`, `KEY_PROVIDERS` |

Design decision DEC-001: key providers are not added to `ProviderId`. That type drives login, model routing and the pool in 23 files. A separate registry keeps them out of those paths. The Client treats both kinds as "usage providers" through the `status` metadata added in FEAT-001.

## 15. Acceptance Criteria

| ID | Criterion | Test |
|---|---|---|
| AC-001 | Z.ai `limits` with a TOKENS_LIMIT of 42% and `nextResetTime` parses to a window at 42% with that reset | unit |
| AC-002 | Z.ai `{success:false, msg}` with HTTP 200 throws with that message | unit |
| AC-003 | Ollama `included.session.remaining_percent: 70` parses to a session window at 30% used | unit |
| AC-004 | Ollama `included.allowance_usd: 20, balance_usd: 5` parses to a monthly window at 75% used | unit |
| AC-005 | Kimi `limit_5h`, `limit_7d` and `limit_month_total` parse to windows of 5h, 7d and 30d | unit |
| AC-006 | HTTP 401 from any provider fails the fetch and `keysSet` stores nothing | unit |
| AC-007 | After `keysSet`, `keys` file has mode 0600 and `status` never contains the key text | unit |
| AC-008 | `keysRemove` deletes the key and the provider disappears from `status` | unit |
| AC-009 | The Usage page lists a configured key provider with meters; an unconfigured one appears only under "Add a provider" | client |
| AC-010 | A key provider refresh obeys the 30 s manual limit | unit |

## 17. Security and Privacy

Keys are bearer secrets. They live only in `usage-keys.json` (0600, atomic write), are sent only to the provider's own host, and are redacted from every error. The Client receives a masked tail (last 4 characters) for display.

## 26. Risks and Limitations

| ID | Risk | Fallback |
|---|---|---|
| RISK-001 | Kimi, Ollama and Z.ai usage endpoints are not publicly documented and may change. | The card shows "Usage unavailable" with the error. Parsers tolerate missing fields. |
| RISK-002 | Kimi has a global (`api.kimi.com`) and a China host (`api.kimi.ai` per OpenChamber). Which one a key belongs to is unknown. | Try the global host first, then the other on 401. Confirm with a real key. |
| RISK-004 | The Kimi fallback runs only after a 401 from the first host, so a key valid on `api.kimi.ai` costs one extra request each time. | Remember the working host if this shows up. |
| RISK-003 | A plain Moonshot key is refused by the Kimi Code endpoint. | Report "This key is not a Kimi Code key." Balance support is out of scope. |

Verified on 2026-11-08 with a bogus key: `ollama.com/api/balance` and `api.kimi.com/coding/v1/usages` return 401, and `api.z.ai/api/monitor/usage/quota/limit` returns 200, which matches BR-005. No real response has been captured yet.

## 24. Implementation Plan (done except step 5)

1. Providers: three parsers plus fixtures, with AC-001 to AC-006.
2. Key store and RPC: AC-007, AC-008, AC-010.
3. Usage service wiring and `status` metadata.
4. Client: add and remove UI, AC-009.
5. Live check with real keys, then update this document and FEAT-001.

## 30. Changelog

| Date | Change |
|---|---|
| 2026-11-08 | Proposed. |
| 2026-11-08 | Built. 730 tests pass. Live check with real keys pending. |
