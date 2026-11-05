export interface MenuLike {
  open: boolean;
}

export function closeMenu(menu: MenuLike | null | undefined): void {
  if (menu) menu.open = false;
}

/** Shared trigger wiring for the Material menus used across subpages. */
export function wireMenuTrigger(trigger: HTMLElement | null, menu: MenuLike | null): void {
  if (!trigger || !menu) return;
  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    menu.open = !menu.open;
  });
}
