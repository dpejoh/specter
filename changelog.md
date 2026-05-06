# Specter Changelog

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
