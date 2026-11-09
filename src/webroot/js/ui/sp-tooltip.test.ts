import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './sp-tooltip.js';
import type { SpTooltip } from './sp-tooltip.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

const VIEWPORT_WIDTH = 800;
const VIEWPORT_HEIGHT = 600;

interface RectInit {
  left: number;
  top: number;
  width: number;
  height: number;
}

function setViewport(width = VIEWPORT_WIDTH, height = VIEWPORT_HEIGHT): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function setRect(element: Element, { left, top, width, height }: RectInit): void {
  element.getBoundingClientRect = () =>
    ({
      x: left,
      y: top,
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      toJSON: () => ({}),
    }) as DOMRect;
}

function baseOf(tooltip: SpTooltip): HTMLElement {
  const base = tooltip.shadowRoot?.querySelector('.base');
  if (!(base instanceof HTMLElement)) throw new Error('missing tooltip base');
  return base;
}

async function showAt(
  tooltip: SpTooltip,
  target: Element,
  targetRect: RectInit,
  tooltipRect: RectInit = { left: 0, top: 0, width: 100, height: 32 },
): Promise<HTMLElement> {
  const base = baseOf(tooltip);
  setRect(target, targetRect);
  setRect(base, tooltipRect);
  await tooltip.show();
  return base;
}

beforeEach(() => {
  document.body.innerHTML = '';
  setViewport();
});

afterEach(() => {
  vi.restoreAllMocks();
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

  it('keeps multiple existing aria-describedby entries and restores them verbatim', async () => {
    const { target, tooltip } = setup();
    const original = 'first   second ';
    target.setAttribute('aria-describedby', original);
    await tooltip.updateComplete;
    await tick();

    expect(target.getAttribute('aria-describedby')).toBe('first second tooltip-test');

    tooltip.remove();
    expect(target.getAttribute('aria-describedby')).toBe(original);
  });

  it('assigns an id and can disconnect without a target', async () => {
    const tooltip = document.createElement('sp-tooltip') as SpTooltip;
    document.body.append(tooltip);
    await tick();

    expect(tooltip.id).toMatch(/^sp-tooltip-\d+$/);
    expect(tooltip.getAttribute('role')).toBe('tooltip');

    await tooltip.show();
    expect(tooltip.open).toBe(false);

    tooltip.remove();
    expect(tooltip.isConnected).toBe(false);
  });

  it('ignores a for attribute that points at no element', async () => {
    const tooltip = document.createElement('sp-tooltip') as SpTooltip;
    tooltip.id = 'tooltip-missing';
    tooltip.targetId = 'not-in-the-document';
    document.body.append(tooltip);
    await tick();

    await tooltip.show();
    expect(tooltip.open).toBe(false);
  });

  it('does not add aria-hidden when it is initialized open', async () => {
    const target = document.createElement('button');
    target.id = 'tooltip-target';
    const tooltip = document.createElement('sp-tooltip') as SpTooltip;
    tooltip.id = 'tooltip-open';
    tooltip.targetId = 'tooltip-target';
    tooltip.open = true;
    document.body.append(target, tooltip);

    // connectedCallback() must not mark a tooltip that is already open as hidden.
    expect(tooltip.hasAttribute('aria-hidden')).toBe(false);

    await tooltip.updateComplete;
    await tick();
    expect(target.getAttribute('aria-describedby')).toContain('tooltip-open');
  });

  it('closes and detaches when retargeted to a missing id', async () => {
    const { target, tooltip } = setup();
    await tooltip.updateComplete;
    await tick();
    await tooltip.show();

    tooltip.targetId = 'nowhere';
    await tooltip.updateComplete;
    await tick();

    expect(tooltip.open).toBe(false);
    expect(target.hasAttribute('aria-describedby')).toBe(false);
  });

  it('does not close for keys other than Escape', async () => {
    const { target, tooltip } = setup();
    await tooltip.updateComplete;
    await tick();
    await tooltip.show();

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await tooltip.updateComplete;

    expect(tooltip.open).toBe(true);
  });

  it('does not schedule a show while disabled', async () => {
    const { target, tooltip } = setup();
    tooltip.disabled = true;
    await tooltip.updateComplete;
    await tick();

    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    target.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await tick();
    await tooltip.updateComplete;

    expect(tooltip.open).toBe(false);
  });

  it('waits for the hide delay before closing', async () => {
    const { target, tooltip } = setup();
    tooltip.hideDelay = 25;
    await tooltip.updateComplete;
    await tick();
    await tooltip.show();

    target.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(tooltip.open).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 40));
    await tooltip.updateComplete;
    expect(tooltip.open).toBe(false);
  });

  it('cancels a pending hide when the pointer re-enters', async () => {
    const { target, tooltip } = setup();
    tooltip.hideDelay = 30;
    await tooltip.updateComplete;
    await tick();
    await tooltip.show();

    target.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    await tick();
    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    await new Promise(resolve => setTimeout(resolve, 45));
    await tooltip.updateComplete;
    expect(tooltip.open).toBe(true);
  });

  it('cancels a pending show when the pointer leaves', async () => {
    const { target, tooltip } = setup();
    tooltip.showDelay = 30;
    tooltip.hideDelay = 0;
    await tooltip.updateComplete;
    await tick();

    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(tooltip.open).toBe(false);
    target.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

    await new Promise(resolve => setTimeout(resolve, 45));
    await tooltip.updateComplete;
    expect(tooltip.open).toBe(false);
  });

  describe('positioning', () => {
    it('positions below by default', async () => {
      const { target, tooltip } = setup();
      await tooltip.updateComplete;
      await tick();

      const base = await showAt(tooltip, target, { left: 100, top: 100, width: 80, height: 40 });

      expect(base.style.left).toBe('90px');
      expect(base.style.top).toBe('144px');
    });

    it('positions above when there is room', async () => {
      const { target, tooltip } = setup();
      tooltip.position = 'above';
      await tooltip.updateComplete;
      await tick();

      const base = await showAt(tooltip, target, { left: 100, top: 200, width: 80, height: 40 });

      expect(base.style.left).toBe('90px');
      expect(base.style.top).toBe('164px');
    });

    it('positions before and after in left-to-right layouts', async () => {
      const { target, tooltip } = setup();
      tooltip.position = 'before';
      await tooltip.updateComplete;
      await tick();

      const base = await showAt(tooltip, target, { left: 500, top: 100, width: 80, height: 40 });
      expect(base.style.left).toBe('396px');
      expect(base.style.top).toBe('104px');

      tooltip.position = 'after';
      await tooltip.updateComplete;
      expect(base.style.left).toBe('584px');
      expect(base.style.top).toBe('104px');
    });

    it('flips below to above at the bottom edge', async () => {
      const { target, tooltip } = setup();
      await tooltip.updateComplete;
      await tick();

      const base = await showAt(tooltip, target, { left: 100, top: 560, width: 80, height: 40 });

      expect(base.style.left).toBe('90px');
      expect(base.style.top).toBe('524px');
    });

    it('keeps below when there is no room above it either', async () => {
      const { target, tooltip } = setup();
      await tooltip.updateComplete;
      await tick();

      const base = await showAt(
        tooltip,
        target,
        { left: 100, top: 10, width: 80, height: 40 },
        { left: 0, top: 0, width: 100, height: 560 },
      );

      expect(base.style.top).toBe('32px');
    });

    it('flips above to below at the top edge', async () => {
      const { target, tooltip } = setup();
      tooltip.position = 'above';
      await tooltip.updateComplete;
      await tick();

      const base = await showAt(tooltip, target, { left: 100, top: 10, width: 80, height: 40 });

      expect(base.style.top).toBe('54px');
    });

    it('keeps above when there is no room below it either', async () => {
      const { target, tooltip } = setup();
      tooltip.position = 'above';
      await tooltip.updateComplete;
      await tick();

      const base = await showAt(tooltip, target, { left: 100, top: 10, width: 80, height: 580 });

      expect(base.style.top).toBe('8px');
    });

    it('flips after to before at the right edge', async () => {
      const { target, tooltip } = setup();
      tooltip.position = 'after';
      await tooltip.updateComplete;
      await tick();

      const base = await showAt(tooltip, target, { left: 700, top: 100, width: 80, height: 40 });

      expect(base.style.left).toBe('596px');
      expect(base.style.top).toBe('104px');
    });

    it('keeps after when there is no room before it either', async () => {
      const { target, tooltip } = setup();
      tooltip.position = 'after';
      await tooltip.updateComplete;
      await tick();

      const base = await showAt(
        tooltip,
        target,
        { left: 4, top: 100, width: 80, height: 40 },
        { left: 0, top: 0, width: 1000, height: 32 },
      );

      expect(base.style.left).toBe('8px');
      expect(base.style.top).toBe('104px');
    });

    it('flips before to after at the left edge', async () => {
      const { target, tooltip } = setup();
      tooltip.position = 'before';
      await tooltip.updateComplete;
      await tick();

      const base = await showAt(tooltip, target, { left: 40, top: 100, width: 80, height: 40 });

      expect(base.style.left).toBe('124px');
      expect(base.style.top).toBe('104px');
    });

    it('keeps before when there is no room after it either', async () => {
      const { target, tooltip } = setup();
      tooltip.position = 'before';
      await tooltip.updateComplete;
      await tick();

      const base = await showAt(tooltip, target, { left: 40, top: 100, width: 700, height: 40 });

      expect(base.style.left).toBe('8px');
      expect(base.style.top).toBe('104px');
    });

    it('mirrors before and after in right-to-left layouts', async () => {
      const { target, tooltip } = setup();
      target.style.direction = 'rtl';
      tooltip.position = 'before';
      await tooltip.updateComplete;
      await tick();

      const base = await showAt(tooltip, target, { left: 500, top: 100, width: 80, height: 40 });
      expect(base.style.left).toBe('584px');

      tooltip.position = 'after';
      await tooltip.updateComplete;
      expect(base.style.left).toBe('396px');
    });

    it('clamps to the left and right viewport margins', async () => {
      const { target, tooltip } = setup();
      await tooltip.updateComplete;
      await tick();

      const base = await showAt(tooltip, target, { left: -100, top: 100, width: 40, height: 40 });
      expect(base.style.left).toBe('8px');

      setRect(target, { left: 760, top: 100, width: 40, height: 40 });
      await tooltip.show();
      expect(base.style.left).toBe('692px');
    });

    it('clamps to the top and bottom viewport margins', async () => {
      const { target, tooltip } = setup();
      tooltip.position = 'before';
      await tooltip.updateComplete;
      await tick();

      const base = await showAt(tooltip, target, { left: 400, top: 560, width: 80, height: 40 });

      expect(base.style.left).toBe('296px');
      expect(base.style.top).toBe('560px');
    });

    it('returns early when the rendered base is missing', async () => {
      const { tooltip } = setup();
      await tooltip.updateComplete;
      await tick();
      await tooltip.show();

      baseOf(tooltip).remove();
      tooltip.position = 'above';
      await tooltip.updateComplete;

      expect(tooltip.open).toBe(true);
    });

    it('returns early when it has no target', async () => {
      const { tooltip } = setup();
      await tooltip.updateComplete;
      await tick();
      await tooltip.show();

      tooltip.targetId = 'missing-again';
      await tooltip.updateComplete;
      await tick();
      tooltip.open = true;
      tooltip.position = 'above';
      await tooltip.updateComplete;

      expect(tooltip.open).toBe(true);
    });
  });

  describe('viewport tracking', () => {
    it('repositions on scroll and resize while open, coalescing frames', async () => {
      const { target, tooltip } = setup();
      await tooltip.updateComplete;
      await tick();

      const frames: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
        frames.push(callback);
        return frames.length;
      });

      window.dispatchEvent(new Event('scroll'));
      expect(frames).toHaveLength(0);

      const base = await showAt(tooltip, target, { left: 100, top: 100, width: 80, height: 40 });
      expect(base.style.top).toBe('144px');

      setRect(target, { left: 100, top: 200, width: 80, height: 40 });
      window.dispatchEvent(new Event('scroll'));
      expect(frames).toHaveLength(1);

      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
      expect(frames).toHaveLength(1);

      frames.shift()!(0);
      expect(base.style.top).toBe('244px');

      setRect(target, { left: 100, top: 300, width: 80, height: 40 });
      window.dispatchEvent(new Event('resize'));
      expect(frames).toHaveLength(1);

      frames.shift()!(0);
      expect(base.style.top).toBe('344px');
    });

    it('cancels a pending reposition when hidden', async () => {
      const { target, tooltip } = setup();
      await tooltip.updateComplete;
      await tick();

      const base = await showAt(tooltip, target, { left: 100, top: 100, width: 80, height: 40 });
      const topBeforeHide = base.style.top;

      const frames: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
        frames.push(callback);
        return frames.length;
      });
      const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

      window.dispatchEvent(new Event('scroll'));
      expect(frames).toHaveLength(1);

      tooltip.hide();
      expect(cancel).toHaveBeenCalledWith(1);

      frames[0]!(0);
      expect(base.style.top).toBe(topBeforeHide);
    });
  });
});
