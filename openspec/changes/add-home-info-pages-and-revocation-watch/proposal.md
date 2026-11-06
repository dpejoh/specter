# Proposal

## Why

The Specter home screen presents keybox and environment status, but both hero cards are read-only. Users cannot inspect the installed keybox or understand how the device and its modules are configured without bouncing between other pages and shell output.

At the same time, a keybox can be revoked while it is installed. Specter currently refreshes keybox information every six hours and only flags the state; when Auto Keybox is enabled it does not react to a revocation immediately.

## What Changes

- Make both home hero cards real interactive controls that open full-screen, read-only information pages.
- Add a **Keybox** page showing installed keybox identity, type, status, serial, expiry, revocation reason, last check, and file details.
- Add a **Setup** page showing device, keystore backend, installed module configuration summaries, Specter feature states, and warnings.
- Add a reusable read-only label/value row to the existing subpage component so both pages match the existing Material 3 grouped-list language.
- Extend `keybox_info.sh` with revocation reason, checked time, latest version, and file metadata.
- Add `setup_info.sh` to collect a redacted configuration snapshot on demand.
- Add a keybox revocation watch: check the rawbin catalog on a short interval, refresh the home status when it changes, and auto-install a replacement when Auto Keybox is enabled. When Auto Keybox is off, flag the revoked state and offer an install action.
- Add i18n keys, TS tests, and shell tests.

## Capabilities

### New Capabilities

- `home-info-pages`: interactive home cards, the keybox details page, the setup page, and the shared read-only value row.
- `keybox-revocation-watch`: periodic revocation discovery, home status refresh, auto-replacement policy, and the revoked-state action path.

### Modified Capabilities

<!-- None. This is the first OpenSpec change for this repository. -->

## Impact

- `src/webroot/index.html`, `src/webroot/css/app.css`, `src/webroot/js/app.ts`, `src/webroot/js/device.ts`.
- New `src/webroot/js/home-cards.ts`, `keybox-info-ui.ts`, `setup-info-ui.ts`.
- `src/webroot/js/subpage.ts` and `src/webroot/js/types.ts`.
- New `src/features/setup_info.sh`; changes to `src/features/keybox_info.sh` and `src/lib/scheduler.sh`.
- `src/webroot/lang/source/string.json` plus the ten language packs.
- New Vitest tests and shell tests.
