# v1.4.4-16

**New**
- Conflict system: 3-tier (aggressive/moderate/passive), data-driven from conflicts.txt
- TA_utl/TA_enhanced moved to moderate (no desc warning)
- pihooks spoof engine detection
- Turkish + Polish translations
- Auto keybox random selection from working entries
- inotifyd watcher for instant app detection
- Pipeline runs recorded to history (recent activity shows "Action" entries from terminal runs)
- 10s network wait on first boot before pipeline

**Changed**
- Monet: HSL → HCT (CAM16) color matching
- Zygisk Next: no `zygiskd` dep, writes config directly
- Logging: simplified to single-format output, removed dual-path complexity
- action.sh: start/end pipeline messages, blank line separators between phases
- Recent activity: descriptions taken from last log line instead of per-script extractors
- Actions: single runAction path, dev mode removed
- Security patch offline fallback: uses current month instead of previous
- auto_target cleans stale/blacklisted entries
- ADB disabler: simplified USB config
- config_env.sh: removed unnecessary stderr redirects
- keybox.sh: fix download corruption in KernelSU action env (use direct file arg instead of stdout pipe)
- First boot: 10s network wait before pipeline in first_boot_setup.sh

**Fixed**
- Hundreds of AI mistranslations (ar/es/ru/zh)
- Inotify handler missing MODULES_BASE
- TEE button stale cache
- TEE status shows Normal/Broken not raw bool
- Scheduler stale PID false match after reboot
- Recent activity clear button now also clears device-side history
- History write skipped on first boot (avoids noise)
- Keybox download returning corrupted data in KernelSU action env
- Minor fixes across features

**Infrastructure**
- 97 shell tests
- Crowdin CI + weekly sync

# v1.4.4-15

**New**
- Pull-to-refresh on App Targeting page with refresh icon indicator
- Auto keybox: periodic fetch via scheduler task (disabled by default), interval config dialog
- Export Logs button in Tools
- Merge KSU + pm list packages for PTR (accept no labels/icons for newly installed apps)

**Changed**
- UI overhaul: keyboard overlap fix, remove tap highlights, aesthetics pass
- Unify boot hash resolution chain, fix TEE history name, immediate resetprop on save
- App labels resolved via dumpsys for KSU cache misses instead of remote catalog
- ta-list includes target.txt entries not in pm list so new apps appear after PTR
- Build scripts: `npm run build:release` for release zips without commit hash; `npm run build` for dev zips with hash
- `customize.sh`: omit TEE status line when status file missing

**Fixed**
- Auto-target not working after clean install — missing toggle `.val` files created on boot
- Scheduler stale PID check: `kill -0` can match reused PID after reboot; now verifies cmdline
- inotifyd handler exits when `toggle_auto_target.val` missing — shell default fallback (`${_cg_val:-1}`)
- Auto-target inotify handler uses `su -c` to bypass KernelSU SELinux restrictions

# v1.4.4-14

**Changed**
- Conflict system rewritten: toggle `.val` files are the single source of truth; `resolve_conflicts()` writes `toggle_<feature>=0` for claimed features; `_feature_should_run()` checks toggle only (removed separate `_conflict_claimed()` gate); conflict section priority switches batch-update toggles
- `action.sh` and `auto_target.sh` use `_feature_should_run()` instead of manual `_conflict_claimed()` checks
- `conflict_set_choice()` syncs feature toggles when priority changes
- Dialog UIs (prop-handler, boot-harden, gms, adb-disabler, rom-fingerprint) check parent toggle state — child switches disabled with banner when parent is OFF
- Feature names exposed in `conflict_status_json()` + shown in UI hint text
- `exec()` bridge: added timeout, fixed exit code extraction from JSON responses
- CI cleanup: removed Playwright e2e and coverage (trimmed ~50s per run), fixed shellcheck warnings

**Fixed**
- `_conflict_registry()` fallback path broke when `$MODDIR` unset in web bridge — BRENE never appeared in conflict section
- Passive module conflict choices overwritten every boot (user selection wiped on reboot)
- sha256sum mock recursion in tests (hung for 18s on CI)

# v1.4.4-13

**New**
- `boot_hash.sh`, zero-rejection boot hash priority chain (TS file → TEE → prop → partition)
- Zygisk Next auto-install in customize.sh (+ PIF-style zygisk detection via libzygisk.so + Magisk SQLite)
- Conflict uninstall runs module's `uninstall.sh` before removing dir

**Changed**
- `apply_vbmeta_props()` no longer sets digest prop (moved to `boot_hash.sh`)
- `service.sh` runs `boot_hash.sh` after `tee.sh`
- `customize.sh` refactored: detect all modules first → summary → install only missing → first-boot
- Install order: Zygisk Next → TEESimulator-RS → PIF

**Fixed**
- Boot hash never set to zeros, every source rejects all-zero values

**Improved**
- Recent activity shows per-script descriptions (e.g. "Keybox: Yuri v54", "TEE normal · 9530...")

# v1.4.4-12

**New**
- BRENE conflict resolution (passive, boot_hardening/prop_handler/boot_hash)
- boot_hash.sh writes computed hash to BRENE's config when BRENE has priority
- `install_module_from_github()` + `module_detect()` in new `lib/modules.sh`, shared module download, install & detection
- PIF auto-install in action.sh & customize.sh (KOWX712/PlayIntegrityFix)

**Changed**
- customize.sh uses shared functions for TEESimulator-RS & PIF detection/install
- `module_install.sh` renamed to `modules.sh`
- common.sh sources modules.sh

**Fixed**
- `vbmeta_digest()` in `vbmeta.sh`, fixed variable pollution, footer size, and shell syntax bugs
- `boot_hash.sh` now called from `service.sh`; redundant digest set removed from `props.sh`
- TEE & Boot Hash popup uses `boot_hash.sh` priority chain instead of raw TEE hash

# v1.4.4-11

**New**
- TEESimulator-RS auto-download & install on customize.sh when Tricky Store is absent (silent)
- TEE & Boot Hash button
- Google Sans + JetBrains Mono font toggles
- Fonts stored in `webroot/fonts/`

**Changed**
- Conflict system rewritten (aggressive modules with priority_specter get full uninstall instead of script rename)
- Two-pass `_conflict_claimed()` gates added to action.sh / auto_target.sh
- sensitive_props promoted to aggressive
- Custom boot hash saved to SPECTER_DIR/config
- Security patch dialog pre-fills current value
- HMA saves config to /sdcard/Download
- desc.sh incremental problem builder (TS missing + conflicts shown together)
- Circular app icons in target-apps
- Monospace uses `--sp-font-mono` CSS var throughout

**Removed**
- Dead `_conflict_claimed` calls from service.sh
- Redundant `unzip deps/classes.dex`, `keybox_info.sh`, `refresh_module_description` from customize.sh

# v1.4.4-10

**New**
- App icon resolution in target-apps overlay (IntersectionObserver, KernelSU native APIs, fallback SVG)
- `app_info.sh` for native app label resolution from `dumpsys package`
- `decode.sh` library (shared alphabet-substitution decoder)

**Changed**
- TEE attestation consolidated into single `runAttestationCheck()` with cleaner ASN.1 tag constants
- App labels resolved via KernelSU `getPackagesInfo()` instead of remote catalog API
- widevine.sh decodes shuffled-base64 attestation key
- keybox.sh uses shared `decode_substitution()` from decode.sh
- Vite build target set to `es2019`
- CSS `ta-list` padding reduced (20px → 15px)

**Removed**
- Remote app catalog API dependency (`rawbin.dpejoh.com/apps`)
- Separate `checkTeeFunctional()` / `extractBootHash()` methods (merged)

# v1.4.4-09

**Breaking**
- Module ID changed to `specter` (lowercase)
- Config and backup paths centralized

**New**
- Custom Boot Hash UI, Restore Backups action, Region Props toggle
- Background Jobs section (Auto-Targeting, Keybox Info Refresh toggles)
- Auto-target Instant/Polling method selector

**Rewritten**
- Boot logic consolidated into `service.sh` for all root solutions
- TEE check via `app_process` (classes.dex), no APK install
- `boot_state_props.sh` scans persistent_properties directly
- Control toggles generated from TypeScript, action pipeline inlined
- HMA config install with sandbox escape fallback

**Changed**
- `MODULES_BASE` variable centralizes all module paths
- API endpoints moved to `rawbin.dpejoh.com`
- TEE deps extracted at flash time instead of boot
- Backups stored in `$SPECTER_DIR/backup/`
- CONFIG_DIR relocated to `$SPECTER_DIR/config/`
- Online check timeout 800ms → 1500ms
- `build.sh` extracts classes.dex instead of copying APK

**Removed**
- LSPosed ODEX Clean, `boot-completed.sh`, `target_merge.sh`, `orchestrator.sh`, `boot_core.sh`
- Denylist merge, `loop_keybox_info` scheduler, `migrate_conflict_config`
- `DETECTOR_APPS`, `REMOTE_CONTROL_APPS`, `BLACKLIST_EXTRA`, `SUSPICIOUS_PROPS` lists
- `disable_bootloader_spoofer`, `hexpatch_deleteprop`, TEESimulator handling
- Dead home-page mini-cards, `cfgInvalidate()`/`cfgFlush()` calls
- Detector app directory cleanup, `getRecentEntries`, `flags` from InfoJson

# v1.4.4-07

**Added**
- Scheduler daemon (keybox_info/6h, auto_target/5min, inotifyd)
- Region props
- Denylist merge at boot
- Boot logging with rotation
- 65 vitest tests, CI integration, 16 shell tests
- Type safety: zero `as any` casts, strict tsconfig, typed error hierarchy, TSDoc on public APIs

**Changed**
- Keybox boot race fixed (60s delay)
- Auto-target → one-shot
- Target-apps click split
- Props save originals for uninstall
- ROM fingerprint scrubs Lineage camera lists
- Action pipeline uses `tee` + rotation
- 10 new i18n keys
- `version_ge()` no longer depends on `awk` (POSIX-sh)
- Bridge callback rewritten (private Map, no global namespace pollution)

**Removed**
- Recovery feature entirely
- Prop handler out of scheduler

# v1.4.4

**New**
- ADB Disabler
- GMS sub-toggles (force-stop vs clear data)
- Interactive WebUI dialogs
- Conflict resolution UI
- Security patch from source.android.com
- target.sh `--merge` mode
- Long-press nav ring

**Changed**
- Boot state/build/suspicious props consolidated into `boot_state_props.sh`
- TEE uses A/B slot
- HMA tries busybox wget first
- cleanup.sh clears logs/ANR/traces
- pif.sh detects type from module.prop

**Removed**
- `bootloader_spoofer.sh`, `suspicious_props.sh`, PIHook detection
- Remote control app cleanup
- Unused pipelines

**Refactored**
- `common.sh` split into modular libs
- Action pipeline uses `orchestrator.sh`
- `target_merge.sh` is thin wrapper

**Installer**
- Rewritten `_vol()` with countdown
- Merged keybox+target prompt

**Fixes**
- HyperOS bootloops
- CROM spoof engine backup
- KSU/APatch mount namespace escape
- A/B slot handling
- GMS targets
- mksh compatibility
- keybox_info JSON validity

# v1.4.4

**New**
- Pull-to-refresh on App Targeting page
- Default Mode dialog for target apps (Auto/Leaf/Gen + override switch)
- Custom boot hash Priority 0 in 4-tier chain; immediate `resetprop` on save
- Auto keybox: periodic fetch via scheduler task (disabled by default), interval config dialog

**Changed**
- Boot hash chain: Custom → TEE → prop → partition; `vbmeta.sh` deleted, logic merged into `boot_hash.sh`
- `TEE_HASH` → `TEE_BHASH`; files renamed accordingly
- Prop Handler dialog: added "TEE Boot Hash", removed "VBMeta Integration"
- Conflict hints use human-readable names via `FEATURE_I18N_KEYS`
- Boot hash UI is read-only (no Update cache/save)
- `toggle-vbmeta` removed from Control; `toggle_autopif` default `0`
- Auto-target inotify handler simplified; uses `su -c` to bypass KernelSU SELinux restrictions

**Fixed**
- Boot hash never applied on first boot (`tee.sh` ran after `boot_hash.sh`)
- Scheduler stale PID check: `kill -0` can match reused PID after reboot; now verifies cmdline

# v1.4.3

**New**
- Hero-grid home page (keybox + security patch)
- Inline recent activity with lazy DOM, auto-refresh on tab visit
- localStorage cache removed
- `.prop` and `.json` PIF detection, `pif_model` field in InfoJson
- Preflight reachability checks

**Changed**
- Shell-daemon keybox approach (`keybox_info.sh` at boot, every 6h, and after installs)
- WebUI reads pre-computed JSON only (no more catalog/revocation fetches)
- Typography tuning, taller top bar (64px), pill buttons
- Auto-refresh replacing refresh button

**Removed**
- RKA entirely (all feature files, paths, i18n keys, README references)

# v1.4.2

**Performance**
- 3× faster network check
- One-pass JSON read
- TEE retry loop
- Single `pm list packages`

**Boot**
- `keybox_info.sh` backgrounded
- Catalog revocation restored for description
- `security_patch.sh` at boot
- Redundant refresh calls pruned

**WebUI**
- Dynamic i18n (English inlined, others cached)
- AMOLED theme
- Parallel refresh
- Catalog analysis in browser
- Copy buttons
- Responsive contributors grid

**Fixed**
- Silent empty HMA download, hardened `download()`

**Other**
- Dead code removed
- OEM unlock toggle removed from hardening
- VitePress docs split to separate repo
- Contributors: @myst-25

# v1.4.1

**Control fixes**
- Recovery toggle, md-switch `selected`, config path
- Keybox detection (network gate removed)
- Multi-cert decode
- Stale status refresh
- Config simplified (`.val` only)
- Conflict system

**Boot**
- One-time markers
- TEE via APK ContentProvider
- target.txt merge preserves order

**Keybox**
- Softbanned status
- Auto-override endpoints
- Three-state chip (Active/Softbanned/Revoked)

**Module description**
- Dynamic live refresh (keybox source, revocation, app count, patch date)

**Other**
- APK bundling
- Suspicious Props toggle added to UI
- USB debugging code removed
- TEE APK self-removes

# v1.4.0

**Performance**
- Page renders instantly (placeholders, code splitting 490KB→4 chunks, inlined CSS, parallel MWC download)
- Native `<select>` eliminated 120KB MWC select chunk
- Back button first press Home, second exits
- Offline detection 2000ms→800ms

**Theme**
- Theme flash eliminated (inline script sets CSS vars before first paint, cached in localStorage)
- MCU library replaced (97KB→7.5KB lookup table, Monet accent mapped to closest preset)

**i18n**
- English strings inlined, non-English cached in localStorage

**Boot state props**
- Vendor boot props reset alongside `ro.boot.*`
- `ro.build.flavor` spoofed, Realme props added
- Recovery bootmode masked, toggle added to Control

**Other**
- Security patch fetched from source.android.com
- Suspicious props backed up before delete
- Google Services section in Tools
- Module zip 175KB→159KB

# v1.3.3

**New**
- Dynamic module description (priority-based status for keybox, revocation, apps, patch)
- One-time TEE check (APK downloaded, run, self-deletes after caching)
- `block_rom_spoof_engines()` actively removes pihook/pixelprops

**Refactored**
- `apply_boot_props()` early boot only, no AVB override, Magisk-only
- Unified boot logic in `lib/boot_core.sh` for service.sh and boot-completed.sh
- `_feature_should_run()` single toggle+conflict gate
- Feature scripts extracted: `boot_hardening.sh`, `bootloader_spoofer.sh`, `rom_spoof.sh`

**Installer**
- Module detection reads module.prop for variant
- Consolidated `detect_root_solution()`
- Conflict registry extracted to `config/conflicts.txt`

**Other**
- 14 conflict tests
- `twrp.sh`→`recovery.sh`
- Dead code removed

# v1.3.2

**Conflict type system**
- Aggressive (TSupport, Yurikey, IntegrityBox) renamed to `.bak`
- Passive (TreatWheel, NoHello, SensitiveProps) coexist with deferred toggles
- `_conflict_claimed()` honors priority choice
- Treat Wheel corrected from 3 features to `boot_hardening`
- Sensitive Props corrected from 3 features to `boot_hardening`, `suspicious_props`

**Other**
- TEE status detection reads both `tee_status` and `tee_status.txt`
- `disable_dev_options()` removed
- All vol-key conflict prompts removed (fully automatic)

# v1.3.1

**WebUI**
- `app.ts` split 844→140 lines, 5 domain modules extracted
- `target-apps.ts`: 7 mutable vars eliminated, state local to closure
- System fallback for security patch
- Nav bar indicator fixed
- Responsive browse button

**Performance**
- Batch config init (single exec reads all `.val` files, ~15× fewer round trips)
- HTTP fetch cache with TTL, network polling 3s→15s

**APatch / KSU**
- `download()` PATH includes `/data/adb/ap/bin:/data/adb/ksu/bin`
- Keybox fallback uses real provider URLs, `download()` instead of `--spider`

**Type safety**
- 17 MDC elements typed, ~60 `as any` eliminated
- Dialog factory, zero type errors

# v1.3.0

**VBMeta / Boot hash**
- `read_vbmeta()` removed (raw partition SHA-256 was incorrect)
- `boot_hash.sh` rewritten (system prop → /proc/cmdline → user config → stored file, no zero fallback)
- `/proc/cmdline` source survives module interference

**New features**
- Interactive App Targeting overlay (M3 sub-page, 4-state cycling, blacklist mode, DenyList import)
- App Catalog management (CRUD, sortable, JSON import/export)
- Security Patch dialog (M3 date input with auto-generate)
- Binary-level prop deletion via magickboot
- Periodic suspicious props re-cleaning (hourly)
- File permission hardening (/proc/cmdline, /proc/net/unix, install-recovery.sh, addon.d)

**Conflict resolution**
- `apply_conflict_toggles()` writes both `toggle_*` and `toggle_action_*`
- NoHello narrowed 7→1 feature
- New registry entries: Sensitive Props, Yurikey, Integrity Box

**i18n**
- All 4 translations synced to 180 keys
- 24 missing Control keys added
- 26 new keys

**Removed**
- `boot_hash.sh` (boot hash is now automatic)
- `pif2.sh` (covered by boot-time `block_rom_spoof_engines`)
- SmartMerge (replaced by App Targeting overlay)
- WebUI tab persistence (always opens Home)

**Installer**
- Timeout on vol-key prompts (8s default)
- Download timeout guard (30s)

**Other**
- PIF default off
- `post-fs-data.sh` for early conflict resolution
- Hex→decimal serial safety

# v1.2.0

**Feature toggle system**
- Control page with per-feature toggles for boot behavior and action pipeline
- Values stored as `.val` files

**Conflict resolution system**
- Data-driven registry (single source of truth, one entry per module)
- `apply_conflict_toggles()` auto-enables/disables based on priority
- Config migration for old conflict files
- Backup system for uninstall
- WebUI integration with JSON and live toggle refresh

**WebUI**
- Setup + Maintain merged into Tools (5→4 tabs)
- Old hashes auto-migrate
- Dialogs rewritten per M3 spec (no inline styles, proper ARIA)

**Other**
- No forced target.txt on install
- Action pipeline individually gated
- `gms.sh` kills droidguard by name pattern
- `target.sh` uses `_is_teesimulator`
- `docs/CONFLICTS.md` added
- README simplified

# v1.1.0

**GMS stability**
- No multi-package force-stop (caused logouts), Play Store-only kill

**Property system**
- `sp_try()` replaces `resetprop_if_diff`/`resetprop_if_match`
- `sp_persist()` replaces `persistprop`

**New scripts**
- `kill_play_store.sh`, `suspicious_props.sh`, `package_list.sh`
- `post-fs-data.sh` merged into `service.sh`

**WebUI**
- Actions/Advanced/Keybox/Tools → Home/Setup/Maintain/Settings
- Danger Zone added
- URL hash routing with popstate
- Tab persistence
- RTL centering

**Other**
- 16/18 scripts follow `[TAG] Start/Finish` logging pattern

# v1.0.0

- Rebranded from Yurikey to Specter
- Architecture: vanilla JS → strict TypeScript + Vite; BeerCSS → MWC; static colors → Material Color Utilities + Monet
- Pipeline orchestration via `orchestrator.sh`; shared `lib/common.sh`; config via `ksud module config`
- Keybox: Google revocation checking, multi-source catalog, custom install, status card, backup/restore
- ~40+ boot props with delayed spoofing; VBMeta from block device; CROM hook detection
- 16 modular feature scripts with multi-root support (Magisk/KSU/APatch)
- WebUI: M3 pill nav, 5 languages, 9 color presets, dark/light/auto, page transitions
- CI/CD: GitHub Actions, TS checking, automated module zip + update.json
