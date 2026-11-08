import { describe, expect, it, vi } from 'vitest';

import { closeMenu, wireMenuTrigger } from './menu-utils.js';

describe('menu utils', () => {
  it('closeMenu closes an open menu and tolerates missing menus', () => {
    const menu = { open: true };
    closeMenu(menu);
    expect(menu.open).toBe(false);
    expect(() => closeMenu(null)).not.toThrow();
    expect(() => closeMenu(undefined)).not.toThrow();
  });

  it('wireMenuTrigger toggles the menu and stops propagation', () => {
    const trigger = document.createElement('button');
    const menu = { open: false };
    wireMenuTrigger(trigger, menu);

    const event = new MouseEvent('click', { bubbles: true });
    const stopSpy = vi.spyOn(event, 'stopPropagation');
    trigger.dispatchEvent(event);
    expect(stopSpy).toHaveBeenCalled();
    expect(menu.open).toBe(true);

    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menu.open).toBe(false);
  });

  it('wireMenuTrigger ignores missing trigger or menu', () => {
    expect(() => wireMenuTrigger(null, { open: false })).not.toThrow();
    expect(() => wireMenuTrigger(document.createElement('button'), null)).not.toThrow();
  });
});
