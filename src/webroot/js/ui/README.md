# Specter UI components

These are the Lit components used by Specter's Settings, Tools, Control, and
subpages. They use Material Design tokens and are loaded once when the app
starts.

## Loading

Import the registry once during app startup:

```ts
// material-core.ts
import '@material/web/switch/switch.js';
import './ui/index.js';
```

After that, any `sp-*` tag can be used in the document. A page module may import
one component for clarity, but it should not be the first place that component is
defined. Defining a custom element upgrades every existing instance, and doing
that during navigation blocks the first paint.

`navigation.ts` imports `sp-page-skeleton` directly because it needs the
skeleton before any page module is opened.

## Coverage

Run `npm run test:coverage` from the repo root. The v8 coverage config in
`vitest.config.ts` reports the whole WebUI and gates this directory: every
file under `src/webroot/js/ui/` must stay above the configured line,
statement, function, and branch thresholds. Production adoption is part of
coverage too — `sp-tooltip` labels the icon-only buttons on Home, and
`sp-skeleton` is the keybox catalog's loading placeholder; a component that
is only exercised in the gallery is not covered in any meaningful sense.

## Registry

`index.ts` exports `UI_COMPONENTS`. The registry test checks four things:

- every listed tag is registered
- tags and source files are unique
- every component has a source file and a test
- every `sp-*` tag used in `index.html` is registered

| Tag | File | Purpose |
| --- | --- | --- |
| `sp-settings-row` | `sp-settings-row.ts` | Preference row with icon, title, supporting text, and trailing content. |
| `sp-settings-section` | `sp-settings-section.ts` | Groups rows and recalculates the connected corner treatment. |
| `sp-tooltip` | `sp-tooltip.ts` | Tooltip attached to another element. |
| `sp-skeleton` | `sp-skeleton.ts` | Loading placeholder, optionally wrapping real content. |
| `sp-page-skeleton` | `sp-page-skeleton.ts` | Page-level placeholder made of section and row shapes. |

## Composition

- Put `sp-settings-row` elements inside a `sp-settings-section`. Only direct row
  children take part in the connected corner treatment.
- Use the named slots instead of wrapping extra markup: `icon`, `leading`,
  `headline`, `supporting`, `trailing`.
- Use `<md-switch slot="trailing">`, `<md-radio>`, or a native checkbox when the
  row owns a stateful control.
- Use `--md-sys-color-*` and `--sp-*` tokens instead of raw colors.
- Use `sp-skeleton` for a local placeholder and `sp-page-skeleton` for a whole
  page or panel. Do not write ad-hoc pulsing placeholders.
- While a page shows its skeleton, set `aria-busy="true"` on the page section.

## Components

### `<sp-settings-section>`

Groups `sp-settings-row` children. It watches direct child changes and
`hidden`/`aria-hidden` changes so the first, middle, and last visible rows get
the correct corner radii.

Attributes:

- `label`: optional heading
- `description`: optional supporting line
- `variant="danger"`: error-colored heading and description
- `tone`: icon color group (`primary`, `secondary`, `tertiary`, `error`)

Methods:

- `updatePositions()`: force a corner recalculation

### `<sp-settings-row>`

A preference row with a leading icon, title, supporting text, and trailing
content.

Attributes:

- `variant`: `navigation | toggle | value | action | radio | destructive | custom`
- `headline`: title text
- `supporting-text`: summary or value text
- `label`: explicit accessible name; otherwise the headline or supporting text is used
- `href`, `target`: render a link row
- `chevron`: show a trailing chevron on navigation rows; off by default
- `has-page`: for toggle/radio rows whose body opens a detail page; the slotted control is the only state control
- `stacked`: move trailing content onto its own full-width line
- `disabled`
- `selected`: switch or radio state
- `loading`: show a spinner on action and destructive rows
- `copyable`: show a copy button on value rows
- `copy-label`: accessible name for the copy button
- `value`: text copied by the copy button
- `mono`: use the monospace font for supporting text

Slots:

- `icon`: icon inside the tinted circle
- `leading`: raw leading control, used by radio rows
- `headline`: custom title content
- `supporting`: custom supporting content
- `trailing`: custom trailing content. Toggle rows use
  `<md-switch slot="trailing" icons>`; the row reads and writes that control's
  state. Toggle and radio rows fall back to a built-in control when no control
  is slotted.

Events:

- `sp-activate`: navigation, action, or destructive row activated
- `sp-change`: toggle or radio state changed; detail is `{ selected, value }`
- `sp-copy`: value copied; detail is `{ text }`

Keyboard: Enter and Space activate the row. Disabled rows are not focusable.

Behavior notes:

- Navigation rows do not get a chevron unless you set `chevron`.
- When a toggle or radio row has `has-page`, clicking the row body opens the
  detail page. Only the slotted control changes the value.
- Without `has-page`, clicking a toggle row flips its control.

### `<sp-tooltip>`

A tooltip attached to another element by id.

Attributes:

- `for`: id of the target element
- `position`: `above | below | before | after`
- `show-delay`: milliseconds, default `0`
- `hide-delay`: milliseconds, default `200`
- `disabled`

Methods:

- `show()`, `hide()`, `toggle()`

Hover and focus open the tooltip. Escape closes it.

### `<sp-skeleton>`

A loading placeholder that can stand alone or wrap content.

Attributes:

- `variant`: `text | rectangular | rounded | circular`
- `animation`: `pulse | wave | none`
- `loaded`: hide the skeleton and reveal slotted content

CSS:

- `--sp-skeleton-color`, `--sp-skeleton-highlight`
- `--sp-skeleton-height`, `--sp-skeleton-size`, `--sp-skeleton-shape`

It respects `prefers-reduced-motion` and `forced-colors`.

### `<sp-page-skeleton>`

The placeholder used while a page's components and wiring are being prepared.

Attributes:

- `sections`: number of section groups, default `3`, clamped to `1..12`
- `rows`: rows per section, default `3`, clamped to `1..12`

CSS:

- `--sp-page-skeleton-color`
- `--sp-page-skeleton-row-height`

The component marks itself `aria-hidden` and respects `prefers-reduced-motion`
and `forced-colors`. The page section carries `aria-busy="true"`.

## Adding a component

1. Add `sp-<name>.ts` in this directory with the Lit element and its styles.
2. Register it with `defineUiComponent('sp-<name>', SpName)` from `define.ts`.
3. Add `sp-<name>.test.ts` covering rendering, states, and events.
4. Import it in `index.ts` and add its metadata to `UI_COMPONENTS`.
5. Add a demo to `ui-gallery.html` if it is user-facing.
6. Document attributes, slots, events, CSS variables, and accessibility here.
7. Run `npx vitest run` and `npx tsc --noEmit`.

## Gallery

Run the dev server and open:

```
http://127.0.0.1:5173/ui-gallery.html
```

The gallery is a development page. It is not part of the production
`index.html` build.

## Attribution

The settings row and section conventions follow the Google Settings app. The
tooltip and skeleton behavior are adapted from
[@m3e/web](https://github.com/matraic/m3e) (MIT) and
[AWC UI](https://github.com/awc-ui/core) (MIT). The implementations here are
self-contained and do not import either project's runtime.
