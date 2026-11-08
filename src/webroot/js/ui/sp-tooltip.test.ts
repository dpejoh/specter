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

  it('shows and hides on hover', async () => {
    const { target, tooltip } = setup();
    tooltip.hideDelay = 0;
    await tooltip.updateComplete;
    await tick();

    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await tick();
    await tooltip.updateComplete;
    expect(tooltip.open).toBe(true);

    target.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    await tick();
    await tooltip.updateComplete;
    expect(tooltip.open).toBe(false);
  });

  it('toggles open and closed', async () => {
    const { tooltip } = setup();
    await tooltip.updateComplete;
    await tick();

    tooltip.toggle();
    await tick();
    await tooltip.updateComplete;
    expect(tooltip.open).toBe(true);

    tooltip.toggle();
    await tooltip.updateComplete;
    expect(tooltip.open).toBe(false);
  });

  it('closes on Escape pressed on the target', async () => {
    const { target, tooltip } = setup();
    await tooltip.updateComplete;
    await tick();

    await tooltip.show();
    expect(tooltip.open).toBe(true);

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tooltip.updateComplete;
    expect(tooltip.open).toBe(false);
  });

  it('waits for the show delay before opening', async () => {
    const { target, tooltip } = setup();
    tooltip.showDelay = 25;
    await tooltip.updateComplete;
    await tick();

    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(tooltip.open).toBe(false);

    await new Promise(resolve => setTimeout(resolve, 40));
    await tooltip.updateComplete;
    expect(tooltip.open).toBe(true);
  });

  it('hides when disabled while open', async () => {
    const { tooltip } = setup();
    await tooltip.updateComplete;
    await tick();

    await tooltip.show();
    expect(tooltip.open).toBe(true);

    tooltip.disabled = true;
    await tooltip.updateComplete;
    expect(tooltip.open).toBe(false);
  });

  it('retargets when the for attribute changes', async () => {
    const { target, tooltip } = setup();
    await tooltip.updateComplete;
    await tick();

    const other = document.createElement('button');
    other.id = 'tooltip-other';
    document.body.append(other);
    tooltip.targetId = 'tooltip-other';
    await tooltip.updateComplete;
    await tick();

    expect(target.getAttribute('aria-describedby')).toBeNull();
    expect(other.getAttribute('aria-describedby')).toContain('tooltip-test');
  });

  it('hides another open tooltip when shown', async () => {
    const { tooltip } = setup();
    await tooltip.updateComplete;
    await tick();

    const target2 = document.createElement('button');
    target2.id = 'tooltip-target-2';
    const tooltip2 = document.createElement('sp-tooltip') as SpTooltip;
    tooltip2.id = 'tooltip-test-2';
    tooltip2.targetId = 'tooltip-target-2';
    document.body.append(target2, tooltip2);
    await tooltip2.updateComplete;
    await tick();

    await tooltip.show();
    expect(tooltip.open).toBe(true);

    await tooltip2.show();
    expect(tooltip2.open).toBe(true);
    expect(tooltip.open).toBe(false);
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
