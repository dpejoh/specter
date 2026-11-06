import { beforeEach, describe, expect, it } from 'vitest';
import './sp-tooltip.js';
import type { SpTooltip } from './sp-tooltip.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.innerHTML = '';
});

function setup(): { target: HTMLButtonElement; tooltip: SpTooltip } {
  const target = document.createElement('button');
  target.id = 'tooltip-target';
  target.textContent = 'Target';
  const tooltip = document.createElement('sp-tooltip') as SpTooltip;
  tooltip.id = 'tooltip-test';
  tooltip.targetId = 'tooltip-target';
  tooltip.textContent = 'Go back';
  document.body.append(target, tooltip);
  return { target, tooltip };
}

describe('sp-tooltip', () => {
  it('wires aria-describedby on the target', async () => {
    const { target, tooltip } = setup();
    await tooltip.updateComplete;
    await tick();

    expect(tooltip.getAttribute('role')).toBe('tooltip');
    expect(tooltip.getAttribute('aria-hidden')).toBe('true');
    expect(target.getAttribute('aria-describedby')).toContain('tooltip-test');
  });

  it('shows and hides on focus', async () => {
    const { target, tooltip } = setup();
    tooltip.hideDelay = 0;
    await tooltip.updateComplete;
    await tick();

    target.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await tick();
    await tooltip.updateComplete;
    expect(tooltip.open).toBe(true);
    expect(tooltip.hasAttribute('aria-hidden')).toBe(false);

    target.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await tick();
    await tooltip.updateComplete;
    expect(tooltip.open).toBe(false);
    expect(tooltip.getAttribute('aria-hidden')).toBe('true');
  });

  it('closes on Escape', async () => {
    const { tooltip } = setup();
    await tooltip.updateComplete;
    await tick();

    await tooltip.show();
    expect(tooltip.open).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tooltip.updateComplete;
    expect(tooltip.open).toBe(false);
  });

  it('does not show when disabled', async () => {
    const { tooltip } = setup();
    tooltip.disabled = true;
    await tooltip.updateComplete;
    await tick();

    await tooltip.show();
    expect(tooltip.open).toBe(false);
  });

  it('does not attach to the target after an immediate disconnect', async () => {
    const target = document.createElement('button');
    target.id = 'tooltip-target';
    const tooltip = document.createElement('sp-tooltip') as SpTooltip;
    tooltip.id = 'tooltip-test';
    tooltip.targetId = 'tooltip-target';
    document.body.append(target, tooltip);
    tooltip.remove();
    await tick();

    expect(target.hasAttribute('aria-describedby')).toBe(false);
  });

  it('restores the original aria-describedby on disconnect', async () => {
    const { target, tooltip } = setup();
    target.setAttribute('aria-describedby', 'existing');
    await tooltip.updateComplete;
    await tick();

    expect(target.getAttribute('aria-describedby')).toContain('existing');
    expect(target.getAttribute('aria-describedby')).toContain('tooltip-test');

    tooltip.remove();
    expect(target.getAttribute('aria-describedby')).toBe('existing');
  });
});
