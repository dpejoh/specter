/*
 * Specter UI — tooltip.
 *
 * Behaviour and visual conventions are adapted from @m3e/web (MIT) and AWC UI
 * (MIT), simplified to a self-contained Lit component with no runtime deps.
 */

import { LitElement, css, html } from 'lit';
import { defineUiComponent } from './define.js';

export type SpTooltipPosition = 'above' | 'below' | 'before' | 'after';

let tooltipSequence = 0;
const openTooltips = new Set<SpTooltip>();

export class SpTooltip extends LitElement {
  static properties = {
    targetId: { attribute: 'for', type: String },
    position: { type: String, reflect: true },
    showDelay: { attribute: 'show-delay', type: Number },
    hideDelay: { attribute: 'hide-delay', type: Number },
    disabled: { type: Boolean, reflect: true },
    open: { type: Boolean, reflect: true },
  };

  declare targetId: string;
  declare position: SpTooltipPosition;
  declare showDelay: number;
  declare hideDelay: number;
  declare disabled: boolean;
  declare open: boolean;

  #target: HTMLElement | null = null;
  #originalDescribedBy: string | null = null;
  #showTimer: ReturnType<typeof setTimeout> | undefined;
  #hideTimer: ReturnType<typeof setTimeout> | undefined;
  #scrollRaf = 0;

  constructor() {
    super();
    this.targetId = '';
    this.position = 'below';
    this.showDelay = 0;
    this.hideDelay = 200;
    this.disabled = false;
    this.open = false;
  }

  static styles = css`
    :host {
      display: contents;
    }

    :host([hidden]) {
      display: none;
    }

    .base {
      position: fixed;
      z-index: 10050;
      box-sizing: border-box;
      display: none;
      max-width: var(--sp-tooltip-max-width, 200px);
      min-width: 40px;
      padding: 4px 8px;
      border-radius: var(--sp-tooltip-shape, 4px);
      background: var(--md-sys-color-inverse-surface, #313033);
      color: var(--md-sys-color-inverse-on-surface, #f4eff4);
      font-family: var(--md-sys-typescale-body-small-font, var(--md-ref-typeface-plain, inherit));
      font-size: 0.75rem;
      font-weight: 400;
      line-height: 1rem;
      letter-spacing: 0.4px;
      text-align: start;
      overflow-wrap: break-word;
      pointer-events: none;
      opacity: 0;
      transform: scale(0.8);
      transition: opacity 150ms ease, transform 150ms ease;
    }

    .base[data-open] {
      display: block;
      opacity: 1;
      transform: scale(1);
    }

    @media (prefers-reduced-motion: reduce) {
      .base {
        transition: none;
      }
    }

    @media (forced-colors: active) {
      .base {
        background: Canvas;
        color: CanvasText;
        border: 1px solid CanvasText;
      }
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    if (!this.id) this.id = `sp-tooltip-${++tooltipSequence}`;
    this.setAttribute('role', 'tooltip');
    if (!this.open) this.setAttribute('aria-hidden', 'true');
    queueMicrotask(() => this.#attach());
  }

  override disconnectedCallback(): void {
    this.#detach();
    this.#clearTimers();
    this.#removeDocumentListeners();
    this.#stopObservingViewport();
    openTooltips.delete(this);
    super.disconnectedCallback();
  }

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('targetId')) {
      this.hide();
      this.#attach();
    }

    if (changed.has('disabled') && this.disabled) {
      this.hide();
    }

    if (changed.has('open')) {
      if (this.open) {
        this.removeAttribute('aria-hidden');
      } else {
        this.setAttribute('aria-hidden', 'true');
      }
    }

    if (changed.has('position') && this.open) {
      this.#position();
    }
  }

  /** Shows the tooltip immediately. */
  async show(): Promise<void> {
    if (this.disabled || !this.#target) return;

    this.#clearTimers();
    for (const tooltip of openTooltips) {
      if (tooltip !== this) tooltip.hide();
    }

    this.open = true;
    openTooltips.add(this);
    this.#addDocumentListeners();
    await this.updateComplete;
    this.#position();
    this.#observeViewport();
  }

  /** Hides the tooltip immediately. */
  hide(): void {
    this.#clearTimers();
    this.open = false;
    openTooltips.delete(this);
    this.#removeDocumentListeners();
    this.#stopObservingViewport();
  }

  /** Toggles the tooltip. */
  toggle(): void {
    if (this.open) this.hide();
    else void this.show();
  }

  #attach(): void {
    this.#detach();
    if (!this.isConnected || !this.targetId) return;

    const target = document.getElementById(this.targetId);
    if (!target) return;

    this.#target = target;
    this.#originalDescribedBy = target.getAttribute('aria-describedby');
    const ids = new Set(
      (this.#originalDescribedBy ?? '')
        .split(/\s+/)
        .map(value => value.trim())
        .filter(Boolean),
    );
    ids.add(this.id);
    target.setAttribute('aria-describedby', Array.from(ids).join(' '));

    target.addEventListener('mouseenter', this.#handleEnter);
    target.addEventListener('mouseleave', this.#handleLeave);
    target.addEventListener('focusin', this.#handleFocusIn);
    target.addEventListener('focusout', this.#handleFocusOut);
    target.addEventListener('keydown', this.#handleTargetKeyDown);
  }

  #detach(): void {
    if (!this.#target) return;
    const target = this.#target;

    target.removeEventListener('mouseenter', this.#handleEnter);
    target.removeEventListener('mouseleave', this.#handleLeave);
    target.removeEventListener('focusin', this.#handleFocusIn);
    target.removeEventListener('focusout', this.#handleFocusOut);
    target.removeEventListener('keydown', this.#handleTargetKeyDown);

    if (this.#originalDescribedBy) {
      target.setAttribute('aria-describedby', this.#originalDescribedBy);
    } else {
      target.removeAttribute('aria-describedby');
    }

    this.#target = null;
    this.#originalDescribedBy = null;
  }

  #clearTimers(): void {
    if (this.#showTimer !== undefined) {
      clearTimeout(this.#showTimer);
      this.#showTimer = undefined;
    }
    if (this.#hideTimer !== undefined) {
      clearTimeout(this.#hideTimer);
      this.#hideTimer = undefined;
    }
  }

  #scheduleShow(): void {
    this.#clearTimers();
    if (this.disabled) return;
    if (this.showDelay > 0) {
      this.#showTimer = setTimeout(() => {
        this.#showTimer = undefined;
        void this.show();
      }, this.showDelay);
    } else {
      void this.show();
    }
  }

  #scheduleHide(): void {
    this.#clearTimers();
    if (this.hideDelay > 0) {
      this.#hideTimer = setTimeout(() => {
        this.#hideTimer = undefined;
        this.hide();
      }, this.hideDelay);
    } else {
      this.hide();
    }
  }

  #handleEnter = (): void => {
    this.#scheduleShow();
  };

  #handleLeave = (): void => {
    this.#scheduleHide();
  };

  #handleFocusIn = (): void => {
    this.#scheduleShow();
  };

  #handleFocusOut = (): void => {
    this.#scheduleHide();
  };

  #handleTargetKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.hide();
  };

  #handleDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.hide();
  };

  #addDocumentListeners(): void {
    document.addEventListener('keydown', this.#handleDocumentKeyDown);
  }

  #removeDocumentListeners(): void {
    document.removeEventListener('keydown', this.#handleDocumentKeyDown);
  }

  #observeViewport(): void {
    window.addEventListener('scroll', this.#handleViewportChange, { passive: true });
    window.addEventListener('resize', this.#handleViewportChange, { passive: true });
  }

  #stopObservingViewport(): void {
    window.removeEventListener('scroll', this.#handleViewportChange);
    window.removeEventListener('resize', this.#handleViewportChange);
    if (this.#scrollRaf) {
      cancelAnimationFrame(this.#scrollRaf);
      this.#scrollRaf = 0;
    }
  }

  #handleViewportChange = (): void => {
    if (!this.open || this.#scrollRaf) return;
    this.#scrollRaf = requestAnimationFrame(() => {
      this.#scrollRaf = 0;
      if (this.open) this.#position();
    });
  };

  #position(): void {
    const base = this.shadowRoot?.querySelector('.base') as HTMLElement | null;
    const target = this.#target;
    if (!base || !target) return;

    const gap = 4;
    const margin = 8;
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = base.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let position = this.position;
    const rtl = getComputedStyle(target).direction === 'rtl';
    if (position === 'before') position = rtl ? 'after' : 'before';
    else if (position === 'after') position = rtl ? 'before' : 'after';

    if (position === 'below' && targetRect.bottom + gap + tooltipRect.height > viewportHeight) {
      if (targetRect.top - gap - tooltipRect.height >= margin) position = 'above';
    } else if (position === 'above' && targetRect.top - gap - tooltipRect.height < margin) {
      if (targetRect.bottom + gap + tooltipRect.height <= viewportHeight - margin) position = 'below';
    } else if (position === 'after' && targetRect.right + gap + tooltipRect.width > viewportWidth) {
      if (targetRect.left - gap - tooltipRect.width >= margin) position = 'before';
    } else if (position === 'before' && targetRect.left - gap - tooltipRect.width < margin) {
      if (targetRect.right + gap + tooltipRect.width <= viewportWidth - margin) position = 'after';
    }

    let x = 0;
    let y = 0;

    switch (position) {
      case 'above':
        x = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        y = targetRect.top - tooltipRect.height - gap;
        break;
      case 'before':
        x = targetRect.left - tooltipRect.width - gap;
        y = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        break;
      case 'after':
        x = targetRect.right + gap;
        y = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        break;
      case 'below':
      default:
        x = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        y = targetRect.bottom + gap;
        break;
    }

    x = Math.min(Math.max(margin, x), Math.max(margin, viewportWidth - tooltipRect.width - margin));
    y = Math.min(Math.max(margin, y), Math.max(margin, viewportHeight - tooltipRect.height - margin));

    base.style.left = `${Math.round(x)}px`;
    base.style.top = `${Math.round(y)}px`;
  }

  protected override render() {
    return html`
      <div class="base" part="tooltip" ?data-open=${this.open}>
        <slot></slot>
      </div>
    `;
  }
}

defineUiComponent('sp-tooltip', SpTooltip);

declare global {
  interface HTMLElementTagNameMap {
    'sp-tooltip': SpTooltip;
  }
}
