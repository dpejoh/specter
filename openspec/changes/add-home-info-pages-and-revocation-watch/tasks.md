# Tasks

## 1. Data contracts

- [x] 1.1 Extend `features/keybox_info.sh` with `checked_at`, `latest_version`, revocation reason/source/check time, and keybox file metadata. Verify with a shell test that parses the JSON.
- [x] 1.2 Add the native `SetupProbe` helper and make `features/setup_info.sh` a thin app_process launcher with the shell collector as fallback. Verify valid JSON and expected values with fixture modules/files.
- [x] 1.3 Add a redaction test proving the setup snapshot excludes keybox content, OMK crypto seeds, IMEI/MEID, and device serial values.
- [x] 1.4 Extend `src/webroot/js/types.ts` with the new keybox and setup snapshot types. Verify `npx tsc --noEmit`.
- [x] 1.5 Measure the native probe on-device and compare it with the shell collector; document the result (~1.4 s native vs ~6 s shell).

## 2. Shared UI primitives

- [x] 2.1 Add the read-only `value` item type to `subpage.ts` with wrapping, optional mono styling, and optional copy. Verify with a Vitest rendering test.
- [ ] 2.2 Add the home-card hit controls and chevron affordance in `index.html`/CSS, keeping refresh and clipped text above the hit layer. Verify hover, active, focus-visible, and pointer behavior in a browser at 360px and 1280px.
- [x] 2.3 Add `home-cards.ts` to open the keybox and setup pages and verify card activation with Vitest and a mock `openSubPage`.

## 3. Keybox details page

- [x] 3.1 Implement `keybox-info-ui.ts` with grouped overview, certificate, revocation, and file sections. Verify active, revoked, private, and not-installed states with Vitest.
- [x] 3.2 Add refresh, install-new-keybox, and empty-state actions. Verify each action calls the expected script/page and the page re-renders after refresh.

## 4. Setup page

- [x] 4.1 Implement `setup-info-ui.ts` rendering device, keystore, modules, features, and warnings from `setup_info.json`. Verify a complete fixture and a missing-module fixture with Vitest.
- [x] 4.2 Render the cached snapshot on open; regenerate from the daemon when inputs change or from the refresh action, with a loading state and a non-blocking error note if the probe fails. Verify the fetch/render flow with Vitest.

## 5. Revocation watch and auto-replacement

- [x] 5.1 Add `features/keybox_watch.sh` that refreshes keybox info, performs one guarded auto-replacement when Auto Keybox is enabled, and refreshes the snapshot again. Verify replace, no-replace, and 30-minute guard scenarios with shell tests.
- [x] 5.2 Wire the watch into `lib/scheduler.sh` with a default 300-second interval and a minimum of 60 seconds. Verify the scheduler shell test with a mocked clock.
- [x] 5.3 Add an interval input to the existing keybox refresh control and verify the value is read/written through `cfgGet`/`cfgSet` in a Vitest test.
- [x] 5.4 Make Home open run a fresh watch/check and update the card without a reload. Verify with a Vitest test that stubs the shell bridge.

## 6. Localization

- [x] 6.1 Add all new strings to `lang/source/string.json` and the ten language files. Verify `npx vitest run src/webroot/js/translations.test.ts` passes.

## 7. Integration verification

- [x] 7.1 Run `npm test`, `bash tests/run.sh`, and `npx tsc --noEmit`; all must pass.
- [x] 7.2 Run `npm run build` and verify the module ZIP is produced.
- [ ] 7.3 Render the home cards, keybox page, and setup page at 360px and 1280px and verify layout, focus states, and back navigation. If browser tooling is unavailable, record that the visual check was not performed.

## Workflow follow-up

- Archive the change after review and manual device verification.
