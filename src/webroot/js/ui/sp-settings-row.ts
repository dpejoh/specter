/*
 * Specter UI — settings row.
 *
 * Visual and behavioural conventions are adapted from the Google Settings app,
 * @m3e/web (MIT) and AWC UI (MIT). This implementation is self-contained and
 * uses only Specter's Material tokens.
 */

import { LitElement, css, html, nothing } from 'lit';
import { defineUiComponent } from './define.js';
import { t } from '../i18n.js';

export type SpSettingsRowVariant =
  | 'navigation'
  | 'toggle'
  | 'value'
  | 'action'
  | 'radio'
  | 'destructive'
  | 'custom';

let rowSequence = 0;

const CHEVRON = html`
  <svg class="chevron" viewBox="0 0 8 14" width="8" height="14" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true">
    <path d="M1.5 2L6.5 7L1.5 12" />
  </svg>
`;

export class SpSettingsRow extends LitElement {
  static properties = {
    variant: { type: String, reflect: true },
    headline: { type: String },
    supportingText: { attribute: 'supporting-text', type: String },
    label: { type: String },
    href: { type: String },
    target: { type: String },
    value: { type: String },
    chevron: { type: Boolean, reflect: true },
    hasPage: { attribute: 'has-page', type: Boolean, reflect: true },
    stacked: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
    selected: { type: Boolean, reflect: true },
    loading: { type: Boolean, reflect: true },
    copyable: { type: Boolean, reflect: true },
    copyLabel: { attribute: 'copy-label', type: String },
    mono: { type: Boolean, reflect: true },
    hasIcon: { state: true },
    hasLeading: { state: true },
    hasHeadline: { state: true },
    hasSupporting: { state: true },
    hasTrailingControl: { state: true },
  };

  declare variant: SpSettingsRowVariant;
  declare headline: string;
  declare supportingText: string;
  declare label: string;
  declare href: string;
  declare target: string;
  declare value: string;
  declare chevron: boolean;
  declare hasPage: boolean;
  declare stacked: boolean;
  declare disabled: boolean;
  declare selected: boolean;
  declare loading: boolean;
  declare copyable: boolean;
  declare copyLabel: string;
  declare mono: boolean;
  declare hasIcon: boolean;
  declare hasLeading: boolean;
  declare hasHeadline: boolean;
  declare hasSupporting: boolean;
  declare hasTrailingControl: boolean;

  #trailingControl: HTMLElement | null = null;
  #syncingTrailing = false;
  readonly #headlineId = `sp-settings-row-headline-${++rowSequence}`;
  readonly #supportingId = `sp-settings-row-supporting-${rowSequence}`;

  constructor() {
    super();
    this.variant = 'navigation';
    this.headline = '';
    this.supportingText = '';
    this.label = '';
    this.href = '';
    this.target = '';
    this.value = '';
    this.chevron = false;
    this.hasPage = false;
    this.stacked = false;
    this.disabled = false;
    this.selected = false;
    this.loading = false;
    this.copyable = false;
    this.copyLabel = '';
    this.mono = false;
    this.hasIcon = false;
    this.hasLeading = false;
    this.hasHeadline = false;
    this.hasSupporting = false;
    this.hasTrailingControl = false;
  }

  static styles = css`
    :host {
      display: block;
      overflow: clip;
      border-radius: var(--sp-settings-row-radius, 4px);
      background: var(--md-sys-color-surface-container-high, #ece6f0);
      color: var(--md-sys-color-on-surface, #1c1b1f);
      transition: border-radius 200ms ease, background-color 150ms ease;
    }

    :host([hidden]) {
      display: none;
    }

    .row {
      box-sizing: border-box;
      min-height: 56px;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      color: inherit;
      text-decoration: none;
      cursor: pointer;
      position: relative;
      transition: background-color 150ms ease, transform 100ms ease;
      -webkit-tap-highlight-color: transparent;
    }

    @media (hover: hover) {
      .row:hover {
        background: var(--md-sys-color-surface-container-highest, #e6e0e9);
        background: color-mix(
          in srgb,
          var(--md-sys-color-surface-container-high, #ece6f0),
          var(--md-sys-color-on-surface, #1c1b1f) 8%
        );
      }
    }

    .row:active {
      background: var(--md-sys-color-surface-container-highest, #e6e0e9);
      background: color-mix(
        in srgb,
        var(--md-sys-color-surface-container-high, #ece6f0),
        var(--md-sys-color-on-surface, #1c1b1f) 10%
      );
      transform: scale(0.98);
    }

    .row:focus-visible {
      outline: 3px solid var(--md-sys-color-primary, #6750a4);
      outline-offset: -3px;
    }

    :host([stacked]) .row {
      flex-wrap: wrap;
      row-gap: 8px;
    }

    :host([stacked]) .trailing {
      flex-basis: 100%;
      margin-inline-start: 0;
      /* The slotted control sizes against this span; cap the span at the
         row's content box and let it shrink below its content, so a
         width:100% control inside can never push past the row's edge. */
      min-width: 0;
      max-width: 100%;
    }

    .row--disabled {
      opacity: 0.5;
      cursor: default;
      pointer-events: none;
    }

    .row--value {
      cursor: default;
    }

    .row--value:hover,
    .row--value:active {
      background: transparent;
      transform: none;
    }

    .leading-raw {
      display: none;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    :host([data-has-leading]) .leading-raw {
      display: flex;
    }

    ::slotted([slot='leading']) {
      display: flex;
      align-items: center;
    }

    .leading {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--sp-settings-icon-bg, var(--md-sys-color-primary-container, #eaddff));
      color: var(--sp-settings-icon-fg, var(--md-sys-color-on-primary-container, #21005d));
      display: none;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    :host([data-has-icon]) .leading {
      display: flex;
    }

    ::slotted([slot='icon']),
    ::slotted([slot='icon']) svg {
      width: 20px;
      height: 20px;
      font-size: 20px;
      color: inherit;
      fill: currentColor;
    }

    .content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .headline {
      font-size: 1rem;
      font-weight: 500;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }

    .supporting {
      display: none;
      font-size: 0.8125rem;
      color: var(--md-sys-color-on-surface-variant, #49454f);
      line-height: 1.4;
      overflow-wrap: anywhere;
    }

    :host([data-has-supporting]) .supporting {
      display: block;
    }

    :host([mono]) .supporting {
      font-family: var(--sp-font-mono, 'JetBrains Mono Variable', monospace);
      font-size: 0.8125rem;
    }

    .trailing {
      margin-inline-start: auto;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
      color: var(--md-sys-color-on-surface-variant, #49454f);
    }

    .chevron {
      width: 8px;
      height: 14px;
      opacity: 0.65;
      flex-shrink: 0;
      display: block;
    }

    .switch {
      box-sizing: border-box;
      width: 52px;
      height: 32px;
      border-radius: 16px;
      border: 2px solid var(--md-sys-color-outline, #79747e);
      background: var(--md-sys-color-surface-container-highest, #e6e0e9);
      position: relative;
      transition: background-color 200ms ease, border-color 200ms ease;
      flex-shrink: 0;
    }

    .switch .thumb {
      position: absolute;
      top: 2px;
      inset-inline-start: 2px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--md-sys-color-outline, #79747e);
      transition: transform 200ms ease, background-color 200ms ease;
    }

    :host([selected]) .switch {
      background: var(--md-sys-color-primary, #6750a4);
      border-color: var(--md-sys-color-primary, #6750a4);
    }

    :host([selected]) .switch .thumb {
      background: var(--md-sys-color-on-primary, #fff);
      transform: translateX(20px);
    }

    :host([selected]:dir(rtl)) .switch .thumb {
      transform: translateX(-20px);
    }

    .radio {
      box-sizing: border-box;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid var(--md-sys-color-outline, #79747e);
      position: relative;
      flex-shrink: 0;
    }

    :host([selected]) .radio {
      border-color: var(--md-sys-color-primary, #6750a4);
    }

    :host([selected]) .radio::after {
      content: '';
      position: absolute;
      inset: 4px;
      border-radius: 50%;
      background: var(--md-sys-color-primary, #6750a4);
    }

    .spinner {
      width: 20px;
      height: 20px;
      box-sizing: border-box;
      border: 2px solid var(--md-sys-color-outline-variant, #cac4d0);
      border-top-color: var(--md-sys-color-primary, #6750a4);
      border-radius: 50%;
      animation: sp-row-spin 800ms linear infinite;
      flex-shrink: 0;
    }

    .copy-btn {
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--md-sys-color-on-surface-variant, #49454f);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
    }

    .copy-btn:hover {
      background: var(--md-sys-color-surface-container-highest, #e6e0e9);
    }

    .copy-btn:focus-visible {
      outline: 3px solid var(--md-sys-color-primary, #6750a4);
      outline-offset: -3px;
    }

    :host([variant='destructive']) .leading {
      background: var(--md-sys-color-error-container, #f9dedc);
      color: var(--md-sys-color-on-error-container, #410e0b);
    }

    :host([variant='destructive']) .headline {
      color: var(--md-sys-color-error, #b3261e);
    }

    @keyframes sp-row-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host,
      .row,
      .switch,
      .switch .thumb,
      .spinner {
        transition: none;
        animation: none;
      }
    }

    @media (forced-colors: active) {
      .row:focus-visible {
        outline-color: Highlight;
      }
      .switch,
      .radio {
        border-color: CanvasText;
      }
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.#syncHostState();
  }

  protected override firstUpdated(): void {
    this.#syncLeadingSlot();
    this.#syncTrailingSlot();
  }

  protected override updated(): void {
    this.#syncHostState();
  }

  #syncHostState(): void {
    this.#syncHostFlag('data-has-icon', this.hasIcon);
    this.#syncHostFlag('data-has-leading', this.hasLeading);
    this.#syncHostFlag('data-has-supporting', this.hasSupporting || this.supportingText.length > 0);
  }

  #syncHostFlag(name: string, value: boolean): void {
    if (this.hasAttribute(name) !== value) this.toggleAttribute(name, value);
  }

  #rowElement(): HTMLElement | null {
    return (this.shadowRoot?.querySelector('.row') as HTMLElement | null) ?? null;
  }

  override focus(options?: FocusOptions): void {
    this.#rowElement()?.focus(options);
  }

  #isStatic(): boolean {
    return this.variant === 'value' || this.variant === 'custom';
  }

  #getControlState(control: HTMLElement): boolean | undefined {
    if (control instanceof HTMLInputElement) {
      return control.type === 'checkbox' || control.type === 'radio' ? control.checked : undefined;
    }
    if (control.localName === 'md-radio' || control.localName === 'md-checkbox') {
      return (control as HTMLElement & { checked?: boolean }).checked;
    }
    const value = control as HTMLElement & { selected?: boolean; checked?: boolean };
    return value.selected ?? value.checked;
  }

  #setControlState(control: HTMLElement, selected: boolean): void {
    if (control instanceof HTMLInputElement) {
      control.checked = selected;
      return;
    }
    if (control.localName === 'md-radio' || control.localName === 'md-checkbox') {
      (control as HTMLElement & { checked?: boolean }).checked = selected;
      return;
    }
    (control as HTMLElement & { selected?: boolean }).selected = selected;
  }

  #isInteractive(): boolean {
    return !this.#isStatic() && !this.disabled;
  }

  #role(): string | undefined {
    if (this.variant === 'toggle') return this.hasTrailingControl ? undefined : 'switch';
    if (this.variant === 'radio') return this.hasTrailingControl ? undefined : 'radio';
    if (this.variant === 'value') return 'group';
    if (this.variant === 'custom') return undefined;
    return this.href ? undefined : 'button';
  }

  #activate(): void {
    if (!this.#isInteractive()) return;

    // Configurable toggle/radio rows behave like Google Settings: the row body
    // opens the detail page, while the switch/radio itself is the state control.
    if (
      this.hasPage &&
      this.hasTrailingControl &&
      (this.variant === 'toggle' || this.variant === 'radio')
    ) {
      this.dispatchEvent(
        new CustomEvent('sp-activate', {
          detail: { variant: this.variant },
          bubbles: true,
          composed: true,
        }),
      );
      return;
    }

    if (this.variant === 'toggle') {
      if (this.hasTrailingControl) {
        const control = this.#trailingControl;
        if (!control || (control as HTMLInputElement).disabled) return;
        const current = this.#getControlState(control) ?? this.selected;
        this.selected = !current;
      } else {
        this.selected = !this.selected;
      }
      this.#syncTrailingControl(true);
      this.#emitChange();
      return;
    }

    if (this.variant === 'radio') {
      if (!this.selected) {
        this.selected = true;
        this.#syncTrailingControl(true);
        this.#emitChange();
      }
      return;
    }

    this.dispatchEvent(
      new CustomEvent('sp-activate', {
        detail: { variant: this.variant },
        bubbles: true,
        composed: true,
      }),
    );
  }

  #emitChange(): void {
    this.dispatchEvent(
      new CustomEvent('sp-change', {
        detail: { selected: this.selected, value: this.value },
        bubbles: true,
        composed: true,
      }),
    );
  }

  #handleClick(event: MouseEvent): void {
    if (this.disabled) {
      event.preventDefault();
      return;
    }

    const row = event.currentTarget as HTMLElement | null;
    const path = event.composedPath();
    const rowIndex = row ? path.indexOf(row) : -1;
    const beforeRow = rowIndex >= 0 ? path.slice(0, rowIndex) : path;
    const clickedControl = beforeRow.some(
      node =>
        node instanceof HTMLElement &&
        node.matches(
          'button, a, input, select, textarea, md-switch, md-checkbox, md-radio, md-icon-button, md-fab, [role="switch"], [role="radio"], [role="button"], [role="link"]',
        ),
    );

    if (clickedControl) return;

    this.#activate();
  }

  #handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (this.disabled || this.#isStatic()) return;
    event.preventDefault();
    this.#activate();
  }

  #handleIconSlotChange(event: Event): void {
    const slot = event.target as HTMLSlotElement;
    const hasIcon = slot.assignedElements({ flatten: true }).length > 0;
    if (this.hasIcon !== hasIcon) this.hasIcon = hasIcon;
  }

  #handleLeadingSlotChange(): void {
    this.#syncLeadingSlot();
  }

  #syncLeadingSlot(): void {
    const slot = this.shadowRoot?.querySelector('slot[name="leading"]') as HTMLSlotElement | null;
    if (!slot) return;
    const hasLeading = slot.assignedElements({ flatten: true }).length > 0;
    if (this.hasLeading !== hasLeading) this.hasLeading = hasLeading;
  }

  #handleHeadlineSlotChange(event: Event): void {
    const slot = event.target as HTMLSlotElement;
    const hasHeadline = slot.assignedElements({ flatten: true }).length > 0;
    if (this.hasHeadline !== hasHeadline) this.hasHeadline = hasHeadline;
  }

  #handleSupportingSlotChange(event: Event): void {
    const slot = event.target as HTMLSlotElement;
    const hasSupporting = slot.assignedElements({ flatten: true }).length > 0;
    if (this.hasSupporting !== hasSupporting) this.hasSupporting = hasSupporting;
  }

  #handleTrailingSlotChange(): void {
    this.#syncTrailingSlot();
  }

  #syncTrailingSlot(): void {
    const slot = this.shadowRoot?.querySelector('slot[name="trailing"]') as HTMLSlotElement | null;
    if (!slot) return;

    const control = slot
      .assignedElements({ flatten: true })
      .find((el): el is HTMLElement =>
        el instanceof HTMLElement &&
        (el.localName === 'md-switch' ||
          el.localName === 'md-checkbox' ||
          el.localName === 'md-radio' ||
          el.matches('input[type="checkbox"], input[type="radio"]') ||
          el.getAttribute('role') === 'switch' ||
          el.getAttribute('role') === 'radio'),
      );

    if (this.#trailingControl === (control ?? null)) return;

    if (this.#trailingControl) {
      this.#trailingControl.removeEventListener('change', this.#handleTrailingChange);
    }

    this.#trailingControl = control ?? null;
    this.hasTrailingControl = !!this.#trailingControl;

    if (this.#trailingControl) {
      this.#trailingControl.addEventListener('change', this.#handleTrailingChange);
      const state = this.#getControlState(this.#trailingControl);
      if (typeof state === 'boolean' && this.selected !== state) this.selected = state;
    }
  }

  #handleTrailingChange = (): void => {
    if (!this.#trailingControl || this.#syncingTrailing) return;
    const selected = this.#getControlState(this.#trailingControl) ?? false;
    if (this.selected !== selected) this.selected = selected;
    this.#emitChange();
  };

  #syncTrailingControl(emit = false): void {
    if (!this.#trailingControl) return;
    const control = this.#trailingControl;
    if (this.#getControlState(control) === this.selected) return;
    this.#syncingTrailing = true;
    this.#setControlState(control, this.selected);
    if (emit) control.dispatchEvent(new Event('change', { bubbles: true }));
    queueMicrotask(() => {
      this.#syncingTrailing = false;
    });
  }

  #handleCopy(): void {
    const text = this.value || this.supportingText || this.headline;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    this.dispatchEvent(
      new CustomEvent('sp-copy', {
        detail: { text },
        bubbles: true,
        composed: true,
      }),
    );
  }

  #renderTrailing() {
    if (this.variant === 'navigation' && this.chevron) return CHEVRON;
    if (this.variant === 'toggle') return html`<span class="switch" part="switch" aria-hidden="true"><span class="thumb"></span></span>`;
    if (this.variant === 'radio') return html`<span class="radio" part="radio" aria-hidden="true"></span>`;
    if ((this.variant === 'action' || this.variant === 'destructive') && this.loading) {
      return html`<span class="spinner" part="spinner" aria-hidden="true"></span>`;
    }
    if (this.variant === 'value' && this.copyable) {
      return html`
        <button
          type="button"
          class="copy-btn"
          part="copy-action"
          aria-label=${this.copyLabel || t('common_copy', 'Copy')}
          @click=${this.#handleCopy}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z" />
          </svg>
        </button>
      `;
    }
    return nothing;
  }

  protected override render() {
    const role = this.#role();
    const interactive = this.#isInteractive();
    const controlledToggle =
      this.hasTrailingControl && (this.variant === 'toggle' || this.variant === 'radio');
    const tabindex = interactive && !this.href && !controlledToggle ? 0 : undefined;
    const ariaChecked =
      !controlledToggle && (this.variant === 'toggle' || this.variant === 'radio')
        ? String(this.selected)
        : undefined;
    const hasHeadline = this.hasHeadline || this.headline.length > 0;
    const hasSupporting = this.hasSupporting || this.supportingText.length > 0;
    const labelledBy = this.label
      ? undefined
      : hasHeadline
        ? this.#headlineId
        : hasSupporting
          ? this.#supportingId
          : undefined;
    const describedBy = hasHeadline && hasSupporting ? this.#supportingId : undefined;

    const body = html`
      <span class="leading-raw" part="leading-raw">
        <slot name="leading" @slotchange=${this.#handleLeadingSlotChange}></slot>
      </span>
      <span class="leading" part="leading">
        <slot name="icon" @slotchange=${this.#handleIconSlotChange}></slot>
      </span>
      <span class="content" part="content">
        <span class="headline" part="headline" id=${this.#headlineId}>
          <slot name="headline" @slotchange=${this.#handleHeadlineSlotChange}>${this.headline}</slot>
        </span>
        <span class="supporting" part="supporting" id=${this.#supportingId}>
          <slot name="supporting" @slotchange=${this.#handleSupportingSlotChange}>${this.supportingText}</slot>
        </span>
      </span>
      <span class="trailing" part="trailing">
        <slot name="trailing" @slotchange=${this.#handleTrailingSlotChange}>${this.#renderTrailing()}</slot>
      </span>
    `;

    const className = [
      'row',
      `row--${this.variant}`,
      this.disabled ? 'row--disabled' : '',
      this.selected ? 'row--selected' : '',
    ]
      .filter(Boolean)
      .join(' ');

    if (this.href && !this.disabled && !this.#isStatic()) {
      return html`
        <a
          class=${className}
          part="row"
          href=${this.href}
          target=${this.target || nothing}
          rel=${this.target === '_blank' ? 'noopener noreferrer' : nothing}
          role=${role ?? nothing}
          aria-checked=${ariaChecked ?? nothing}
          aria-disabled=${this.disabled ? 'true' : nothing}
          aria-busy=${this.loading ? 'true' : nothing}
          aria-label=${this.label || nothing}
          aria-labelledby=${labelledBy ?? nothing}
          aria-describedby=${describedBy ?? nothing}
          @click=${this.#handleClick}
          @keydown=${this.#handleKeydown}
        >
          ${body}
        </a>
      `;
    }

    return html`
      <div
        class=${className}
        part="row"
        role=${role ?? nothing}
        tabindex=${tabindex ?? nothing}
        aria-checked=${ariaChecked ?? nothing}
        aria-disabled=${this.disabled ? 'true' : nothing}
        aria-busy=${this.loading ? 'true' : nothing}
        aria-label=${this.label || nothing}
        aria-labelledby=${labelledBy ?? nothing}
        aria-describedby=${describedBy ?? nothing}
        @click=${this.#handleClick}
        @keydown=${this.#handleKeydown}
      >
        ${body}
      </div>
    `;
  }
}

defineUiComponent('sp-settings-row', SpSettingsRow);

declare global {
  interface HTMLElementTagNameMap {
    'sp-settings-row': SpSettingsRow;
  }
}
