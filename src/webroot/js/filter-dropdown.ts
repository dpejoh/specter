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

  const triggerLabel = document.createElement('span');
  triggerLabel.className = 'filter-trigger-label';

  const triggerIcon = document.createElement('md-icon');
  triggerIcon.setAttribute('aria-hidden', 'true');
  triggerIcon.textContent = 'expand_more';

  trigger.append(triggerLabel, triggerIcon);

  const menu = document.createElement('div');
  menu.className = 'filter-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;

  root.append(trigger, menu);

  const selectedOption = () => options.find(option => option.value === value) ?? options[0];
  const optionButtons = () => [...menu.querySelectorAll<HTMLButtonElement>('.filter-option')];

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
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    triggerIcon.textContent = 'expand_more';
    removeDocListeners();
  };

  const focusOption = (index: number) => {
    const buttons = optionButtons();
    if (buttons.length === 0) return;
    buttons[Math.max(0, Math.min(index, buttons.length - 1))]?.focus();
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
      if (selected) button.classList.add('filter-option--selected');

      if (selected) {
        const check = document.createElement('md-icon');
        check.className = 'filter-option-check';
        check.setAttribute('aria-hidden', 'true');
        check.textContent = 'check';
        button.appendChild(check);
      }

      const text = document.createElement('span');
      text.textContent = option.label;
      button.appendChild(text);

      button.addEventListener('click', () => {
        const changed = option.value !== value;
        value = option.value;
        syncTrigger();
        if (changed) config.onChange(value);
        close();
        trigger.focus();
      });

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
    renderMenu();
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    triggerIcon.textContent = 'expand_less';
    const selectedIndex = options.findIndex(option => option.value === value);
    focusOption(selectedIndex >= 0 ? selectedIndex : 0);

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

  root.addEventListener('focusout', () => {
    queueMicrotask(() => {
      if (open && !root.contains(document.activeElement)) close();
    });
  });

  const setOptions = (next: FilterOption[]) => {
    options = [...next];
    if (!options.some(option => option.value === value)) {
      value = options[0]?.value ?? '';
    }
    syncTrigger();
    renderMenu();
  };

  const setValue = (next: string) => {
    value = next;
    syncTrigger();
    renderMenu();
  };

  syncTrigger();
  renderMenu();

  return {
    element: root,
    setOptions,
    setValue,
    getValue: () => value,
    close,
    dispose: close,
  };
}
