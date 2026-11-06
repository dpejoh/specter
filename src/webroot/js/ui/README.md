# Specter UI (experimental)

A small, self-contained Material settings layer for Specter. The settings rows and sections are now used by the Settings, Tools, and Control pages; the gallery remains a development page. They exist to test a shadcn-style model: copyable components with a stable API, a gallery, and no dependency on app internals.

## Import

```ts
import './js/ui/index.js';
```

Each component can also be imported on its own:

```ts
import './js/ui/sp-settings-row.js';
```

Lit is a direct dependency. The components use only `--md-sys-*` tokens plus a small `--sp-*` surface, so they inherit Specter's theme.

## Components

### `<sp-settings-section>`

Groups `sp-settings-row` children and recomputes the connected M3 corner treatment when rows are hidden or shown.

Attributes:

- `label` — optional section heading
- `description` — optional supporting line
- `variant="danger"` — error-colored heading/description
- `tone` — icon color group: `primary`, `secondary`, `tertiary`, or `error`

Methods:

- `updatePositions()` — force a corner recomputation

Only direct `sp-settings-row` children are positioned.

### `<sp-settings-row>`

A preference row with a leading icon, headline, supporting text, and trailing content.

Attributes:

- `variant` — `navigation | toggle | value | action | radio | destructive | custom`
- `headline` — title text
- `supporting-text` — summary/value text
- `label` — explicit accessible name; otherwise derived from headline/supporting text
- `href`, `target` — renders a link row when set
- `chevron` — opt-in trailing chevron for navigation rows; off by default
- `has-page` — toggle/radio rows where the row body opens a detail page; the slotted switch/radio is the only state control
- `stacked` — wraps slotted trailing content onto a full-width line below the headline, for block inputs
- `disabled`
- `selected` — switch/radio state
- `loading` — shows an inline spinner for action and destructive rows
- `copyable` — shows a copy button for value rows
- `copy-label` — accessible name for the copy button
- `value` — text copied by the copy button
- `mono` — monospace supporting text

Slots:

- `icon` — leading icon inside the section-colored circular container
- `leading` — raw leading control, used for radio rows (the radio sits at the leading edge)
- `headline` — custom headline content
- `supporting` — custom supporting content
- `trailing` — custom trailing content. Specter uses `<md-switch slot="trailing" icons>` for toggle rows; the row adopts the control's state and drops its built-in fallback switch. Toggle and radio rows can still fall back to their built-in visual control when no control is slotted.

Events:

- `sp-activate` — navigation/action/destructive row activated
- `sp-change` — toggle/radio state changed; detail `{ selected, value }`
- `sp-copy` — value copied; detail `{ text }`

Keyboard: Enter/Space activates the row. Disabled rows are not focusable.

Behavior notes:

- Navigation rows do **not** get a chevron automatically. Set `chevron` only where the app's design calls for one.
- For a toggle/radio row with `has-page`, tapping the row body opens the detail page; only the slotted switch/radio changes state. This matches Google Settings and AWC's `multi-action` list guidance.
- Without `has-page`, tapping a toggle row body flips its switch.

### `<sp-tooltip>`

A simple anchored tooltip. Uses the target's `aria-describedby`.

Attributes:

- `for` — id of the target element
- `position` — `above | below | before | after`
- `show-delay` — ms, default `0`
- `hide-delay` — ms, default `200`
- `disabled`

Methods:

- `show()`, `hide()`, `toggle()`

Escape closes the tooltip. Hover and focus open it.

### `<sp-skeleton>`

A loading placeholder that can stand alone or wrap content.

Attributes:

- `variant` — `text | rectangular | rounded | circular`
- `animation` — `pulse | wave | none`
- `loaded` — hides the skeleton; reveals slotted content when present

CSS:

- `--sp-skeleton-color`, `--sp-skeleton-highlight`
- `--sp-skeleton-height`, `--sp-skeleton-size`, `--sp-skeleton-shape`

The skeleton respects `prefers-reduced-motion` and `forced-colors`.

## Gallery

Run the dev server and open:

```
http://127.0.0.1:5173/ui-gallery.html
```

The gallery is a development page; it is not part of the production `index.html` build.

## Attribution

The settings-row/section conventions follow the Google Settings app. Tooltip and skeleton behavior/visual conventions are adapted from [@m3e/web](https://github.com/matraic/m3e) (MIT) and [AWC UI](https://github.com/awc-ui/core) (MIT). The implementations here are self-contained and simplified; they do not import either project's runtime.
