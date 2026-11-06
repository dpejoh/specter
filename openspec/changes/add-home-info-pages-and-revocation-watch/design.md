# Design

## Context

See `proposal.md` for motivation. Relevant current behavior:

- `openSubPage()` already provides the full-screen overlay, header, back gesture, grouped list styling, and history handling.
- The home hero cards are `md-filled-card` elements with no activation behavior.
- `keybox_info.json` is produced by `features/keybox_info.sh` and read by `device.ts`.
- `device-info.sh` and `keystore_info.sh` already write the device and keystore snapshots.
- The scheduler historically ran `keybox_info.sh` every six hours by default.
- Module detection helpers (`module_detect`, `detect_keystore_manager`, `ksm_read_targets`) and config readers already exist in `src/lib/`.

## Goals / Non-Goals

**Goals:**

- Keep both new pages read-only and visually consistent with the existing Material 3 grouped-list language.
- Reuse existing state files where possible; add only one new snapshot (`setup_info.json`) and a small number of keybox fields.
- Keep the setup collector fast and safe: whitelisted fields only, no secrets, no full config dumps.
- Make revocation detection and replacement orchestration live in shell, where the rest of the device integration already lives.

**Non-Goals:**

- Editing module configuration from these pages.
- Full certificate-chain inspection in the WebUI.
- Push notifications or background services outside the existing scheduler.
- Introducing a JavaScript framework or a second UI system.

## Decisions

### Full-card hit control, not a clickable card element

Wrap each hero card in a positioned shell and add a real `<button class="hero-card-hit">` absolutely covering the card. The refresh button and clipped text get a higher stacking layer and stop propagation, so they keep working.

*Alternative considered:* put `role="button"` and `tabindex` on the `md-filled-card`. Rejected: nested interactive controls and a non-native activation model are worse for accessibility.

The hit button gets a translated `aria-label`, a chevron affordance, `:focus-visible`, hover, and active styling. The card content stays visually unchanged.

### Read-only value row in the existing subpage component

Add a `value` item type to `SubPageItem`:

```ts
{ type: 'value'; title: string; value: string | (() => Promise<string>); mono?: boolean; copyable?: boolean; tone?: 'error' | 'warning' | 'default' }
```

It renders through `rowShell`/`rowContent`, so grouped corners, borders, and spacing match existing rows. Values wrap; copyable values get a small icon button with the same focus treatment as other controls.

*Alternative considered:* build both pages with custom `innerHTML`. Rejected: duplicates grouping/position logic and makes tests and translations harder.

### Keybox page reads an extended snapshot

Extend `keybox_info.sh` with:

- `checked_at`
- `latest_version`
- `revocation_reason`
- `revocation_checked_at`
- `file_path`, `file_size`, `file_modified`

The page renders from the snapshot and offers a refresh action that runs `keybox_info.sh` again. The revoked state uses the existing error color token. "Install new keybox" opens the existing keybox catalog subpage rather than duplicating install logic.

### Setup page uses a native app_process probe

Add `SetupProbe` to the existing `deps/apk` helper (compiled into `deps/classes.dex`) and make `features/setup_info.sh` a thin launcher:

```sh
CLASSPATH="$DEX" app_process / com.dpejoh.specter.SetupProbe "$MODDIR/.." "$SPECTER_DIR" "$OUT"
```

The Java probe reads files, parses configs, and writes the snapshot atomically. It produces:

```json
{
  "generated_at": "...",
  "device": { "android": "...", "root": "...", "specter": "...", "effective_patch": "..." },
  "modules": [ { "id": "...", "name": "...", "version": "...", "enabled": true, "rows": [ { "label": "...", "value": "..." } ] } ],
  "features": [ { "label": "...", "value": "On" } ],
  "warnings": [ "..." ]
}
```

The old shell collector remains as `features/setup_info_shell.sh` and is used only if `app_process` is unavailable or the native probe fails. It only reads the fields listed above; OMK crypto, IMEI/MEID/serial, HMA package lists, and keybox content are never copied.

The snapshot is seeded at boot and during hot-install. The scheduler daemon watches the input files by mtime and rebuilds only when one changes; opening the page only reads the cached file. The header refresh button forces a fresh run. Optional modules that are not installed are omitted, matching the Tools page; a missing keystore backend still gets a clear "not installed" state.

*Alternative considered:* keep the shell collector. Rejected: each external utility costs ~100 ms in the KernelSU root context, and the old collector spawned 50+ of them (~6 s). The native probe runs in ~1.4 s on the same device.

### Revocation watch and auto-replacement orchestration

Add `features/keybox_watch.sh` and replace the scheduler's `keybox_info` task with `keybox_watch` at a default 300-second interval:

1. Run `keybox_info.sh` (fresh snapshot).
2. If the snapshot says revoked/expired and `toggle_autokeybox=1` and the last auto-replace was more than 30 minutes ago:
   - touch the guard timestamp,
   - run `keybox.sh`,
   - run `keybox_info.sh` again.
3. Refresh the module description.

The watch is still controlled by the existing `toggle_keybox_info` toggle; a new interval dialog writes `keybox_watch_interval` (minimum 60 seconds). The Home open path calls the same watch (without the scheduler's log rotation) so the card is current immediately.

`keybox_info.sh` prefers the catalog's revocation fields when present and falls back to the direct Google check. It records the revocation source and reason in the snapshot.

*Alternative considered:* auto-replace directly inside `keybox_info.sh`. Rejected: mixes detection with installation and makes it harder to test.

### Tests

- Vitest: card activation, value row rendering/copy, keybox page states (active/revoked/missing), setup page states, i18n key presence.
- Shell: `setup_info.sh` JSON validity and redaction, `keybox_watch.sh` replace/no-replace/guard behavior, `keybox_info.sh` revocation fields.
- Existing `npm test`, `bash tests/run.sh`, `npx tsc --noEmit`, and the build must stay green.

## Risks / Trade-offs

- [Full-card button intercepts nested controls] → Put refresh/clipped text above the hit layer and stop event propagation; test all three interactions.
- [Setup collection is slow on large HMA configs] → Read counts with `grep -c`/`wc`, never parse/emit the full config; run on demand.
- [Auto-replace loop or repeated failed downloads] → 30-minute guard plus a single attempt per detection.
- [Five-minute watch increases background network use] → Catalog is small and Google's list is cached for an hour; interval is configurable and can be raised.
- [Snapshot contains private values] → Whitelist fields in the collector and add a redaction test with fixture secrets.
- [Page shows stale data] → The daemon rebuilds on input mtime changes; the page opens from cache and the header refresh forces a fresh run.
- [Translation parity test fails] → Add keys to the source and all ten language packs in the same change.

## Migration Plan

1. Land the shell snapshot and watch changes first; they are backward compatible.
2. Add the value row and pages; old cached snapshots fall back to "—" for missing fields.
3. Wire the home cards.
4. Update translations and tests.
5. Rollback: remove the card hit controls and scheduler task; the extra JSON fields and script are inert.

## Open Questions

None.
