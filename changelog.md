# Specter Changelog

## v1.3.3

### Dynamic Module Description

- **Rewrote boot-time module description** (`lib/boot_core.sh`) — priority-based status line replaces the old `"Active | <version>"` with context-aware info:
  - 🚨 Tricky Store not installed — hard dependency warning shown if the module directory is missing
  - 🚨 Conflict: `<name>` — conflicting module detected, shown with full priority
  - 🔑 `<provider> <version> · ✅/❌ | <N> apps | 🛡️ <patch>` — keybox dashboard showing provider name, version, active/revoked status, target.txt app count, and spoofed security patch date
  - 🎭 TEE Sim — shown when locked.xml (TEE Simulator mode) is active
  - ❌ No keybox — shown when no keybox is installed, still shows app count and patch date
- **Updated static description** in `module.prop` to `"Unified Play Integrity and root hiding stack for Android"`

### TEE Check — App-Level Attestation (One-Time)

- **New one-time TEE check** — `customize.sh` downloads a tiny ContentProvider APK (8.4KB) from rawbin, installs it, runs the **same attestation check as TEESimulator-RS** (`KeyPairGenerator` + `setAttestationChallenge` in Android Keystore), caches the result to `/data/adb/Specter/tee_status`, then uninstalls and deletes the APK. Only runs once — never again after caching.
- **Result moved to Specter dir** — `TEE_STATUS` changed from `$TRICKY_DIR/tee_status` to `$SPECTER_DIR/tee_status`. Works standalone without Tricky Store. `device-info.sh` and `target.sh` both read the cached file.
- **APK reused if already installed** — `customize.sh` checks if the package is installed before downloading. Skips download + install if it's already there from a previous run (e.g., failed cleanup).
- **No Tricky Store file fallback** — removed stale file reads from `/data/adb/tricky_store/tee_status*` that caused false `TEE: broken` from old DEX tests.
- **Precise targeting** — `target.sh` reads the cached TEE status to decide `?` vs bare suffix per app. Broken TEE → apps get `?` (generate fallback). Also cleaned up to only read `$TEE_STATUS`, no longer checks old `.txt` variants.
- **`tee_check` binaries removed** — all C binaries, Java DEX, and build scripts for `bin/tee_check/` deleted. Saved ~20KB from the module zip.

### Installer — Module Detection Overhaul

- **Tricky Store variant detection** — now reads `module.prop` `name=` to distinguish between TrickyStore (original), TEESimulator, and TEESimulator-RS. Shows the exact variant name during install.
- **Play Integrity Fix detection** — reads PIF's `module.prop` `name=` during install and prints it. Silently skips IntegrityBox (which uses `id=playintegrityfix` but is distinguished by its `/data/adb/Box-Brain/` marker).
- **Root detection consolidated** — removed duplicate inline detection from `device-info.sh`. `detect_root_solution()` in `common.sh` is now the single source of truth, sets both `$ROOT_SOL` (generic: `magisk`/`kernelsu`) and `$ROOT_TYPE` (detailed: `SukiSU-Ultra`/`KernelSU-Next`). Both `customize.sh` and `device-info.sh` use the same function.
- **Output order cleaned** — "Checking device info..." now prints FIRST during install, before root/module detection. TEE check downloads no longer show separate "Success" lines.

- **Restored "Fix PIF Detection" button** in Tools page — re-added `pif2.sh` feature script, webui bridge, UI card, and all 5 language translations. The button was removed in v1.3.0 with the claim that boot-time `block_rom_spoof_engines` made it redundant.
- **Root cause**: the boot function only set guard persist props (preventative) but never deleted existing spoof engine traces. Active `pihook`/`pixelprops` properties from ROM-level spoof engines remained in memory and were still detectable.
- **Moved active deletion into `block_rom_spoof_engines()`** (`common.sh`): the shared library function now also removes existing `pihook`/`pixelprops` properties via `resetprop -p --delete`. This runs at boot AND when the button is pressed — single source of truth.
- Boot (`service.sh` / `boot-completed.sh`) and webui button (`pif2.sh`) now call the same `block_rom_spoof_engines()` with identical behavior.

### Conditional Integration — Audit & Refactor

- **Fixed `toggle-lsposed` never running at boot** — was missing from both `service.sh` and `boot-completed.sh` despite having a full feature script, toggle, and conflict management. Added invocation to both boot paths.
- **Fixed recovery toggle initial state overwrite** — `applyFlags()` from device info set the correct switch state, but `wireControlToggles()` immediately overwrote it from config. Reordered init so device info has final say.
- **Fixed passive conflict toggles being decorative no-ops** — `_conflict_claimed()` for passive modules always returned "claimed" regardless of the user's priority choice. Now honors `priority_specter` vs `priority_module`.
- **Fixed `bootloader_spoofer` toggle being a placebo on Magisk** — `resolve_conflicts()` at post-fs-data called `disable_bootloader_spoofer` unconditionally. Now gated behind the toggle. Also added a late-boot call to `service.sh` where `pm`/`cmd` are actually available.
- **Fixed recovery hiding absent on KSU/APatch** — `hide_recovery_folders()` was only in `service.sh` (Magisk path), missing from `boot-completed.sh`. Added.
- **Fixed extra boot hardening steps missing on KSU/APatch** — `/proc/cmdline`, `/proc/net/unix`, `install-recovery.sh`, `/system/addon.d` hardening was only in `service.sh`. Added to `boot-completed.sh`.
- **Unified boot logic into `lib/boot_core.sh`** — single source of truth sourced by both `service.sh` (Magisk) and `boot-completed.sh` (KSU/APatch). Eliminates platform fork drift. Adding a new boot feature means one line in the feature list, not touching 3 files.
- **Extracted conflict registry to `config/conflicts.txt`** — data file replaces heredoc in `common.sh`. Adding a conflicting module is one line in a text file, no shell code changes.
- **Added `_feature_should_run()`** — single runtime gate checking both user toggle and conflict claim, used by the unified boot dispatcher.
- **Moved `toggle-action_keybox` to control page** — was only in `constants.ts` with no HTML element. Now rendered in the Action Pipeline section.
- **Removed duplicate run-now buttons from Tools page** — `target.sh`, `gms.sh`, `pif.sh` buttons duplicated the action pipeline toggles. Removed. The control page is the single place for pipeline automation.
- **Fixed broken HTML from dev_options removal** — commit `927b7f3` left orphaned elements and a dangling `</div>` that broke DOM nesting, causing pages to render incorrectly.
- **Synced config on device state refresh** — `applyFlags()` now calls `cfgSet()` so the persisted config matches the detected device state.
- **Added conflict resolution test suite** — 14 tests covering all conflict types, toggling, `_feature_should_run()`, JSON output, special detection cases, and idempotency. Runs on any Linux box via `bash tests/test_conflicts.sh`.
- **Updated `docs/AGENTS.md` boot safety docs** — replaced outdated function names and removed `disable_rom_spoof_engines` references with the current architecture.
- **Renamed `twrp.sh` → `recovery.sh`** — consistent naming with the toggle. Same `hide_recovery_folders()` call.
- **Extracted standalone feature scripts** — `boot_hardening.sh`, `bootloader_spoofer.sh`, `rom_spoof.sh` extracted from inline code in `service.sh`/`boot-completed.sh`. All dispatched via `boot_core.sh` now.
- **Removed self-guards from feature scripts** — `lsposed.sh` and `suspicious_props.sh` no longer check their own toggle at the top. Gating is now centralized in `_feature_should_run()`, avoiding the old pattern where action-pipeline calls would be silently skipped.
- **Moved `_feature_enabled()` to `common.sh`** — was defined twice (once in `service.sh`, once in `boot-completed.sh`). Now defined once in the shared library.
- **Split `apply_conflict_toggles()` into two loops** — boot-time and action-pipeline toggles are now set separately. Only `target`, `security_patch`, and `keybox` affect action toggles.
## v1.3.2

### TEE Status Detection Fix

- **Fixed TEE status not showing on Home page**: `device-info.sh` now checks both `tee_status` (Yurikey format) and `tee_status.txt` (TEESimulator format). Also accepts both `teeBroken=` and `tee_broken=` key names. Previously only looked for `tee_status` with `teeBroken=`, always returning "Unknown" on TEESimulator.
- **`target.sh`**: same fix — tries both filenames and both key formats for the `teeBroken` variable used in conditional targeting.

### Conflict Resolution — Complete Overhaul

- **Conflict type system** (`common.sh`): registry entries now have a 5th `type` field — `aggressive` (100% overlap, full replacement) vs `passive` (partial overlap, complementary). All registry-parsing functions (`resolve_conflicts`, `_conflict_claimed`, `conflict_set_choice`, `conflict_status_json`, `migrate_conflict_config`) updated to handle the new field.
- **Aggressive modules** (TSupport-Advance, Yurikey, Integrity Box): silently renamed to `.bak` at boot — Specter always takes priority, no user prompt needed.
- **Passive modules** (TreatWheel, NoHello, Sensitive Props): scripts are **never renamed**. Both modules coexist. Specter automatically defers its overlapping features by disabling the relevant toggles. User is informed via boot log.
- **`_conflict_claimed()`** — passive-type modules always claim their features (they keep running). Aggressive modules only claim if user explicitly set `priority_module`.
- **`conflict_set_choice()`** — passive modules skip script rename/restore operations entirely. Only toggles are recalculated.
- **`conflict_status_json()`** — JSON response now includes a `type` field for each detected conflict.
- **Bug fix in `resolve_conflicts()`**: aggressive modules now call `cfg_set "conflict_$_rc_id" "priority_specter"` alongside the script rename. Previously, if a user had `priority_module` stored from an older version, `_conflict_claimed()` would still read the stale choice and disable Specter's overlapping features — even though the conflicting module's scripts were already renamed. Result: neither module handled the feature.

### Fixed Feature Claims

- **Treat Wheel** (`_conflict_registry`): corrected from `boot_hardening,rom_spoof,suspicious_props` to just `boot_hardening`. Treat Wheel does not block ROM spoof engines or clean suspicious props.
- **Sensitive Props** (`_conflict_registry`): corrected from `boot_hardening,suspicious_props,rom_spoof` to `boot_hardening,suspicious_props`. Sensitive Props does not handle ROM spoof engines.

### Developer Options Feature Removed

- **Removed `disable_dev_options()` entirely** — the function was unreliable (only set a prop that Android often ignores) and user preference is better left to the user. If someone wants dev options disabled, they can do it themselves.
- **`_feature_enabled()` in `service.sh`** now accepts an optional 2nd argument as the default value (`"${2:-1}"`), allowing per-toggle default overrides.
- **`_feature_enabled()` bug fix in `boot-completed.sh`** — the function was used but never defined, causing all boot-completed feature gating to fail silently on KernelSU/APatch. Now properly defined.

### Tricky Addon Guard Removed

- **Removed hardcoded TA_utl suspension** from `target.sh`. Specter now generates `target.txt` normally regardless of whether Tricky Addon is installed. The Interactive App Targeting sentinel (`target_applied`) still protects the manual overlay.

### Installer — No Interactive Conflict Prompts

- **Removed all volume-key conflict prompts** from `customize.sh`. No more asking the user to choose priority for each detected module. Resolution is fully automatic at boot.
- **Keybox default changed to Yes**: timeout now installs a keybox instead of skipping. `"Vol Down = No (defaults to Yes in 5s)"`.
- **target.txt default changed to Yes**: timeout now generates target.txt instead of skipping. Same prompt pattern.

## v1.3.1

### WebUI Refactoring — Complete Restructure

- **app.ts split** from 844 to 140 lines — extracted 5 domain modules: `navigation.ts` (nav tabs, scroll), `toggles.ts` (control toggles, dev mode), `actions.ts` (script runners, confirm dialog), `security-patch-ui.ts` (patch date dialog), `keybox-ui.ts` (install button, provider select, full custom keybox flow with serial detection + catalog matching)
- **target-apps.ts cleanup** — eliminated 7 module-level mutable variables (`apps`, `filteredApps`, `currentFilter`, `currentSearch`, `showSystemApps`, `sysPkgs`, `mode`); all state is now local to `openTargetAppsManager` closure. Extracted 60-line inline HTML template to `buildOverlayHTML()`. State-dependent helpers (`nextState`, `stateIcons`, `stateText`, `stateLabelKey`) now receive `mode` as a parameter — pure functions with no global state.

### Performance — Caching & Network

- **Batch config init** (`cfg.ts`): new `cfgInit()` reads all config files in a single bridge exec (`for f in config/*.val; do ...`) instead of ~15 separate shell spawns. Eliminates ~15× bridge round trips on first load.
- **HTTP fetch cache** (`utils.ts`): `fetchJson()` now accepts optional `ttlMs` parameter. Remote API calls are cached in-memory — keybox catalog: 5 min, dev.json: 30 min. Local `/json/.*` calls are never cached (always fresh).
- **Network polling reduced** (`network.ts`): interval lowered from 3s to 15s. Browser `online`/`offline` events cover instant status changes.
- **Device init streamlined** (`device.ts`): `initDevice()` runs shell scripts directly (no pre-fetch). The original pattern — run script, then fetch JSON — restored after stale-while-revalidate caused a regression.

### APatch / KSU Compatibility

- **`download()` PATH fix** (`common.sh`): added `/data/adb/ap/bin:/data/adb/ksu/bin` so `busybox` is found on APatch and KernelSU. Uses `busybox wget` (with `--no-check-certificate`) as primary transport — same pattern as PlayIntegrityFix. Falls back to `curl` if busybox wget fails.
- **`check_network()`** (`common.sh`): same PATH fix. Uses `busybox wget -qO /dev/null` instead of `wget --spider` (not supported by busybox/toybox wget).

### Keybox Fallback Fix

- **Dead fallback URLs replaced** (`keybox.sh`): the fallback loop probed `keybox0` through `keybox9` under `/key/fallback/` which returned 404. Replaced with `FALLBACK_KEYBOXES` in `urls.sh` — real provider/version pairs (`Yuri/8`, `OGCOMPLEX/1`, `Trigon/1`, `Evokerr/1`, `Fateh/1`) that actually exist on the server.
- **Fallback probing method** (`keybox.sh`): removed non-portable `wget --spider`/`curl --head` probe. Now uses the proven `download()` function directly — tries each URL, accepts the first non-empty response.

### Type Safety

- **MDC type declarations** (`mdc.d.ts`): typed all 17 Material Design custom elements (`md-switch`, `md-dialog`, `md-select`, `md-outlined-text-field`, `md-menu`, `md-chip`, `md-filter-chip`, `md-assist-chip`, `md-navigation-tab`, `md-filled-button`, `md-filled-tonal-button`, `md-text-button`, `md-circular-progress`, `md-outlined-segmented-button`, `md-outlined-select`, `md-select-option`, `md-filled-text-field`). All extend `HTMLElement`, eliminating ~60 `as any` type assertions across the codebase.
- **Dialog factory** (`dialog.ts`): added `createDialog()`, `showDialog()`, `showConfirm()` — encapsulates the 6-step dialog boilerplate (`createElement`, `innerHTML`, `appendChild`, `querySelector`, `addEventListener`, `show`/`close`) repeated 10+ times across the codebase.
- **Zero type errors**: full project passes `tsc --noEmit` cleanly.

### Code Cleanup

- **Duplicated toggle array removed**: `CONTROL_TOGGLES` extracted to `constants.ts` — the same 10-entry toggle array was defined identically in `wireControlToggles()` and `refreshControlToggles()`.
- **Duplicated month calc removed**: `defaultSecurityPatch()` extracted to `constants.ts` — the same 6-line month calculation appeared twice in `wireSecurityPatch()`.
- **Private `escapeHtml` removed** (`file-browser.ts`): now imports from `utils.ts` instead of maintaining its own copy.
- **Dead export removed**: `evictFetchCache` from `utils.ts` — declared but never imported anywhere.
- **Removed `CONTROL_TOGGLES` unused import** from `app.ts`.

### Security Patch

- **System fallback** (`device-info.sh`): now reads `ro.build.version.security_patch` (the real build property, never lies) alongside the spoofed Tricky Store value. `device.ts:applyDeviceInfo()` shows the spoofed patch if set, falls back to the real system patch. The info card always shows meaningful data — no more `—` when the user hasn't set a spoofed value.

### UI Fixes

- **Nav bar indicator invisible on first load** (`navigation.ts`): the "pill" background on the active tab never appeared on initial page load. Root cause: the first tab already had `nav-tab--active` in HTML, so `navigateTo('#home')` skipped `activateTab()` entirely, and `reposition()` was never called. The indicator div had no `left`/`width` set. Fixed by calling `reposition()` on the already-active tab after `navigateTo()`.
- **Responsive browse button** (`keybox-ui.ts`, `app.css`): the file browser row now uses two separate buttons toggled via `@media (max-width: 480px)` — `md-filled-tonal-button` with "Browse" text on wide screens, native `<button>` with `folder_open` icon on narrow screens. Both use `--md-sys-color-primary-container` background for visual consistency. Icon is perfectly centered via `display:inline-flex; align-items:center; justify-content:center`.
- **File browser row layout** (`keybox-ui.ts`): the assist chip now uses `flex:1` and `text-overflow:ellipsis` to fill available width with truncation. Browse button is a 40×40px square on narrow screens, auto-sized on wide. The flex container uses `width:100%` to fill the card.

## v1.3.0

### VBMeta / Boot Hash — Complete Overhaul

- **Removed `read_vbmeta()`** (`common.sh`) — was computing SHA-256 of the raw vbmeta partition. The VBMeta Digest is a different value (digest over parsed VBMeta structs, set by the bootloader). Raw partition hashing is incorrect and produced wrong results on every device.
- **Removed inline vbmeta fixer** (`service.sh`) — the early-boot block-device read that set `ro.boot.vbmeta.size` / `hash_alg` / `avb_version` / `digest` from raw partition data. Removed entirely.
- **Rewrote `boot_hash.sh`** — new fallback chain: existing system property → `/proc/cmdline` → user config `/sdcard/Specter/boot_hash` → stored file `/data/adb/boot_hash` → skip. No block device read, no `sha256sum`/`blockdev` dependency, no zero fallback.
- **Removed zero fallback** — no longer writes `0000...0000` to `ro.boot.vbmeta.digest` or `/data/adb/boot_hash`. If no valid source, the script exits without touching anything.
- **Zero-value guard added** — user config and stored file inputs that are all zeros are now rejected.
- **Boot hash priority reordered** (`boot_hash.sh`): `read_vbmeta()` (block device) now runs before the cached file. Previously, a transient failure on first boot would write zeros to the cache, permanently blocking re-read. Now: user override → block device → cached fallback.
- **`service.sh` guard removed**: the `[ ! -f "/data/adb/boot_hash" ]` guard that skipped setting `ro.boot.vbmeta.digest` from the live block device when cache existed was removed.
- **`boot_hash.sh` reads `/proc/cmdline`** — new source: the bootloader's `androidboot.vbmeta.digest=` survives module interference and restores the original value even if previously corrupted.

### download() / Network
- Swapped priority: **wget first, curl fallback** — wget ships with Android (toybox), curl does not. Reduces unnecessary errors and timeouts on devices without curl.
- `check_network()` also updated to try wget first for consistency.

### Keybox Script Fixes
- **Unguarded curl in fallback probe** (`keybox.sh`): added `command -v` guard + `2>/dev/null` to both curl and wget calls.
- **`sort -R` removed** (`keybox.sh`): `sort -R` is a GNU extension, not available on busybox/toybox Android builds. Replaced with POSIX-compatible `awk` random selection.
- **Custom keybox detection** (`app.ts`): added wget-first fallback in the shell command string — same priority pattern as `download()`.

### Play Store Clear Data
- **`kill_play_store.sh`** and **`gms.sh`**: replaced `cmd package trim-caches 999999999 com.android.vending` with `pm clear com.android.vending`. `trim-caches` only accepts a size argument and only clears system cache — never app data. `pm clear` actually deletes private data, forcing Play Store re-registration after a keybox swap.

### Installer (customize.sh)
- **Timeout on all vol-key prompts**: each prompt defaults after 8 seconds of no input — skip keybox install, skip target.txt generation, default to Specter priority for module conflicts. Uses `timeout` (toybox) to poll `getevent` at 1-second intervals.
- **Download timeout guard**: keybox download wrapped in background + kill loop with 30-second hard cap — prevents endless waits if network hangs.
- **Target.txt prompt**: new prompt after keybox installation — asks whether to run `target.sh` immediately.
- **Removed VBMeta-Fixer from conflict prompt** — the module isn't in the conflict registry, so the installer shouldn't offer a choice for it.

### Conflict Registry — New Additions
- **Sensitive Props** (`sensitive_props`): added with features `boot_hardening`, `suspicious_props`, `rom_spoof`. Detected by `/data/adb/modules/sensitive_props/`.
- **Yurikey Manager** (`Yurikey`): added with features `boot_hardening`, `security_patch`, `suspicious_props`, `rom_spoof`. Detected by `/data/adb/modules/Yurikey/`.
- **Integrity Box** (`integritybox`): added with features `boot_hardening`, `security_patch`, `suspicious_props`, `rom_spoof`, `bootloader_spoofer`, `target`. Detected by `/data/adb/modules/playintegrityfix/` + `/data/adb/Box-Brain/` marker to distinguish from actual PIF.

### Conflict Resolution
- **`apply_conflict_toggles()` now writes both `toggle_*` AND `toggle_action_*`** — previously only wrote `toggle_*`, so the action pipeline bypassed conflict resolution entirely. Now when a conflicting module claims a feature, both boot-time and pipeline toggles are set to 0.
- **NoHello registry narrowed**: `zygisk_nohello` claims reduced from 7 features to just `boot_hardening` — NoHello only sets boot props; the other 6 phantom claims were incorrect and caused Specter features to go missing when NoHello was prioritized.
- **`refreshControlToggles()`**: added missing `toggle-recovery` entry — the recovery toggle was not synced after a conflict change.
- **Removed VBMeta-Fixer from conflict registry** — no overlapping features.
- **Removed `boot_hash` from TSupport-Advance conflict entry** — Specter's boot hash feature no longer conflicts with any module.
- **Removed `boot_hash` from `apply_conflict_toggles()`** iteration — `toggle_boot_hash` is no longer overridden by conflict resolution.

### Feature Script Self-Guards Removed
- **`boot_hash.sh`** and **`security_patch.sh`**: removed internal `cfg_get toggle_* = "0" && exit 0` guard. These scripts are called from multiple contexts (service, boot-completed, action pipeline) each with their own toggle gate. The self-guard was redundant and wrong — e.g., `toggle_boot_hash=0` would block the action pipeline even when `toggle_action_boot_hash=1`.

### PIF Default Off
- `toggle_action_pif` now defaults to `0` (disabled) — PIF has its own update mechanism and shouldn't run from Specter's pipeline unless the user explicitly enables it.
- WebUI toggle defaults updated accordingly in both `wireControlToggles` and `refreshControlToggles`.

### Action Pipeline Message
- Changed misleading `"Meets Strong Integrity with Specter"` to `"Full integrity pipeline completed"` — the pipeline runs the steps but doesn't verify the actual Play Integrity result.

### Early Boot Conflict Resolution
- **New `post-fs-data.sh`**: runs `resolve_conflicts()` at the earliest boot stage (`post-fs-data`), before other modules' scripts execute. This ensures conflicting modules are renamed to `.bak` before they can set their own boot props.
- **`service.sh`**: removed duplicate `resolve_conflicts()` call — now handled by `post-fs-data.sh`.

### Boot-time Features Gated (boot-completed.sh)
- Added `_feature_enabled` gates for `toggle_boot_hardening`, `toggle_boot_hash`, `toggle_security_patch`, `toggle_suspicious_props`, `toggle_rom_spoof` on KernelSU/APatch — previously ran all features unconditionally, ignoring conflict resolution.

### New Features

- **Binary-level prop deletion** (`common.sh`): new `hexpatch_deleteprop()` function — uses `magickboot hexpatch` to overwrite property values in `/dev/__properties__/` with random hex, making deletion undetectable at the API level. Falls back to `resetprop --delete` if magickboot is unavailable. Used by `suspicious_props.sh` for stealthier cleaning.
- **AVB header-based vbmeta.size** (`boot_hash.sh`): parses the real AVB0 header from the vbmeta block device to compute `256 + auth_data + aux_data` sizes — more accurate than `blockdev --getsize64` which gives raw partition size.
- **`ro.boot.vbmeta.invalidate_on_error=yes`** (`boot_hash.sh`): now set alongside the digest for more complete vbmeta prop coverage.
- **Periodic suspicious props re-cleaning** (`service.sh`): re-runs `suspicious_props.sh` every hour in the background — catches properties that get re-set after boot.
- **File permission hardening** (`service.sh`): `/proc/cmdline` → 440, `/proc/net/unix` → 440, `install-recovery.sh` → 440, `/system/addon.d` → 750. Gated behind `toggle_boot_hardening`.
- **Interactive App Targeting overlay** — full-screen Material 3 sub-page replacing SmartMerge:
  - Searchable app list with filter chips (All / Selected / Not Selected)
  - 4-state cycling circle: unchecked → bare → ? → ! per app
  - Selected items always sort to the top
  - Floating Apply button (`md-fab`) with primary colors
  - Cloud-hosted app label catalog (rawbin) with version-based caching
  - Only user-installed apps shown by default; "Show system apps" toggle in three-dot menu (system apps preserve their target.txt state)
  - **Blacklist mode** — switch to blacklist editing via three-dot menu: header turns error-container, state circles become on/off toggle with block icon, filter chips update, apply writes to `/data/adb/Specter/blacklist.txt`
  - Native M3 page transition — slides in from right on enter (300ms, `emphasized-decelerate`), slides back right on exit (200ms, `emphasized-accelerate`), matching standard Android drill-in navigation
  - Magisk DenyList import
  - Back button with muted `secondary-container` accent
  - Div-based dropdown menu matching TS Addon styling
  - Dev mock with 35+ realistic test apps and DenyList data
- **App Catalog management page** (rawbin) — standalone CRUD interface for maintaining package → app name mappings with sortable table, search, dialogs, bulk JSON import/export, and version-based cache invalidation.
- **Full catalog caching** — version check (`/apps/version`) before downloading full catalog; cache stores all 592 entries so system apps get names too.
- **Blacklist consolidated into App Targeting** — removed standalone Blacklist section from Tools page; accessible via overlay's three-dot menu with the same interactive list UI
- **SmartMerge removed** — replaced entirely by the interactive App Targeting overlay
- **Code cleanup** — removed dead translation keys (`menu_smartmerge*`, `toast_smartmerge_saved`, `menu_blacklist`, `menu_blacklist_toggle*`), removed unused imports in `device.ts`, removed orphaned `wireBlacklistToggle` from `app.ts`
- **PlayStrong label fix** — renamed `io.github.mhmrdd.libxposed.ps.passit` from "PassIt" to "PlayStrong" in both the app catalog and RKA error message
- **Security Patch dialog** — "Set Security Patch" now opens an M3 dialog with a date input field pre-filled with the previous month's 5th; added a trailing `autorenew` icon button to auto-generate the computed date; user can edit before saving
- **Consistent logging** — App Targeting overlay now logs all operations with `[TARGET]` prefix to the terminal, matching the convention of other feature scripts
- **WebUI tab persistence removed** — now always opens on Home page instead of restoring the last visited tab across sessions
- **App Targeting moved** — relocated from "Module Configs" to "Tricky Store" section, ordered as 2nd item (after "Set target.txt", before "Set Security Patch")
- **`kmInstallKeybox` search expanded** — Added `/vendor/bin` to search paths and changed `-name` to `-iname` for case-insensitive matching, fixing detection on devices where the binary uses capital letters (`KmInstallKeybox`)

### Bug Fixes
- **Removed `boot_hash.sh`** — the boot hash (`ro.boot.vbmeta.digest`) is computed automatically by the bootloader/AVB. Overriding it is pointless. Removed the feature script, pipeline entry, all action/service/boot references, control toggles, translation keys, and Tools/Control page entries.
- **Removed `pif2.sh`** — "Fix PIF Detection" was a one-time cleanup of ROM spoof engine persistent props. The boot-time `block_rom_spoof_engines` already handles this after every reboot. Any module that requires a restart makes the on-demand button redundant. Removed the feature script, wrapper, Tools page entry, and translation keys.
- **Removed dead `disable_rom_spoof_engines()`** — become orphaned after `pif2.sh` removal. The active `block_rom_spoof_engines()` (used by boot scripts) stays.
- **`_parse_serial` POSIX safety** — added shell capability check before string slicing operations. Falls back gracefully with a warning log if the shell lacks `${var:n:m}` support, instead of silently producing wrong output. Removed the suppressed `SC3057,SC3052` shellcheck warnings.
- **Orphaned `config.json` cleaned up** — 512KB HMA config backup removed from repo root, moved to `docs/examples/hma-config.json`, added to `.gitignore`.
- **ARCHITECTURE.md updated** — removed all references to deleted features (`boot_hash.sh`, `pif2.sh`, `suspicious_props_clean.sh`) from feature lists, pipeline docs, ASCII diagrams, and file counts.
- **Custom keybox URL: raw file no longer copied on decode failure** (`keybox.sh`) — if the downloaded custom keybox isn't valid base64, the script now restores the backup and exits with an error instead of writing garbage to `keybox.xml`.
- **`set -e` safety** (`cleanup.sh`, `common.sh`): added `2>/dev/null || true` guards to `resetprop` calls in `cleanup.sh:105-106` and `disable_rom_spoof_engines():370`. Added `|| true` to `apply_boot_hardening` call in `cleanup.sh:110`. Prevents mid-script abort if these commands fail.
- **Removed dead code** (`common.sh`): `resolve_module_root()` — never called, logic already inlined in `device-info.sh`.
- **Persisted props not restored on uninstall** (`uninstall.sh`) — `sp_persist()` writes `restore|prop|val` format but uninstall checked for `^resetprop -n -p`. Now parses the actual format with `IFS='|'` and emits `resetprop -n -p` for each entry.
- **`apply_prop_hardening()` wiped `ro.build.fingerprint`** (`common.sh`) — `check_prop "ro.build.fingerprint" ""` set the fingerprint to empty string. Removed.
- **Zygisk Next version comparison broken by `v` prefix** (`zygisk_next.sh`) — `version_ge "v1.3.0" "1.3.0"` always returned false because awk casts non-numeric to 0. Added `sed 's/^v//'` to strip the prefix.
- **`apply_prop_hardening()` now consistently returns 0** — prevents `set -e` exits in cleanup.sh.

### i18n / Translations
- **Added 24 missing Control page keys** to all 4 translations (ar, zh, ru, es) — the entire "Boot Behavior", "Action Pipeline", and "Conflict Resolution" sections were previously missing from non-English.
- **Fixed `menu_force_clear_desc`** — updated across all translations to match the new description.
- **Fixed `update_desc`** — was empty in all 4 translations, now translated.
- **Fixed `advance_fix_detect_pif`** — removed spurious `(1)` suffix from Chinese and Russian.
- **Translated previously untranslated keys**: `dialog_cancel`, `tools_danger_zone`, `tools_danger_zone_desc`, `danger_confirm_msg`, `nav_tools`, `nav_control`, `home_security_patch`, 9 `theme_preset_*` color names, 25 tool page descriptions, and 20+ toast/device/history keys.
- **Added 26 new i18n keys**: file browser (empty state, show all), conflict toasts (Module/Specter handles it), priority prefix, toast messages for blacklist/smartmerge/recovery/detection, time labels (Today at / Yesterday at), history buttons (Copy/Copied/Failed), device status labels (TEE Sim, Not Installed, Private Keybox, etc.).
- **Fixed 5 hardcoded English strings** in code: `index.html` (Auto dropdown), `app.ts` (conflict hint + toast), `file-browser.ts` (empty state + show all).
- All 4 translations now at 180 keys — fully synced with source.

### Other
- Updated `docs/CONFLICTS.md` — removed VBMeta-Fixer row, updated NoHello and TSupport descriptions.
- Fixed `README.md` — updated nav reference from Setup to Tools, merged Maintain features into Tools description, added Control page to features list.

## v1.2.0

### Feature Toggle System
- Added Control page — new nav tab with per-feature enable/disable toggles.
- Boot Behavior section — toggle recovery folder hiding, boot hardening, bootloader spoofer block, ROM spoof engine block, and LSPosed ODEX cleanup individually.
- Action Pipeline section — toggle individual action-button steps: kill Play Store, regenerate target, set security patch, set verified boot hash, set fingerprint.
- Toggle values stored as config files via `cfg_get`/`cfg_set` — survive reboots and app uninstalls.
- Every feature script sources `config_env.sh` and gates itself against its toggle before running.

### Conflict Resolution System
- Data-driven conflict registry (`_conflict_registry`) in `common.sh` — single source of truth for module metadata, scripts, and feature claims.
- `_conflict_claimed()` iterates all registry entries dynamically — adding a new conflicting module requires one line in the registry. No hardcoded case blocks.
- `resolve_conflicts()` and `_conflict_claimed()` are now fully data-driven loops over the registry instead of per-module hardcoded blocks.
- `apply_conflict_toggles()` now correctly enables Specter features when no module claims priority, and disables them when any `priority_module` claims the feature.
- `conflict_set_choice()` — saves choice to module config, renames/restores the conflicting module's boot scripts, and recalculates all toggles.
- Config migration: old `/data/adb/Specter/config/conflict_*.val` files are automatically migrated to module config on first boot.
- Conflict backup system restored — `conflict_backups.txt` tracks renamed scripts so `uninstall.sh` can restore them.
- WebUI integration: `conflicts.sh` helper script exposes JSON status and set commands to the WebUI.
- Removed hardcoded module lists from TypeScript — all conflict data comes from shell registry via JSON.
- Toggle states refresh live after conflict change — no page reload needed.
- `apply_prop_hardening()` now consistently returns 0 — prevents `set -e` exits in cleanup.sh.

### WebUI Restructure
- Merged Setup and Maintain pages into single Tools page — 5 nav tabs reduced to 4 for better phone fit.
- Old `#setup` and `#maintain` URL hashes automatically migrate to `#tools` on first load.
- Last-visited tab persistence migrated accordingly.

### Navigation
- Double-tap nav tab: 1 tap switches page (no scroll reset), 2 taps on same tab scrolls to top.
- Nav bar right-padding clipping fixed — removed `max-width` constraint.

### Install Behavior
- Removed forced `target.sh` execution on module flash — no longer overwrites user's custom target.txt on reinstall.
- Conflict detection prompt during install — detects bootloader spoofer, HyperCeiler, LuckyTool packages and asks whether to block them at boot.

### Action Pipeline
- Replaced monolithic `orchestrator.sh` call in `action.sh` with individually gated feature calls — skipped features log nothing and don't abort the pipeline.
- `block_rom_spoof_engines` wrapped in background subshell for boot safety.

### Feature Script Improvements
- `gms.sh`: DroidGuard process kill by name pattern — kills droidguard processes even if their packages aren't listed.
- `target.sh`: TEESimulator detection refactored to use `_is_teesimulator` helper instead of fragile module.prop author parsing.
- `boot_hash.sh`: persists computed boot hash via `cfg_set stored_boot_hash`.
- `package_list.sh`: `GMS_KILL_LIST` deduplicated and reorganized — removed redundant entries, added safetycore.
- `disable_bootloader_spoofer` respects user's install-time conflict choice flag.

### Dialog Redesign (Material Design 3)
- `confirmDestructive`: Rewritten per M3 alert dialog spec — added `warning` icon in error-container circle, action name as headline, `md-filled-button` with error tokens for confirm action. Removed all inline styles.
- `openFileBrowser`: Complete rewrite — replaced 40+ inline style attributes with CSS classes, removed inline `onmouseenter`/`onmouseleave` event handlers (now CSS `:hover`), fixed button from `md-filled-tonal-button` to `md-filled-button`, added XSS-safe `escapeHtml()`.
- `privateChoice`: Both buttons changed to `md-text-button` (equal binary choice), removed `type="alert"`, removed all inline styles.
- `detectedDialog`: Added `type="alert"`, changed confirm button to `md-filled-button`, replaced all inline styles with CSS classes.
- `showErrorDialog`: Added `type="alert"` for proper alertdialog ARIA role, renamed generic class.
- `runDevAction`: Scoped generic class names to avoid conflicts.
- `danger_confirm` translation changed from `"Continue"` to `"Proceed"` across all 5 languages.

### README
- Updated screenshot grid to match new nav structure — replaced `setup.png`/`maintain.png` with `tools.png`/`control.png`.

### Documentation
- Added Legal disclaimer — educational purposes only, no liability for misuse.
- Added Warning section — outlines risks (warranty void, boot loops, app bans, etc.).
- Added Support section with Ko-fi, PayPal, BTC, and ETC donation options.
- Added `docs/CONFLICTS.md` — conflict handling policy with per-module resolution table.

### Other
- README simplified — replaced verbose background with quick start, streamlined features list, added screenshot grid.
- Removed CI badge from README.

## v1.1.0

### GMS & Boot Stability
- Removed multi-package GMS force-stop from boot loop — was logging users out of Google accounts and causing root manager crashes. Replaced with lightweight Play Store-only kill via `kill_play_store.sh`.
- Added `detect_root_solution()` call in `service.sh` and `boot-completed.sh` so `$ROOT_SOL` is properly set before prop operations.
- Replaced inline installer-env root detection in `customize.sh` with `detect_root_solution()`.

### Property System
- Replaced `resetprop_if_diff` / `resetprop_if_match` with streamlined `sp_try()`.
- Renamed `persistprop` → `sp_persist()`.
- Added `disable_bootloader_spoofer()` — scans for 3 packages (bootloader spoofer, HyperCeiler, LuckyTool).

### HMA-OSS
- Uses `$HMA_DIR`/`$HMA_FILE` from centralized `paths.sh`.
- Built-in fallback template with 60 apps using proper HMA-OSS schema.

### Boot Hash
- Guarded `read_vbmeta()` with command availability check — no more exit 127 on devices without sha256sum/blockdev.

### Target Script
- TEESimulator locked.xml section rewritten — uses `sed`+`grep -Fvxf` with temp files (compatible with Android's mksh).
- Props in `service.sh` reorganized into logical groups.

### New Files
- `features/kill_play_store.sh` — Play Store kill moved here, out of boot loop.
- `features/suspicious_props.sh` — scanner for persistent prop artifacts.
- `lib/package_list.sh` — extended with centralized package lists.

### Removed
- `post-fs-data.sh` — merged into `service.sh`.
- `webroot/js/clock.ts` — dead file.
- Orphaned i18n keys cleaned up from 4 translation files.

### WebUI
- Navigation restructured: replaced Actions/Advanced/Keybox/Tools with Home/Setup/Maintain/Settings — clearer per-tab purpose.
- Added Danger Zone section under Maintain tab — red error-colored header for destructive operations.
- Added confirmation dialog for all destructive actions — error-colored alert with Cancel/Continue.
- URL hash routing (`#home`, `#setup`, `#maintain`, `#settings`) with `popstate` listener for back/forward.
- Tab persistence — last visited tab saved to localStorage, restored on reload.
- Removed active-tab guard — re-tapping navigates to the tab (acts as refresh).
- Increased section title font sizes for better readability.
- Danger Zone description spacing tightened.
- RTL centering for nav-bar and toast.
- Synced missing i18n keys across all translations, cleaned up orphaned keys.
- Removed hardcoded module path fallback.

### Logging
- Most feature scripts follow `[TAG] Start` / `[TAG] Finish` pattern (16/18; `cleanup.sh` and `kill_play_store.sh` use alternative wording).
- `pif.sh`: rewritten to detect variant by script presence on disk, logs variant and per-script results.
- `pif2.sh`: logs spoof engine detection status.
- `zygisk_next.sh`: state-aware loop, reports N/3 settings applied.

### Other
- curl binary verification before use — falls back to wget if broken.

## v1.0.0

### Architecture
- Migrated from vanilla JS to strict TypeScript with Vite bundling
- Replaced BeerCSS with Material Web Components (Google MWC)
- Replaced static color presets with dynamic Material Color Utilities (+ Monet system accent extraction)
- Pipeline-driven orchestration via `orchestrator.sh` instead of hardcoded sequential scripts
- Shared shell library (`lib/common.sh`) with reusable helpers
- Centralized config persistence via `ksud module config` with file-based fallback
- Bridge abstraction layer (`bridge.ts`) for KernelSU API

### Keybox Management
- Keybox revocation checking sourced directly from Google's attestation endpoint
- Multi-source keybox catalog with provider selection
- Custom keybox installation via file browser, URL, or device path
- Private keybox support with serial detection before install
- Keybox status card with source, version, format, and revocation info
- Keybox backup and restore on module update/uninstall

### Security Spoofing
- Delayed spoofing (120s) — re-applies critical props after boot completion
- Early boot property setup via `post-fs-data.sh` (ROM props, VBMeta, CROM detection)
- Boot completion handler for KernelSU/APatch hardening
- Comprehensive property management (~40+ props) with `resetprop_if_diff`/`resetprop_if_match`
- Persistent property setting across reboots (`persistprop`)
- VBMeta reading from real block device instead of hardcoded values
- CROM spoof hook detection to disable conflicting ROM-level spoofing

### New Features
- Blacklist system — exclude detector apps from target.txt (editable with defaults)
- SmartMerge — per-app targeting suffixes (! force, ? conditional, #disable)
- Developer mode — show raw script names with terminal output
- In-app terminal — live streaming execution logs
- Boot behavior toggle — auto-hide recovery folders (TWRP, OrangeFox, etc.)
- File browser — browse device filesystem for custom keybox
- Keybox detection — checks serial against remote catalog before install
- Rich toasts with icons, action buttons, types (success/error/info)
- 9 color presets (blue, yellow, red, purple, green, orange, pink, cyan, grey) + Monet
- Dark/light/auto theme modes with segmented button selector
- Page transition animations

### Shell Scripting
- Pipeline system (`pipelines/full_integrity`, `pipelines/root_hide`)
- 16 modular feature scripts replacing monolithic Yuri/ directory
- DroidGuard process killer in service loop
- Multi-root support (Magisk / KernelSU / APatch) with runtime detection
- Comprehensive uninstall — cleans configs, boot hash, RKA, migration markers
- Module path discovery via JSON fallback chain

### WebUI
- TypeScript with strict mode, typed interfaces for all data structures
- Material 3 floating pill navigation with animated indicator
- 5 language translations (en, zh, ru, es, ar)
- MWC components throughout (cards, dialogs, chips, selects, switches, buttons)
- Real-time clock with configurable format
- Network status indicator with offline detection
- Project contributors grid
- Developer mode toggle with terminal output
- `prefers-reduced-motion` support

### CI/CD
- GitHub Actions build and release workflow
- TypeScript type checking on CI
- Automated module zip packaging
- Automatic `update.json` version bump on release
- Vite development server for local WebUI dev
- Dev mock for browser-only development

### Other
- Rebranded from Yurikey to Specter
- Updated module ID, author, and repository URLs
- Removed 23 unused language translations (kept 5 most relevant)
- Removed snackbar color customization tool
- Removed "Set Necessary App" feature
- Removed app icon and banner image
- Cleaned up dead code and unused dependencies
