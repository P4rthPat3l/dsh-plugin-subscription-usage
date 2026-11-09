/**
 * One stylesheet for every surface, prefixed `dsm-`, colored only through
 * `--dsw-alias-*` tokens. Card and button values copy the Models page
 * (`dsh-client-ui-settings-models` 0.2.2-rc.1); meters follow
 * design/usage-draft.html v3.
 */
export const css = `
.dsm-sub { display: flex; flex-direction: column; gap: 8px; min-width: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }
.dsm-sub .dsm-card-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; }
.dsm-num, .dsm-w, .dsm-mini, .dsm-fresh { font-variant-numeric: tabular-nums; }

.dsm-btn { box-sizing: border-box; height: 28px; padding: 0 10px; border-radius: var(--dsw-radius-sm); font: inherit; font-size: 12px; line-height: 18px;
  cursor: pointer; border: .5px solid var(--dsw-alias-border-l3); background: transparent; color: var(--dsw-alias-label-primary);
  display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.dsm-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-solid, var(--dsw-alias-interactive-bg-hover)); }
.dsm-btn:disabled { opacity: .4; cursor: default; }
.dsm-btn:focus-visible, .dsm-fold:focus-visible, .dsm-seg button:focus-visible, .dsm-switch:focus-visible, .dsm-chip:focus-visible, .dsm-gauge:focus-visible, .dsm-tab:focus-visible {
  box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline: none; }
.dsm-btn.dsm-primary { background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-label-primary)); color: var(--dsw-alias-label-primary-foreground, var(--dsw-alias-bg-base)); border-color: transparent; }
.dsm-btn.dsm-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover, var(--dsw-alias-label-primary)); }
.dsm-btn.dsm-ghost { border-color: transparent; color: var(--dsw-alias-label-secondary); }
.dsm-btn.dsm-danger { border-color: transparent; color: var(--dsw-alias-state-error-primary); }
.dsm-btn.dsm-danger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-danger, var(--dsw-alias-interactive-bg-hover)); }
.dsm-btn.dsm-icon { width: 28px; padding: 0; justify-content: center; border-color: transparent; color: var(--dsw-alias-label-secondary); }
.dsm-btn.dsm-icon.dsm-sm { width: 24px; height: 24px; }
.dsm-spinning svg { animation: dsm-spin .7s linear infinite; }
@keyframes dsm-spin { to { transform: rotate(360deg); } }

.dsm-acct { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.dsm-acct-head { display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--dsw-alias-label-secondary); }
.dsm-acct-name { color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.dsm-tag { flex: none; font-size: 11px; line-height: 16px; padding: 0 5px; border-radius: var(--dsw-radius-xs); border: .5px solid var(--dsw-alias-border-l3); color: var(--dsw-alias-label-secondary); }
.dsm-glyph { display: inline-flex; flex: none; color: var(--dsw-alias-label-tertiary); }
.dsm-glyph.dsm-star { color: var(--dsw-alias-state-warn-primary); }
.dsm-glyph.dsm-live { color: var(--dsw-alias-state-business-primary); }
.dsm-fresh { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; flex: none; }
.dsm-fresh.dsm-stale { color: var(--dsw-alias-state-warn-primary); }
.dsm-live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-success-primary); }

/* Fixed label, value and time columns, so bars line up across accounts and providers. */
.dsm-wins { display: grid; grid-template-columns: fit-content(132px) minmax(48px, 1fr) 40px 92px; column-gap: 12px; row-gap: 6px; align-items: center; }
.dsm-w { display: contents; font-size: 12px; line-height: 18px; }
.dsm-wl { color: var(--dsw-alias-label-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; line-height: 18px; }
.dsm-wv { text-align: right; font-weight: 600; font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-primary); }
.dsm-wt { text-align: right; color: var(--dsw-alias-label-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; line-height: 18px; }
.dsm-w.dsm-tight .dsm-wv, .dsm-w.dsm-tight .dsm-wt { color: var(--dsw-alias-state-warn-primary); }
.dsm-w.dsm-over .dsm-wv, .dsm-w.dsm-over .dsm-wt, .dsm-w.dsm-out .dsm-wv, .dsm-w.dsm-out .dsm-wt { color: var(--dsw-alias-state-error-primary); }

.dsm-bar { position: relative; display: block; border-radius: 3px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent); color: var(--dsw-alias-state-success-primary); }
.dsm-fill { position: absolute; top: 0; bottom: 0; left: 0; border-radius: inherit; background: currentColor; transition: width .5s cubic-bezier(.16, 1, .3, 1); }
.dsm-proj { position: absolute; top: 0; bottom: 0; background: repeating-linear-gradient(90deg, transparent 0 2px, color-mix(in srgb, currentColor 55%, transparent) 2px 3px); }
.dsm-bar.dsm-tight { color: var(--dsw-alias-state-warn-primary); }
.dsm-bar.dsm-over, .dsm-bar.dsm-out { color: var(--dsw-alias-state-error-primary); }
.dsm-bar.dsm-unknown .dsm-fill { display: none; }

.dsm-minis { display: inline-flex; gap: 14px; flex: none; }
.dsm-mini { display: inline-grid; grid-template-columns: auto 32px 34px; align-items: center; gap: 5px; font-size: 11px; line-height: 16px; }
.dsm-mini i { font-style: normal; color: var(--dsw-alias-label-tertiary); max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsm-mini b { font-weight: 500; text-align: right; color: var(--dsw-alias-label-primary); font-size: 12px; white-space: nowrap; }
.dsm-mini.dsm-tight b { color: var(--dsw-alias-state-warn-primary); }
.dsm-mini.dsm-over b, .dsm-mini.dsm-out b { color: var(--dsw-alias-state-error-primary); }

.dsm-fold { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; width: 100%; min-height: 32px; padding: 0 6px 0 2px;
  border: 0; background: none; text-align: left; cursor: pointer; border-radius: var(--dsw-radius-md); font: inherit; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsm-fold:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsm-fold .dsm-chev { color: var(--dsw-alias-label-tertiary); transition: transform .2s cubic-bezier(.16, 1, .3, 1); }
.dsm-fold[aria-expanded="true"] .dsm-chev { transform: rotate(90deg); }
.dsm-fold-name { display: flex; align-items: center; gap: 6px; min-width: 0; }
.dsm-fold-name > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsm-fold-body { display: flex; flex-direction: column; gap: 8px; padding: 2px 0 4px 24px; min-width: 0; }

.dsm-foot { display: flex; align-items: center; gap: 6px; }
.dsm-muted { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; margin: 0; display: inline-flex; align-items: center; gap: 6px; }
.dsm-alert { display: flex; gap: 8px; align-items: center; padding: 6px 6px 6px 10px; border-radius: var(--dsw-radius-lg);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent); }
.dsm-alert > svg { color: var(--dsw-alias-state-error-primary); }
.dsm-alert .dsm-btn { margin-left: auto; }

.dsm-panel { border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2)); padding: 2px 12px 12px; display: flex; flex-direction: column; gap: 8px; }
.dsm-tabs { display: flex; gap: 2px; border-bottom: .5px solid var(--dsw-alias-border-l2); margin: 0 -12px; padding: 0 8px; }
.dsm-tab { border: 0; background: none; padding: 9px 8px 8px; font: inherit; font-size: 13px; color: var(--dsw-alias-label-tertiary); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -.5px; }
.dsm-tab[aria-selected="true"] { color: var(--dsw-alias-label-primary); border-bottom-color: var(--dsw-alias-label-primary); }
.dsm-row { display: flex; align-items: center; gap: 10px; min-height: 36px; font-size: 13px; }
.dsm-row + .dsm-row { border-top: .5px solid var(--dsw-alias-border-l1); }
.dsm-grow { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; }
.dsm-grow > .dsm-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.dsm-note { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.dsm-list { max-height: 280px; overflow-y: auto; }
.dsm-switch { width: 30px; height: 18px; border-radius: 9px; background: var(--dsw-alias-state-idle-primary); border: 0; position: relative; cursor: pointer; flex: none; padding: 0; }
.dsm-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .2s cubic-bezier(.16, 1, .3, 1); }
.dsm-switch[aria-checked="true"] { background: var(--dsw-alias-state-success-primary); }
.dsm-switch[aria-checked="true"]::after { transform: translateX(12px); }
.dsm-switch:disabled { opacity: .4; cursor: default; }
.dsm-input { box-sizing: border-box; height: 30px; width: 100%; border-radius: var(--dsw-radius-md); border: .5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); padding: 0 10px; font: inherit; font-size: 13px; }
.dsm-select { height: 26px; border-radius: var(--dsw-radius-sm); border: .5px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; padding: 0 4px; max-width: 160px; }
.dsm-panel-foot { display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding-top: 4px; }
.dsm-panel-foot .dsm-card-error { margin-right: auto; }
.dsm-seg { display: inline-flex; padding: 2px; border-radius: 7px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent); gap: 2px; flex: none; }
.dsm-seg button { border: 0; background: transparent; height: 22px; padding: 0 9px; border-radius: 5px; font: inherit; font-size: 12px; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dsm-seg button[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); box-shadow: 0 1px 2px #0000002e; }
.dsm-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.dsm-chip { height: 26px; padding: 0 10px 0 8px; border-radius: 13px; border: .5px solid var(--dsw-alias-border-l3); background: transparent; font: inherit; font-size: 12px;
  cursor: pointer; display: inline-flex; align-items: center; gap: 5px; color: var(--dsw-alias-label-secondary); }
.dsm-chip[aria-pressed="true"] { background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base); border-color: transparent; }
.dsm-chip:disabled { opacity: .4; cursor: default; }

.dsm-signin { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2)); }
.dsm-steps { display: flex; gap: 16px; margin: 0; padding: 0; list-style: none; font-size: 12px; flex-wrap: wrap; }
.dsm-steps li { display: inline-flex; gap: 6px; align-items: center; color: var(--dsw-alias-label-tertiary); }
.dsm-steps li[data-s="done"] { color: var(--dsw-alias-state-success-primary); }
.dsm-steps li[data-s="now"] { color: var(--dsw-alias-label-primary); }
.dsm-spin { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid var(--dsw-alias-border-l3); border-top-color: currentColor; animation: dsm-spin .8s linear infinite; flex: none; box-sizing: border-box; }
.dsm-code { font: 600 20px/28px var(--dsw-font-family-mono, ui-monospace, Menlo, monospace); letter-spacing: .12em; padding: 4px 12px; border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1); border: .5px solid var(--dsw-alias-border-l2); }
.dsm-fallback summary { cursor: pointer; color: var(--dsw-alias-label-tertiary); font-size: 12px; list-style: none; display: inline-flex; gap: 4px; align-items: center; }
.dsm-fallback summary::-webkit-details-marker { display: none; }
.dsm-fallback[open] summary { margin-bottom: 6px; }

.dsm-footer-block { margin-top: 18px; padding-top: 14px; border-top: .5px solid var(--dsw-alias-border-l2); display: flex; flex-direction: column; max-width: 720px; }
.dsm-footer-block h3 { margin: 0 0 4px; font-size: 14px; font-weight: 500; line-height: 22px; color: var(--dsw-alias-label-primary); }
.dsm-footer-block .dsm-row { min-height: 40px; color: var(--dsw-alias-label-primary); }

.dsm-gauge-slot { position: relative; display: inline-flex; min-width: 0; }
.dsm-gauge { display: inline-flex; align-items: center; gap: 10px; height: 24px; padding: 0 8px; border-radius: 12px; border: 0; background: transparent; cursor: pointer;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; min-width: 0; }
.dsm-gauge:hover, .dsm-gauge[aria-expanded="true"] { background: var(--dsw-alias-interactive-bg-hover); }
/* A crowded dock row narrows the meters instead of wrapping the name; the gauge drops a window in JS first. */
.dsm-gp { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.dsm-gp + .dsm-gp { padding-left: 10px; border-left: .5px solid var(--dsw-alias-border-l3); }
.dsm-gp-name { color: var(--dsw-alias-label-primary); flex: none; white-space: nowrap; }
.dsm-gp .dsm-minis { gap: 10px; flex: 0 1 auto; min-width: 0; }
.dsm-gp .dsm-mini { grid-template-columns: auto minmax(0px, 26px) auto; min-width: 0; }
.dsm-gauge-ghost { position: absolute; top: 0; left: 0; width: max-content; max-width: none; visibility: hidden; pointer-events: none; }

.dsm-pop { position: fixed; z-index: 1000; width: 420px; max-width: calc(100vw - 20px); box-sizing: border-box; background: var(--dsw-specific-menu, var(--dsw-alias-bg-overlay));
  backdrop-filter: var(--dsw-menu-backdrop-filter, none); border-radius: var(--dsw-radius-xl); box-shadow: var(--dsw-elevation-panel, 0 12px 32px #0006);
  border: .5px solid var(--dsw-alias-border-l2); padding: 6px; display: flex; flex-direction: column; color: var(--dsw-alias-label-primary);
  text-align: left; font-size: 13px; line-height: 20px; max-height: min(560px, calc(100vh - 24px)); overflow: hidden auto; }
.dsm-pop-head { display: flex; align-items: center; gap: 2px; padding: 2px 2px 6px 8px; }
.dsm-pop-head b { font-weight: 600; font-size: 13px; margin-right: auto; }
.dsm-psec { border-top: .5px solid var(--dsw-alias-border-l2); padding: 4px 0; }
.dsm-psec-head { display: flex; align-items: center; gap: 2px; }
.dsm-psec-head .dsm-fold { flex: 1; }
.dsm-psec-name { color: var(--dsw-alias-label-primary); font-weight: 500; font-size: 13px; }
.dsm-psec .dsm-fold-body { padding: 0 8px 6px 26px; gap: 6px; }
.dsm-psec .dsm-fold-body .dsm-fold-body { padding: 4px 0 0; }
.dsm-psec .dsm-fold-body .dsm-fold { margin-left: -24px; width: calc(100% + 24px); }
.dsm-pacct { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dsm-pacct .dsm-acct-head { font-size: 12px; line-height: 18px; }
.dsm-others { padding-bottom: 0; }
.dsm-others .dsm-psec { border-top: 0; padding: 0 0 0 16px; }
.dsm-gauge > svg { color: var(--dsw-alias-label-secondary); }
.dsm-pin { color: var(--dsw-alias-label-tertiary); }
.dsm-pin[aria-pressed="true"] { color: var(--dsw-alias-label-primary); }

.dsm-notice { display: flex; gap: 8px; align-items: center; padding: 6px 6px 6px 12px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary);
  background: var(--dsw-specific-menu, var(--dsw-alias-bg-overlay)); border-radius: var(--dsw-radius-lg); border: .5px solid var(--dsw-alias-border-l2);
  box-shadow: var(--dsw-elevation-panel, 0 12px 32px #0006); animation: dsm-drop .45s cubic-bezier(.16, 1, .3, 1); }
.dsm-notice > svg { color: var(--dsw-alias-state-warn-primary); }
.dsm-notice.dsm-err > svg { color: var(--dsw-alias-state-error-primary); }
.dsm-notice-host { position: fixed; top: 52px; right: 20px; z-index: 1000; max-width: calc(100vw - 40px); }
@keyframes dsm-drop { from { opacity: 0; transform: translateY(-8px); filter: blur(4px); } }

.dsh-subscription-speed button:hover:not(:disabled) { --dsh-subscription-speed-hover: var(--dsw-alias-interactive-bg-hover); }
.dsh-subscription-speed button:active:not(:disabled) { --dsh-subscription-speed-hover: var(--dsw-alias-interactive-bg-active); }
.dsh-subscription-speed button:disabled { opacity: .4; cursor: default; }
.dsh-subscription-speed button:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) { .dsm-sub *, .dsm-pop *, .dsm-notice, .dsm-fill { animation: none !important; transition: none !important; } }
@media (max-width: 640px) {
  .dsm-wins { column-gap: 8px; grid-template-columns: fit-content(96px) minmax(40px, 1fr) 36px 84px; }
  .dsm-minis { gap: 8px; } .dsm-mini { grid-template-columns: auto 22px 32px; } .dsm-mini i { max-width: 56px; }
  .dsm-gp-name { display: none; }
  .dsm-footer-block .dsm-row { flex-wrap: wrap; padding: 6px 0; }
}
`
