# FEAT-003: Agent usage tool

Status: active. Implementation: shipped_unverified. Owner: Parth Patel.

## Problem

The agent cannot see how much of each subscription limit is left. Before a long or heavy task it cannot tell whether a provider is close to its limit. Usage reaches only the UI.

## What the user gets

A read-only tool, `subscription_usage`. The agent calls it before heavy work and gets, for each provider with an active account, the plan, each window's percent used, the reset time and the pace state. Done means the agent can answer "can I afford this" from real numbers.

## Scope

In: one tool, `subscription_usage`, for the OAuth providers (Codex, Claude, Grok, Copilot, Antigravity) and the key providers (Z.ai, Ollama Cloud, Kimi Code). One account per provider: the account serving the session, else the default.

Out: starting logins, changing keys, switching accounts, redeeming resets. The tool never returns tokens, keys or the key tail.

## Tool contract

Name: `subscription_usage`. Alias on collision: `dsh_subscriptions_subscription_usage`.

Input:
- `provider` (optional string): one provider id. Omitted means all active providers.
- `refresh` (optional boolean): force a fresh fetch. Default false, which returns the cached snapshot.

Output, one entry per provider:
- `provider`, `account` (email or label, no secret), `plan`
- `windows`: `kind`, `scope`, `usedPercent`, `leftPercent`, `resetsAt` (ISO string), `pace` (`calm`, `tight`, `over`, `out`, `unknown`), `emptyAt` (ISO string, only when `over`)
- `stale` (boolean) and `fetchedAt` (ISO string)
- `error` (string) when that provider failed. One failure never hides the others.

The model-facing description tells the agent to call it before long or heavy tasks and to prefer a provider with a `calm` pace.

## Data flow

Tool `execute` calls a `read(provider, refresh)` function passed in from `src/index.ts`. That function uses the same controller the Settings page uses: `status` for the account list, then `usage(provider, account, signal, refresh, 'manual' or 'poll')`. Pace comes from `pace()` in `src/usage/pace.ts`. No new network code.

## Acceptance criteria

| ID | Criterion | Test |
|---|---|---|
| AC-001 | With Codex and Claude signed in, the tool returns one entry for each, with windows, `usedPercent`, `leftPercent` and ISO `resetsAt` | `test/usage-tool.spec.ts` |
| AC-002 | Each window carries the `pace` state `pace()` gives for the same inputs, and `emptyAt` only when `over` | same |
| AC-003 | `provider: "claude"` returns only Claude. An unknown provider id returns an error result naming the valid ids | same |
| AC-004 | `refresh: false` makes no forced read. `refresh: true` passes `force` to the controller | same |
| AC-005 | One provider's usage read throws: its entry has `error`, the others still return | same |
| AC-006 | A provider with no signed-in account is left out. A provider with no usage endpoint (Grok) appears with an `unsupported` note and no windows | same |
| AC-007 | The serialized result never contains a token, a key, or the key tail, for key providers too | same |
| AC-008 | When `subscription_usage` is already registered, the tool registers under the alias | `test/tool-registration.spec.ts` |
| AC-010 | A system prompt section tells the agent to call the tool before heavy work | `test/usage-tool.spec.ts` (reminder text), live check of the prompt pending |
| AC-009 | The tool is read-only: it needs no approval and has no write path | review of the definition |

## Edge and error states

- Usage stale or provider failing: return the last snapshot with `stale: true`, as the UI does.
- No provider signed in: return an empty list with a one-line message.
- Cooldown after a failure: a forced refresh still respects it (BR-003 in FEAT-001).

## Risks

- RISK-001: A forced refresh by the agent could hit provider rate limits if it loops. Fallback: the cooldown in `UsageService` already blocks repeat reads, so the tool returns the cached snapshot.
- RISK-002: Per-agent tool restrictions may hide the tool in some presets. Fallback: none needed, the user can allow it per agent.

## Build order

1. `src/tools/usage.ts`: definition, input checks, output shaping.
2. Register it in `src/index.ts` next to the other tools, using the controller's `status` and `usage`.
3. Tests, named by criterion.
4. Update this document and `docs/features/README.md`.

## Implementation notes

- Tool: `src/tools/usage.ts`. Wiring and the prompt section `subscription-usage:reminder` (order 5000): `src/index.ts`.
- Verified: typecheck, build, 739 tests (the known flaky refresh test aside).
- Not verified: a live agent calling the tool, and the reminder appearing in a real system prompt. Needs a DSH restart.
