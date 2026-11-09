export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDropdownConfig {
  id: string;
  ariaLabel: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

export interface FilterDropdownHandle {
  element: HTMLElement;
  setOptions(options: FilterOption[]): void;
  setValue(value: string): void;
  getValue(): string;
  close(): void;
  dispose(): void;
}

const OPEN_EVENT = 'filter-dropdown-open';

export function createFilterDropdown(config: FilterDropdownConfig): FilterDropdownHandle {
  let options = [...config.options];
  let value = config.value;
  let open = false;
  let docPointer: ((event: PointerEvent) => void) | null = null;
  let docKey: ((event: KeyboardEvent) => void) | null = null;

  const root = document.createElement('div');
  root.className = 'filter-dropdown';
  root.dataset.filterId = config.id;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'filter-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', `${config.id}-menu`);

  const triggerLabel = document.createElement('span');
  triggerLabel.className = 'filter-trigger-label';

  const triggerIcon = document.createElement('md-icon');
  triggerIcon.setAttribute('aria-hidden', 'true');
  triggerIcon.textContent = 'expand_more';

  trigger.append(triggerLabel, triggerIcon);

  const menu = document.createElement('div');
  menu.className = 'filter-menu';
  menu.id = `${config.id}-menu`;
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;

  root.append(trigger, menu);

  const selectedOption = () => options.find(option => option.value === value);
  const optionButtons = () => [...menu.querySelectorAll<HTMLButtonElement>('.filter-option')];

  // Keep the stored value and the visible label in agreement: an absent value
  // would otherwise display the first option's label while getValue() kept
  // returning the stale value.
  const normalizeValue = () => {
    if (options.length > 0 && !options.some(option => option.value === value)) {
      value = options[0]!.value;
    }
  };

  const syncTrigger = () => {
    const label = selectedOption()?.label ?? '';
    triggerLabel.textContent = label;
    trigger.setAttribute('aria-label', `${config.ariaLabel}: ${label}`.trim());
  };

  const removeDocListeners = () => {
    if (docPointer) document.removeEventListener('pointerdown', docPointer, true);
    if (docKey) document.removeEventListener('keydown', docKey, true);
    docPointer = null;
    docKey = null;
  };

  const close = () => {
    if (!open) return;
    open = false;
    root.classList.remove('filter-dropdown--open');
    menu.hidden = true;
    menu.style.insetInlineStart = '';
    menu.style.insetInlineEnd = '';
    trigger.setAttribute('aria-expanded', 'false');
    triggerIcon.textContent = 'expand_more';
    removeDocListeners();
  };

  const focusOption = (index: number) => {
    const buttons = optionButtons();
    if (buttons.length === 0) return;
    const clamped = Math.max(0, Math.min(index, buttons.length - 1));
    buttons.forEach((button, i) => { button.tabIndex = i === clamped ? 0 : -1; });
    buttons[clamped]?.focus();
  };

  const renderMenu = () => {
    menu.innerHTML = '';
    for (const option of options) {
      const selected = option.value === value;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'filter-option';
      button.dataset.value = option.value;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
      if (selected) button.classList.add('filter-option--selected');

      if (selected) {
        const check = document.createElement('md-icon');
        check.className = 'filter-option-check';
        check.setAttribute('aria-hidden', 'true');
        check.textContent = 'check';
        button.appendChild(check);
      }

      const text = document.createElement('span');
      text.className = 'filter-option-label';
      text.textContent = option.label;
      button.appendChild(text);

      const selectOption = () => {
        const changed = option.value !== value;
        value = option.value;
        syncTrigger();
        if (changed) config.onChange(value);
        close();
        trigger.focus();
      };

      button.addEventListener('click', selectOption);

      button.addEventListener('keydown', (event) => {
        const buttons = optionButtons();
        const index = buttons.indexOf(button);
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          focusOption(index + 1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          focusOption(index - 1);
        } else if (event.key === 'Home') {
          event.preventDefault();
          focusOption(0);
        } else if (event.key === 'End') {
          event.preventDefault();
          focusOption(buttons.length - 1);
        }
      });

      menu.appendChild(button);
    }
  };

  const openMenu = () => {
    if (open) return;
    open = true;
    root.classList.add('filter-dropdown--open');
    document.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: root }));
    renderMenu();
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    triggerIcon.textContent = 'expand_less';
    const selectedIndex = options.findIndex(option => option.value === value);
    focusOption(selectedIndex >= 0 ? selectedIndex : 0);

    if (typeof window !== 'undefined') {
      const menuRect = menu.getBoundingClientRect();
      if (menuRect.right > window.innerWidth - 16) {
        menu.style.insetInlineStart = 'auto';
        menu.style.insetInlineEnd = '0';
      } else {
        menu.style.insetInlineStart = '0';
        menu.style.insetInlineEnd = 'auto';
      }
    }

    docPointer = (event) => {
      if (!root.isConnected || !event.composedPath().includes(root)) close();
    };
    docKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
      trigger.focus();
    };
    document.addEventListener('pointerdown', docPointer, true);
    document.addEventListener('keydown', docKey, true);
  };

  trigger.addEventListener('click', () => {
    if (open) close();
    else openMenu();
  });

  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMenu();
    }
  });

  // Close only when focus genuinely moves to another control. Touch taps often
  // produce focusout with relatedTarget=null; closing on that would hide the
  // menu before the option's click handler runs.
  root.addEventListener('focusout', (event) => {
    const next = (event as FocusEvent).relatedTarget as Node | null;
    if (open && next && !root.contains(next)) close();
  });

  root.addEventListener('keydown', (event) => {
    if (open && event.key === 'Tab') close();
  });

  const setOptions = (next: FilterOption[]) => {
    options = [...next];
    if (options.length === 0) value = '';
    else normalizeValue();
    syncTrigger();
    renderMenu();
  };

  const setValue = (next: string) => {
    value = next;
    normalizeValue();
    syncTrigger();
    renderMenu();
  };

  const onOtherOpen = (event: Event) => {
    if ((event as CustomEvent).detail !== root) close();
  };
  document.addEventListener(OPEN_EVENT, onOtherOpen);

  normalizeValue();
  syncTrigger();
  renderMenu();

  return {
    element: root,
    setOptions,
    setValue,
    getValue: () => value,
    close,
    dispose: () => {
      close();
      document.removeEventListener(OPEN_EVENT, onOtherOpen);
    },
  };
}
