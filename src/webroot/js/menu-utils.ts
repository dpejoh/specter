export interface MenuLike {
  open: boolean;
}

/** Shared trigger wiring for the Material menus used across subpages. */
export function wireMenuTrigger(trigger: HTMLElement | null, menu: MenuLike | null): void {
  if (!trigger || !menu) return;
  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    menu.open = !menu.open;
  });
}
