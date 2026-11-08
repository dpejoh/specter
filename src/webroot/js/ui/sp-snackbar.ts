/*
 * Specter UI — snackbar.
 *
 * The Material 3 snackbar Google never shipped for the web (@material/web
 * has no snackbar; the M3 site lists the web implementation as
 * unavailable). Adapted from @maicol07/material-web-additions (Apache-2.0),
 * which builds the missing component in @material/web's own architecture —
 * same tokens, same internals (md-elevation, md-text-button) — ported here
 * to the kit's conventions so Specter carries the component itself instead
 * of depending on the whole additions library.
 *
 * Behavior follows the M3 spec: one short update about an app process at
 * the bottom of the screen, an optional action, an optional close
 * affordance, and timed dismissal. Queueing (one at a time) lives in
 * toast.ts, not in the component.
 *
 * One deliberate deviation from upstream: `open` is pure state reflection
 * here — show()/close() drive the lifecycle. Upstream also reacts to
 * `open` changes in shouldUpdate, which races when close() lands before
 * the pending update for open=true runs (the stale update resurrects the
 * snackbar and its close never completes).
 */

import { LitElement, css, html } from 'lit';
import '@material/web/ripple/ripple.js';
import '@material/web/focus/md-focus-ring.js';
import '@material/web/elevation/elevation.js';
import '@material/web/button/text-button.js';
import { defineUiComponent } from './define.js';

export class SpSnackbar extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    twoLines: { type: Boolean, reflect: true, attribute: 'two-lines' },
    actionText: { type: String, attribute: 'action-text' },
    fixed: { type: Boolean, reflect: true },
    timeout: { type: Number, reflect: true },
  };

  declare open: boolean;
  declare twoLines: boolean;
  declare actionText: string;
  declare fixed: boolean;
  /** Auto-dismiss delay in ms; values <= 0 keep the snackbar open. */
  declare timeout: number;

  constructor() {
    super();
    this.open = false;
    this.twoLines = false;
    this.actionText = '';
    this.fixed = false;
    this.timeout = 5000;
  }

  render() {
    return html`
      <div class="md-snackbar__supporting_text"><slot></slot></div>
      <slot name="action">${this.actionText
        ? html`<md-text-button class="md-snackbar__action" @click=${this.#onActionClick}>${this.actionText}</md-text-button>`
        : ''}</slot>
      <slot name="icon" @click=${this.close}></slot>
      <md-elevation></md-elevation>
    `;
  }

  /** Whether the snackbar is shown or entering; makes show/close
   *  idempotent so each lifecycle fires its events exactly once. */
  #shown = false;

  #onActionClick() {
    this.dispatchEvent(new CustomEvent('action', { bubbles: true, composed: true }));
  }

  /** Opens the snackbar. Fires `open`, then `opened` after the transition. */
  show() {
    if (this.#shown) return;
    this.#shown = true;
    this.open = true;
    this.dispatchEvent(new CustomEvent('open', { bubbles: true, composed: true }));
    setTimeout(() => {
      if (!this.#shown) return;
      this.classList.add('opened');
      this.dispatchEvent(new CustomEvent('opened', { bubbles: true, composed: true }));
    }, 200);
    if (this.timeout > 0) {
      setTimeout(() => this.close(), this.timeout);
    }
  }

  /** Closes the snackbar. Fires `close`, then `closed` after the transition. */
  close() {
    if (!this.#shown) return;
    this.#shown = false;
    this.classList.remove('opened');
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
    setTimeout(() => {
      if (this.#shown) return;
      this.open = false;
      this.dispatchEvent(new CustomEvent('closed', { bubbles: true, composed: true }));
    }, 200);
  }

  static styles = css`
    /* Token table and layout rules, generated upstream from the M3 snackbar
     * token set (md-comp-snackbar): every value resolves through a public
     * --md-snackbar-* custom property falling back to the sys tokens. */
    :host{--_action-focus-label-text-color: var(--md-snackbar-action-focus-label-text-color, var(--md-sys-color-inverse-primary, #d0bcff));--_action-focus-state-layer-color: var(--md-snackbar-action-focus-state-layer-color, var(--md-sys-color-inverse-primary, #d0bcff));--_action-focus-state-layer-opacity: var(--md-snackbar-action-focus-state-layer-opacity, 0.12);--_action-hover-label-text-color: var(--md-snackbar-action-hover-label-text-color, var(--md-sys-color-inverse-primary, #d0bcff));--_action-hover-state-layer-color: var(--md-snackbar-action-hover-state-layer-color, var(--md-sys-color-inverse-primary, #d0bcff));--_action-hover-state-layer-opacity: var(--md-snackbar-action-hover-state-layer-opacity, 0.08);--_action-label-text-color: var(--md-snackbar-action-label-text-color, var(--md-sys-color-inverse-primary, #d0bcff));--_action-label-text-font: var(--md-snackbar-action-label-text-font, var(--md-sys-typescale-label-large-font, var(--md-ref-typeface-plain, Roboto)));--_action-label-text-line-height: var(--md-snackbar-action-label-text-line-height, var(--md-sys-typescale-label-large-line-height, 1.25rem));--_action-label-text-size: var(--md-snackbar-action-label-text-size, var(--md-sys-typescale-label-large-size, 0.875rem));--_action-label-text-tracking: var(--md-snackbar-action-label-text-tracking, );--_action-label-text-type: var(--md-snackbar-action-label-text-type, var(--md-sys-typescale-label-large-weight, var(--md-ref-typeface-weight-medium, 500)) var(--md-sys-typescale-label-large-size, 0.875rem) / var(--md-sys-typescale-label-large-line-height, 1.25rem) var(--md-sys-typescale-label-large-font, var(--md-ref-typeface-plain, Roboto)));--_action-label-text-weight: var(--md-snackbar-action-label-text-weight, var(--md-sys-typescale-label-large-weight, var(--md-ref-typeface-weight-medium, 500)));--_action-pressed-label-text-color: var(--md-snackbar-action-pressed-label-text-color, var(--md-sys-color-inverse-primary, #d0bcff));--_action-pressed-state-layer-color: var(--md-snackbar-action-pressed-state-layer-color, var(--md-sys-color-inverse-primary, #d0bcff));--_action-pressed-state-layer-opacity: var(--md-snackbar-action-pressed-state-layer-opacity, 0.12);--_container-color: var(--md-snackbar-container-color, var(--md-sys-color-inverse-surface, #322f35));--_container-elevation: var(--md-snackbar-container-elevation, 3);--_container-shadow-color: var(--md-snackbar-container-shadow-color, var(--md-sys-color-shadow, #000));--_container-shape: var(--md-snackbar-container-shape, var(--md-sys-shape-corner-extra-small, 4px));--_icon-color: var(--md-snackbar-icon-color, var(--md-sys-color-inverse-on-surface, #f5eff7));--_icon-focus-icon-color: var(--md-snackbar-icon-focus-icon-color, var(--md-sys-color-inverse-on-surface, #f5eff7));--_icon-focus-state-layer-color: var(--md-snackbar-icon-focus-state-layer-color, var(--md-sys-color-inverse-on-surface, #f5eff7));--_icon-focus-state-layer-opacity: var(--md-snackbar-icon-focus-state-layer-opacity, 0.12);--_icon-hover-icon-color: var(--md-snackbar-icon-hover-icon-color, var(--md-sys-color-inverse-on-surface, #f5eff7));--_icon-hover-state-layer-color: var(--md-snackbar-icon-hover-state-layer-color, var(--md-sys-color-inverse-on-surface, #f5eff7));--_icon-hover-state-layer-opacity: var(--md-snackbar-icon-hover-state-layer-opacity, 0.08);--_icon-pressed-icon-color: var(--md-snackbar-icon-pressed-icon-color, var(--md-sys-color-inverse-on-surface, #f5eff7));--_icon-pressed-state-layer-color: var(--md-snackbar-icon-pressed-state-layer-color, var(--md-sys-color-inverse-on-surface, #f5eff7));--_icon-pressed-state-layer-opacity: var(--md-snackbar-icon-pressed-state-layer-opacity, 0.12);--_icon-size: var(--md-snackbar-icon-size, 24px);--_supporting-text-color: var(--md-snackbar-supporting-text-color, var(--md-sys-color-inverse-on-surface, #f5eff7));--_supporting-text-font: var(--md-snackbar-supporting-text-font, var(--md-sys-typescale-body-medium-font, var(--md-ref-typeface-plain, Roboto)));--_supporting-text-line-height: var(--md-snackbar-supporting-text-line-height, var(--md-sys-typescale-body-medium-line-height, 1.25rem));--_supporting-text-size: var(--md-snackbar-supporting-text-size, var(--md-sys-typescale-body-medium-size, 0.875rem));--_supporting-text-tracking: var(--md-snackbar-supporting-text-tracking, );--_supporting-text-type: var(--md-snackbar-supporting-text-type, var(--md-sys-typescale-body-medium-weight, var(--md-ref-typeface-weight-regular, 400)) var(--md-sys-typescale-body-medium-size, 0.875rem) / var(--md-sys-typescale-body-medium-line-height, 1.25rem) var(--md-sys-typescale-body-medium-font, var(--md-ref-typeface-plain, Roboto)));--_supporting-text-weight: var(--md-snackbar-supporting-text-weight, var(--md-sys-typescale-body-medium-weight, var(--md-ref-typeface-weight-regular, 400)));--_with-single-line-container-height: var(--md-snackbar-with-single-line-container-height, 48px);--_with-two-lines-container-height: var(--md-snackbar-with-two-lines-container-height, 68px);display:none;opacity:0;align-items:center;transition:opacity 150ms ease-in-out;background-color:var(--_container-color);border-radius:var(--_container-shape);height:var(--_with-single-line-container-height);max-width:672px;min-width:344px;overflow:hidden;padding:0;position:relative;--md-elevation-level: var(--_container-elevation);--md-elevation-shadow-color: var(--_container-shadow-color)}
    :host slot[name=icon]{--md-icon-button-icon-color: var(--_icon-color);--md-icon-button-icon-size: var(--_icon-size);--md-icon-button-focus-icon-color: var(--_icon-focus-icon-color);--md-icon-button-hover-icon-color: var(--_icon-hover-icon-color);--md-icon-button-hover-state-layer-color: var(--_icon-hover-state-layer-color);--md-icon-button-hover-state-layer-opacity: var(--_icon-hover-state-layer-opacity);--md-icon-button-pressed-icon-color: var(--_icon-pressed-icon-color);--md-icon-button-pressed-state-layer-color: var(--_icon-pressed-state-layer-color);--md-icon-button-pressed-state-layer-opacity: var(--_icon-pressed-state-layer-opacity)}
    :host slot[name=icon]::slotted(:is(md-icon,md-icon-button)){margin:0 12px}
    :host .md-snackbar__supporting_text{color:var(--_supporting-text-color);font-size:var(--_supporting-text-size);margin-inline:16px;margin-right:16px;flex-grow:1}
    :host md-text-button.md-snackbar__action{--md-text-button-label-text-color: var(--_action-label-text-color);--md-text-button-label-text-size: var(--_action-label-text-size);--md-text-button-label-text-line-height: var(--_action-label-text-line-height);--md-text-button-label-text-font: var(--_action-label-text-font);--md-text-button-label-text-weight: var(--_action-label-text-font-weight);--md-text-button-focus-label-text-color: var(--_action-label-text-color);--md-text-button-hover-label-text-color: var(--_action-label-text-color);--md-text-button-pressed-label-text-color: var(--_action-label-text-color);--md-text-button-hover-state-layer-color: var(--_action-hover-state-layer-color);--md-text-button-hover-state-layer-opacity: var(--_action-hover-state-layer-opacity);--md-text-button-pressed-state-layer-color: var(--_action-pressed-state-layer-color);--md-text-button-pressed-state-layer-opacity: var(--_action-pressed-state-layer-opacity);margin-right:8px}
    :host([open].opened){opacity:1}
    :host([open]){display:flex}
    :host(:focus-within) md-elevation{--md-elevation-level: var(--_focus-container-elevation)}
    :host(:hover) md-elevation{--md-elevation-level: var(--_hover-container-elevation)}
    :host(:active) md-elevation{--md-elevation-level: var(--_pressed-container-elevation)}
    :host([two-lines]){height:var(--_with-two-lines-container-height)}
    :host([two-lines][longer-action]){flex-wrap:wrap;padding:12px 0 6px 0;height:auto}
    :host([two-lines][longer-action]) .md-snackbar__supporting_text{width:100%}
    :host([two-lines][longer-action]) .md-snackbar__action{margin-left:auto}
    :host([fixed]){position:fixed;z-index:100;bottom:10px;left:50%;transform:translateX(-50%);box-sizing:content-box;line-height:var(--_supporting-text-line-height)}
    /*# sourceMappingURL=snackbar-styles.css.map */
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'sp-snackbar': SpSnackbar;
  }
}

defineUiComponent('sp-snackbar', SpSnackbar);
