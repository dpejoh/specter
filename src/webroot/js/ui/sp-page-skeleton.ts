/*
 * Page-level loading placeholder.
 *
 * One component draws the section and row shapes used while a page is being
 * prepared. Pages use this instead of writing their own loading markup, so the
 * shape and animation stay consistent and testable.
 */

import { LitElement, css, html } from 'lit';
import { defineUiComponent } from './define.js';

const DEFAULT_SECTIONS = 3;
const DEFAULT_ROWS = 3;
const MAX_SECTIONS = 12;
const MAX_ROWS = 12;

export class SpPageSkeleton extends LitElement {
  static properties = {
    sections: { type: Number },
    rows: { type: Number },
  };

  declare sections: number;
  declare rows: number;

  constructor() {
    super();
    this.sections = DEFAULT_SECTIONS;
    this.rows = DEFAULT_ROWS;
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      max-width: 800px;
      margin-inline: auto;
      box-sizing: border-box;
    }

    :host([hidden]) {
      display: none;
    }

    .skeleton {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .heading,
    .row {
      background: var(--sp-page-skeleton-color, var(--md-sys-color-surface-container-high, #ece6f0));
      animation: sp-page-skeleton-pulse 1.6s ease-in-out infinite;
    }

    .heading {
      width: 42%;
      height: 1em;
      border-radius: 6px;
    }

    .rows {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .row {
      height: var(--sp-page-skeleton-row-height, 56px);
      border-radius: 4px;
    }

    .row:first-child {
      border-radius: 24px 24px 4px 4px;
    }

    .row:last-child {
      border-radius: 4px 4px 24px 24px;
    }

    .row:only-child {
      border-radius: 24px;
    }

    @keyframes sp-page-skeleton-pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.45;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .heading,
      .row {
        animation: none;
      }
    }

    @media (forced-colors: active) {
      .heading,
      .row {
        background: GrayText;
        animation: none;
      }
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute('aria-hidden', 'true');
  }

  #clamp(value: number, fallback: number, max: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(1, Math.min(max, Math.floor(value)));
  }

  protected override render() {
    const sections = this.#clamp(this.sections, DEFAULT_SECTIONS, MAX_SECTIONS);
    const rows = this.#clamp(this.rows, DEFAULT_ROWS, MAX_ROWS);

    return html`
      <div class="skeleton" part="skeleton">
        ${Array.from({ length: sections }, () => html`
          <div class="section" part="section">
            <span class="heading" part="heading"></span>
            <div class="rows" part="rows">
              ${Array.from({ length: rows }, () => html`<span class="row" part="row"></span>`)}
            </div>
          </div>
        `)}
      </div>
    `;
  }
}

defineUiComponent('sp-page-skeleton', SpPageSkeleton);

declare global {
  interface HTMLElementTagNameMap {
    'sp-page-skeleton': SpPageSkeleton;
  }
}
