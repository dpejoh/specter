# v1.4.4.08

**Breaking:** Module ID → `specter` (lowercase), data dir → `/data/adb/specter`, config/backup paths centralized.

**Removed:** LSPosed ODEX Clean, `boot-completed.sh`, `target_merge.sh`, denylist merge, `loop_keybox_info` scheduler, `DETECTOR_APPS`/`REMOTE_CONTROL_APPS`/`BLACKLIST_EXTRA`/`SUSPICIOUS_PROPS` lists, dead home-page mini-cards, all `cfgInvalidate()` calls, `cfgFlush()`.

**New:** First-boot setup (auto-backup + keybox install), Restore Backups action, Custom Boot Hash UI, Region Props toggle.

**Rewritten:** `boot_state_props.sh` — no `nsenter`, directly scans persistent_properties for lsposed/hyperceiler/luckytool. Control toggles generated from TypeScript. TEE APK installed at flash time.

**Infra:** `MODULES_BASE` variable centralizes all module paths. API endpoints → `rawbin.dpejoh.com`.

# v1.4.4.07

**Type safety:** Zero `as any` casts, strict tsconfig, typed error hierarchy, TSDoc on public APIs.

**Shell:** `version_ge()` no longer depends on `awk` (POSIX-sh). Bridge callback rewritten (private Map, no global namespace pollution).

**Testing:** 65 vitest tests, CI integration, 16 shell tests.

**Removed:** Recovery feature entirely. Prop handler out of scheduler.

**Added:** Scheduler daemon (keybox_info/6h, auto_target/5min, inotifyd). Region props. Denylist merge at boot. Boot logging with rotation.

**Changed:** Keybox boot race fixed (60s delay). Auto-target → one-shot. Target-apps click split. Props save originals for uninstall. ROM fingerprint scrubs Lineage camera lists. Action pipeline uses `tee` + rotation. 10 new i18n keys.

# v1.4.4

**New:** ADB Disabler, GMS sub-toggles (force-stop vs clear data), interactive WebUI dialogs, conflict resolution UI, security patch from source.android.com, target.sh `--merge` mode, long-press nav ring.

**Changed:** Boot state/build/suspicious props consolidated into `boot_state_props.sh`. TEE uses A/B slot. HMA tries busybox wget first. cleanup.sh clears logs/ANR/traces. pif.sh detects type from module.prop.

**Removed:** `bootloader_spoofer.sh`, `suspicious_props.sh`, PIHook detection, remote control app cleanup, unused pipelines.

**Refactored:** `common.sh` split into modular libs. Action pipeline uses `orchestrator.sh`. `target_merge.sh` is thin wrapper.

**Installer:** Rewritten `_vol()` with countdown, merged keybox+target prompt.

**Fixes:** HyperOS bootloops, CROM spoof engine backup, KSU/APatch mount namespace escape, A/B slot handling, GMS targets, mksh compatibility, keybox_info JSON validity.

# v1.4.3

**Home page:** Hero-grid (keybox + security patch), inline recent activity with lazy DOM, auto-refresh on tab visit, localStorage cache removed.

**Keybox decoupled:** Shell-daemon approach — `keybox_info.sh` runs at boot, every 6h, and after installs. WebUI reads pre-computed JSON only (no more catalog/revocation fetches).

**RKA removed entirely:** All feature files, paths, i18n keys, README references deleted.

**PIF:** `.prop` and `.json` detection, `pif_model` field in InfoJson, preflight reachability checks.

**Polish:** Typography tuning, taller top bar (64px), pill buttons, auto-refresh replacing refresh button.

# v1.4.2

**Performance:** 3× faster network check, one-pass JSON read, TEE retry loop, single `pm list packages`.

**HMA:** Fixed silent empty download, hardened `download()`.

**Boot:** `keybox_info.sh` backgrounded, catalog revocation restored for description, `security_patch.sh` at boot, redundant refresh calls pruned.

**WebUI:** Dynamic i18n (English inlined, others cached), AMOLED theme, parallel refresh, catalog analysis in browser, copy buttons, responsive contributors grid.

**Other:** Dead code removed, OEM unlock toggle removed from hardening, VitePress docs split to separate repo. Contributors: @myst-25.

# v1.4.1

**Control fixes:** Recovery toggle, md-switch `selected`, config path, keybox detection (network gate removed), multi-cert decode, stale status refresh, config simplified (`.val` only), conflict system.

**Boot:** One-time markers, TEE via APK ContentProvider, target.txt merge preserves order.

**Keybox:** Softbanned status, auto-override endpoints, three-state chip (Active/Softbanned/Revoked).

**Module description:** Dynamic live refresh — keybox source, revocation, app count, patch date.

## Other
- APK bundling; Suspicious Props toggle added to UI; USB debugging code removed; TEE APK self-removes

# v1.4.0

## Performance
- **Page renders instantly**: placeholders, code splitting (490KB→4 chunks), inlined CSS, parallel MWC download
- **Native `<select>`**: eliminated 120KB MWC select chunk
- **Back button**: first press Home, second exits
- **Offline detection**: 2000ms→800ms

## Theme
- **Theme flash eliminated**: inline script sets CSS vars before first paint; cached in localStorage
- **MCU library replaced**: 97KB → 7.5KB lookup table; Monet accent mapped to closest preset

## i18n
- **English strings inlined**; non-English cached in localStorage

## Boot State Properties
- **Vendor boot props** reset alongside `ro.boot.*`; `ro.build.flavor` spoofed; Realme props added
- **Recovery bootmode** masked; toggle added to Control

## Other
- Security Patch fetched from source.android.com; suspicious props backed up before delete
- Google Services section in Tools; module zip 175KB→159KB

# v1.3.3

## Features
- **Dynamic module description**: priority-based status line (keybox, revocation, apps, patch)
- **One-time TEE check**: APK downloaded, run, self-deletes after caching result
- **"Fix PIF Detection" button restored**: boot function only set guard props — `block_rom_spoof_engines()` now actively removes `pihook`/`pixelprops`

## Boot Refactor
- **`apply_boot_props()`**: early boot only, no AVB override, Magisk-only
- **Unified boot logic**: `lib/boot_core.sh` for both `service.sh` and `boot-completed.sh`
- **`_feature_should_run()`**: single toggle+conflict gate
- **Feature scripts extracted**: `boot_hardening.sh`, `bootloader_spoofer.sh`, `rom_spoof.sh`
- **Toggle/LSPosed/recovery/hardening fixes** for KSU and Magisk parity

## Installer
- **Module detection**: reads module.prop for variant; consolidated `detect_root_solution()`
- **Conflict registry**: extracted to `config/conflicts.txt`

## Other
- 14 conflict tests; `twrp.sh`→`recovery.sh`; dead code removed

# v1.3.2

## Conflict Type System
- **Aggressive vs passive**: aggressive (TSupport, Yurikey, IntegrityBox) renamed to `.bak`; passive (TreatWheel, NoHello, SensitiveProps) coexist with deferred toggles
- **`_conflict_claimed()`** honors priority choice; passive skips rename, only recalculates toggles
- **Treat Wheel**: corrected from 3 features to just `boot_hardening`
- **Sensitive Props**: corrected from 3 features to `boot_hardening`, `suspicious_props`

## Other
- TEE status detection: reads both `tee_status` and `tee_status.txt` formats
- `disable_dev_options()` removed; all vol-key conflict prompts removed (fully automatic)

# v1.3.1

## WebUI Restructure
- **app.ts split**: 844→140 lines; 5 domain modules extracted
- **target-apps.ts**: 7 mutable vars eliminated, state local to closure

## Performance
- **Batch config init**: single exec reads all `.val` files (~15× fewer round trips)
- **HTTP fetch cache**: TTL-based; network polling 3s→15s

## APatch / KSU
- **`download()` PATH**: added `/data/adb/ap/bin:/data/adb/ksu/bin` for busybox
- **Keybox fallback**: real provider URLs, `download()` instead of `--spider`

## Type Safety
- **17 MDC elements typed**: ~60 `as any` eliminated; dialog factory; zero type errors

## Other
- System fallback for security patch; nav bar indicator fixed; responsive browse button

# v1.3.0

## VBMeta / Boot Hash
- **`read_vbmeta()` removed**: raw partition SHA-256 was incorrect
- **`boot_hash.sh` rewritten**: system prop → `/proc/cmdline` → user config → stored file; no zero fallback
- **`/proc/cmdline` source**: bootloader digest survives module interference

## Installer
- **Timeout on vol-key prompts** (8s default); download timeout guard (30s)

## New Features
- **Interactive App Targeting overlay**: full M3 sub-page, 4-state cycling, blacklist mode, DenyList import
- **App Catalog management**: CRUD, sortable, JSON import/export
- **Security Patch dialog**: M3 date input with auto-generate
- **Binary-level prop deletion**: `hexpatch_deleteprop()` via magickboot
- **Periodic suspicious props re-cleaning** (hourly)
- **File permission hardening**: /proc/cmdline, /proc/net/unix, install-recovery.sh, addon.d

## Conflict Resolution
- **`apply_conflict_toggles()`** writes both `toggle_*` and `toggle_action_*`
- **NoHello narrowed**: 7→1 feature; `refreshControlToggles()` missing recovery entry fixed
- **New registry entries**: Sensitive Props, Yurikey, Integrity Box

## i18n
- **All 4 translations** synced to 180 keys; 24 missing Control keys added; 26 new keys

## Removed Features
- **`boot_hash.sh` removed**: boot hash is automatic
- **`pif2.sh` removed**: boot-time `block_rom_spoof_engines` covers it
- **SmartMerge removed**: replaced by App Targeting overlay
- **WebUI tab persistence removed**: always opens Home

## Other
- PIF default off; `post-fs-data.sh` for early conflict resolution; hex→decimal serial safety

# v1.2.0

## Feature Toggle System
- **Control page**: per-feature toggles for boot behavior and action pipeline; values stored as `.val` files

## Conflict Resolution System
- **Data-driven registry**: single source of truth; adding a module is one entry
- **`apply_conflict_toggles()`**: auto-enables/disables based on priority
- **Config migration**: old conflict files migrated; backup system for uninstall
- **WebUI integration**: `conflicts.sh` exposes JSON; toggles refresh live

## WebUI
- **Setup + Maintain merged** into Tools (5→4 tabs); old hashes auto-migrate
- **Dialogs rewritten per M3 spec**: no inline styles, proper ARIA

## Other
- No forced target.txt on install; action pipeline individually gated
- `gms.sh` kills droidguard by name pattern; `target.sh` uses `_is_teesimulator`
- `docs/CONFLICTS.md` added; README simplified

# v1.1.0

- **GMS stability**: no multi-package force-stop (caused logouts); Play Store-only kill
- **Property system**: `sp_try()` replaces `resetprop_if_diff`/`resetprop_if_match`; `sp_persist()` replaces `persistprop`
- **New scripts**: `kill_play_store.sh`, `suspicious_props.sh`, `package_list.sh`
- **`post-fs-data.sh` merged** into `service.sh`
- **WebUI navigation**: Actions/Adevanced/Keybox/Tools → Home/Setup/Maintain/Settings; Danger Zone added
- **URL hash routing** with popstate; tab persistence; RTL centering
- **Logging**: 16/18 scripts follow `[TAG] Start/Finish` pattern

# v1.0.0

- **Rebranded from Yurikey to Specter**
- **Architecture**: vanilla JS → strict TypeScript + Vite; BeerCSS → MWC; static colors → Material Color Utilities + Monet
- **Pipeline orchestration** via `orchestrator.sh`; shared `lib/common.sh`; config via `ksud module config`
- **Keybox**: Google revocation checking, multi-source catalog, custom install, status card, backup/restore
- **~40+ boot props** with delayed spoofing; VBMeta from block device; CROM hook detection
- **16 modular feature scripts**, multi-root support (Magisk/KSU/APatch)
- **WebUI**: M3 pill nav, 5 languages, 9 color presets, dark/light/auto, page transitions
- **CI/CD**: GitHub Actions, TS checking, automated module zip + update.json
