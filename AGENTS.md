# dsh-plugin-subscription-usage

A DSH 0.2.2 Cordis plugin. It routes ChatGPT (Codex), Claude, Grok, GitHub Copilot and Google Antigravity subscriptions as LLM providers. It shows them on Settings, Models, with usage meters.

Feature documentation lives in `docs/features/`. Read `FEAT-001` before changing the Models integration or the usage display.

## Facts

- `src/auth`, `src/providers`, `src/translate` and `src/tools` are carry the sign-in, provider, pool and translation core. Keep changes there small.
- `pnpm-workspace.yaml` pins every `@deepseek-ai/dsh-*` package to one version through `overrides`. Mixed versions give two copies of branded types such as `SessionId`, and the build fails with unrelated-looking type errors.
- Claude's `/api/oauth/profile` returns the account email only with the header `anthropic-beta: oauth-2025-04-20`. Without it the account shows as `token-…`. Startup backfills missing emails.
- Codex sends usage in `x-codex-{primary,secondary}-*` headers as 0 to 100 percent. Claude sends `anthropic-ratelimit-unified-{5h,7d}-utilization` as a 0 to 1 fraction. Both arrive on 429 replies too.
- The Models page draws its own Edit button on every configurable provider row. A plugin cannot hide it.
- Any other subscriptions plugin must stay disabled in the same profile. Both register the `codex` adapter, and the second fails with `DUPLICATE_ADAPTER`.
- The client bundle imports only `react`, `react-dom` and `react/jsx-runtime` at runtime. Importing `dsh-client-ui-primitives` failed to load in the 0.2.2 web page, so icons are local SVGs and colors use theme tokens `--dsw-alias-*`. Check `lib/client.js` for other `require(` calls after a build.
- `.dsm-w` rows use `display: contents` so cells align on the parent grid. A `title` on the row element shows no tooltip, so put it on the cells.
- The composer gauge measures its flex box before paint and takes the widest detail that fits: every window, one window per provider (`tightestWindow` in `meter.tsx`), the first provider alone, then the meter icon. `.dsm-gauge-ghost` copies measure each detail's natural width, so they must keep `width: max-content` and render the same meters as the visible gauge (as spans, not the button).
- To add a provider, extend `ProviderId`, `PROVIDER_IDS` and `PROVIDER_SHORT_NAMES` in `src/auth/store.ts`, `providerIdSchema` in `src/index.ts`, and `PROVIDERS` in `src/client/rpc.ts`. Register a usage fetcher in `usageFetchers` and `fetcherFor`; `status` then reports the provider as `metered`, and every Client surface picks it up.
- `settings.models.provider-card` is keyed by settings namespace. This plugin draws only on `subscription-models` cards, so usage for another plugin's provider can show in the composer but not on that provider's card.
- Copilot usage comes from `api.github.com/copilot_internal/user` with the GitHub OAuth token (`refreshToken`), not the Copilot API token.
- Usage preferences are a volatile Config field. The client edits them through `ctx.configForms.get('subscription-models')`, and the Usage page holds the Left/Used, pace and composer switches. Models cards show no usage. `composer` replaced the three-way `gauge` mode; the Client reads a saved `gauge: off` as hidden and unsets `gauge` on the next write.
- API key usage providers (Z.ai, Ollama Cloud, Kimi Code) are not in `ProviderId`, which drives login, routing and the pool. They live in `src/usage-providers/` under `UsageProviderId`. To add one, write a `KeyProvider`, add its id to `KEY_PROVIDER_IDS` and the pinned union in `src/index.ts`, and to `KEY_PROVIDERS` in `src/client/rpc.ts`. Keys are stored in `usage-keys.json` (0600) and never reach the Client.

## Commands

```bash
pnpm build   # tsc and tsdown, writes lib/
pnpm test    # compiles to lib-test/ and runs node --test
```

The `web` profile loads its own copy of this package from `~/.dsh/profiles/web/node_modules`, not this checkout. As of 2026-11-09 that copy is a pnpm store install, so `pnpm build` does not update what the GUI loads: reinstall the plugin into the profile, then reload the page for client changes and restart DSH for host changes.
