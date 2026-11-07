/*
 * Specter UI — skeleton.
 *
 * Shape and motion conventions are adapted from @m3e/web (MIT) and AWC UI
 * (MIT), reduced to the standalone and content-wrapping cases Specter needs.
 */

import { LitElement, css, html } from 'lit';
import { defineUiComponent } from './define.js';

export type SpSkeletonVariant = 'text' | 'rectangular' | 'rounded' | 'circular';
export type SpSkeletonAnimation = 'pulse' | 'wave' | 'none';

export class SpSkeleton extends LitElement {
  static properties = {
    variant: { type: String, reflect: true },
    animation: { type: String, reflect: true },
    loaded: { type: Boolean, reflect: true },
  };

  declare variant: SpSkeletonVariant;
  declare animation: SpSkeletonAnimation;
  declare loaded: boolean;

  #observer: MutationObserver | null = null;
  #hasContent = false;

  constructor() {
    super();
    this.variant = 'text';
    this.animation = 'pulse';
    this.loaded = false;
  }

  /** Whether the skeleton has slotted content to mask. */
  get hasContent(): boolean {
    return this.#hasContent;
  }

  static styles = css`
    :host {
      display: block;
      position: relative;
      width: 100%;
      box-sizing: border-box;
    }

    :host([hidden]) {
      display: none;
    }

    .shape {
      display: block;
      width: 100%;
      height: var(--sp-skeleton-height, 1rem);
      border-radius: 4px;
      background: var(--sp-skeleton-color, var(--md-sys-color-surface-container-highest, #e6e0e9));
      overflow: hidden;
      opacity: 1;
      transition: opacity 150ms ease;
    }

    :host([variant='text']) .shape {
      height: var(--sp-skeleton-height, 0.75em);
      border-radius: 4px;
    }

    :host([variant='rectangular']) .shape {
      height: var(--sp-skeleton-height, 1rem);
      border-radius: 0;
    }

    :host([variant='rounded']) .shape {
      height: var(--sp-skeleton-height, 1rem);
      border-radius: var(--sp-skeleton-shape, 12px);
    }

    :host([variant='circular']) {
      width: var(--sp-skeleton-size, 40px);
      flex: none;
    }

    :host([variant='circular']) .shape {
      width: var(--sp-skeleton-size, 40px);
      height: var(--sp-skeleton-size, 40px);
      border-radius: 50%;
    }

    :host([animation='pulse']) .shape {
      animation: sp-skeleton-pulse 1.6s ease-in-out infinite;
    }

    :host([animation='wave']) .shape {
      background: linear-gradient(
        90deg,
        var(--sp-skeleton-color, var(--md-sys-color-surface-container-highest, #e6e0e9)) 25%,
        var(--sp-skeleton-highlight, var(--md-sys-color-surface-container-high, #ece6f0)) 37%,
        var(--sp-skeleton-color, var(--md-sys-color-surface-container-highest, #e6e0e9)) 63%
      );
      background-size: 400% 100%;
      animation: sp-skeleton-wave 1.4s ease infinite;
    }

    :host([animation='none']) .shape {
      animation: none;
    }

    :host([has-content]) .shape {
      position: absolute;
      inset: 0;
      width: 100%;
      height: auto;
    }

    :host([has-content]) .content {
      visibility: hidden;
    }

    :host([has-content][loaded]) .content {
      visibility: visible;
    }

    :host([loaded]) .shape {
      opacity: 0;
      visibility: hidden;
    }

    :host([loaded]:not([has-content])) .shape {
      display: none;
    }

    .content {
      display: block;
    }

    @keyframes sp-skeleton-pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.45;
      }
    }

    @keyframes sp-skeleton-wave {
      0% {
        background-position: 100% 50%;
      }
      100% {
        background-position: 0 50%;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .shape {
        animation: none !important;
        transition: none;
      }
    }

    @media (forced-colors: active) {
      .shape {
        background: GrayText;
        animation: none;
      }
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.#observer = new MutationObserver(() => this.#syncSlotContent());
    this.#observer.observe(this, { childList: true });
  }

  override disconnectedCallback(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    super.disconnectedCallback();
  }

  protected override firstUpdated(): void {
    this.#syncSlotContent();
  }

  protected override updated(): void {
    this.toggleAttribute('aria-busy', this.#hasContent && !this.loaded);
  }

  #syncSlotContent(): void {
    const slot = this.shadowRoot?.querySelector('slot') as HTMLSlotElement | null;
    const hasContent = !!slot && slot.assignedElements({ flatten: true }).length > 0;
    if (this.#hasContent === hasContent) return;
    this.#hasContent = hasContent;
    this.toggleAttribute('has-content', hasContent);
    this.toggleAttribute('aria-busy', hasContent && !this.loaded);
  }

  #handleSlotChange(): void {
    this.#syncSlotContent();
  }

  protected override render() {
    return html`
      <span class="shape" part="skeleton" aria-hidden="true"></span>
      <span class="content" part="content">
        <slot @slotchange=${this.#handleSlotChange}></slot>
      </span>
    `;
  }
}

defineUiComponent('sp-skeleton', SpSkeleton);

declare global {
  interface HTMLElementTagNameMap {
    'sp-skeleton': SpSkeleton;
  }
}
