/*
 * Specter UI — settings section.
 *
 * Groups `sp-settings-row` children and keeps the M3 Expressive connected
 * corner treatment correct when rows are hidden or shown. The visual pattern
 * follows the Google Settings app and Specter's existing list containers.
 */

import { LitElement, css, html } from 'lit';
import { defineUiComponent } from './define.js';

type RowPosition = 'only' | 'first' | 'middle' | 'last';

const RADIUS: Record<RowPosition, string> = {
  only: '24px',
  first: '24px 24px 4px 4px',
  middle: '4px',
  last: '4px 4px 24px 24px',
};

export class SpSettingsSection extends LitElement {
  static properties = {
    label: { type: String },
    description: { type: String },
    variant: { type: String, reflect: true },
    tone: { type: String, reflect: true },
    hasLabel: { state: true },
    hasDescription: { state: true },
  };

  declare label: string;
  declare description: string;
  declare variant: string;
  declare tone: string;
  declare hasLabel: boolean;
  declare hasDescription: boolean;

  #observer: MutationObserver | null = null;
  #headerObserver: MutationObserver | null = null;
  #updateQueued = false;

  constructor() {
    super();
    this.label = '';
    this.description = '';
    this.variant = '';
    this.tone = '';
    this.hasLabel = false;
    this.hasDescription = false;
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    :host([hidden]) {
      display: none;
    }

    .header {
      padding-inline: var(--sp-settings-section-inset, 20px);
    }

    .label {
      margin: 18px 0 8px;
      font-size: 1em;
      font-weight: 700;
      line-height: 1.3;
      color: var(--md-sys-color-on-surface, #1c1b1f);
    }

    .description {
      margin: 0 0 8px;
      font-size: 0.78em;
      line-height: 1.4;
      color: var(--md-sys-color-on-surface-variant, #49454f);
    }

    :host([variant='danger']) .description,
    :host([variant='danger']) .label {
      color: var(--md-sys-color-error, #b3261e);
    }

    :host([tone='primary']) {
      --sp-settings-icon-bg: var(--md-sys-color-primary-container, #eaddff);
      --sp-settings-icon-fg: var(--md-sys-color-on-primary-container, #21005d);
    }

    :host([tone='secondary']) {
      --sp-settings-icon-bg: var(--md-sys-color-secondary-container, #e8def8);
      --sp-settings-icon-fg: var(--md-sys-color-on-secondary-container, #1d192b);
    }

    :host([tone='tertiary']) {
      --sp-settings-icon-bg: var(--md-sys-color-tertiary-container, #eed1ff);
      --sp-settings-icon-fg: var(--md-sys-color-on-tertiary-container, #2b0f48);
    }

    :host([tone='error']),
    :host([variant='danger']) {
      --sp-settings-icon-bg: var(--md-sys-color-error-container, #f9dedc);
      --sp-settings-icon-fg: var(--md-sys-color-on-error-container, #410e0b);
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.#observer = new MutationObserver(() => this.#scheduleUpdate());
    // Row visibility lives on direct children, so attributes need subtree
    // traversal; the narrow filter keeps the observed mutation set small.
    this.#observer.observe(this, {
      childList: true,
      attributes: true,
      subtree: true,
      attributeFilter: ['hidden', 'aria-hidden'],
    });

    this.#headerObserver = new MutationObserver(() => this.#syncHeaderSlots());
    this.#headerObserver.observe(this, { childList: true });
    queueMicrotask(() => this.#syncHeaderSlots());
    this.#scheduleUpdate();
  }

  override disconnectedCallback(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    this.#headerObserver?.disconnect();
    this.#headerObserver = null;
    super.disconnectedCallback();
  }

  #syncHeaderSlots(): void {
    const hasLabel = !!this.querySelector(':scope > [slot="label"]');
    const hasDescription = !!this.querySelector(':scope > [slot="description"]');
    if (this.hasLabel !== hasLabel) this.hasLabel = hasLabel;
    if (this.hasDescription !== hasDescription) this.hasDescription = hasDescription;
  }

  protected override firstUpdated(): void {
    this.#scheduleUpdate();
  }

  /** Recompute the connected corner treatment for the current visible rows. */
  updatePositions(): void {
    const rows = Array.from(this.querySelectorAll<HTMLElement>(':scope > sp-settings-row'));
    const visible = rows.filter(row => {
      if (row.hasAttribute('hidden')) return false;
      if (row.getAttribute('aria-hidden') === 'true') return false;
      if (row.style.display === 'none') return false;
      return true;
    });

    for (const row of rows) {
      row.removeAttribute('data-position');
      row.style.removeProperty('--sp-settings-row-radius');
      row.style.removeProperty('margin-block-end');
    }

    if (visible.length === 0) return;

    visible.forEach((row, index) => {
      const position: RowPosition =
        visible.length === 1
          ? 'only'
          : index === 0
            ? 'first'
            : index === visible.length - 1
              ? 'last'
              : 'middle';

      row.setAttribute('data-position', position);
      row.style.setProperty('--sp-settings-row-radius', RADIUS[position]);
      if (index < visible.length - 1) {
        row.style.setProperty('margin-block-end', '2px');
      }
    });
  }

  #scheduleUpdate(): void {
    if (this.#updateQueued) return;
    this.#updateQueued = true;
    queueMicrotask(() => {
      this.#updateQueued = false;
      this.updatePositions();
    });
  }

  #handleSlotChange(): void {
    this.#scheduleUpdate();
  }

  #handleLabelSlotChange(event: Event): void {
    const slot = event.target as HTMLSlotElement;
    this.hasLabel = slot.assignedElements({ flatten: true }).length > 0;
  }

  #handleDescriptionSlotChange(event: Event): void {
    const slot = event.target as HTMLSlotElement;
    this.hasDescription = slot.assignedElements({ flatten: true }).length > 0;
  }

  protected override render() {
    const showHeader = this.label || this.description || this.hasLabel || this.hasDescription;
    return html`
      ${showHeader
        ? html`
            <div class="header" part="header">
              ${this.label || this.hasLabel
                ? html`
                    <h2 class="label" part="label">
                      <slot name="label" @slotchange=${this.#handleLabelSlotChange}>${this.label}</slot>
                    </h2>
                  `
                : ''}
              ${this.description || this.hasDescription
                ? html`
                    <p class="description" part="description">
                      <slot name="description" @slotchange=${this.#handleDescriptionSlotChange}>${this.description}</slot>
                    </p>
                  `
                : ''}
            </div>
          `
        : ''}
      <slot @slotchange=${this.#handleSlotChange}></slot>
    `;
  }
}

defineUiComponent('sp-settings-section', SpSettingsSection);

declare global {
  interface HTMLElementTagNameMap {
    'sp-settings-section': SpSettingsSection;
  }
}
