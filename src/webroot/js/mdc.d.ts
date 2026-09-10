interface MdSwitch extends HTMLElement {
  selected: boolean;
  disabled: boolean;
  icons?: boolean;
  label?: string;
}

interface MdDialog extends HTMLElement {
  show(): void;
  close(): void;
  type?: string;
}

interface MdChip extends HTMLElement {
  label: string;
  selected: boolean;
}

interface MdFilterChip extends MdChip {
  icon?: string;
}

interface MdAssistChip extends MdChip {}

interface MdOutlinedTextField extends HTMLElement {
  value: string;
  placeholder: string;
  label?: string;
}

interface MdFilledTextField extends HTMLElement {
  value: string;
  placeholder: string;
}

interface MdMenu extends HTMLElement {
  open: boolean;
  anchor: string;
}

interface MdNavigationTab extends HTMLElement {
  selected: boolean;
}

interface MdFilledButton extends HTMLElement {
  disabled: boolean;
}

interface MdFilledTonalButton extends HTMLElement {
  disabled: boolean;
}

interface MdTextButton extends HTMLElement {
  disabled: boolean;
}

interface MdCircularProgress extends HTMLElement {
  indeterminate: boolean;
}

interface MdOutlinedSegmentedButton extends HTMLElement {
  selected: boolean;
  value: string;
}

interface MdRadio extends HTMLElement {
  checked: boolean;
  value: string;
  name: string;
  disabled: boolean;
}

declare global {
  interface HTMLElementTagNameMap {
    'md-switch': MdSwitch;
    'md-radio': MdRadio;
    'md-dialog': MdDialog;
    'md-chip': MdChip;
    'md-filter-chip': MdFilterChip;
    'md-assist-chip': MdAssistChip;
    'md-outlined-text-field': MdOutlinedTextField;
    'md-filled-text-field': MdFilledTextField;
    'md-menu': MdMenu;
    'md-navigation-tab': MdNavigationTab;
    'md-filled-button': MdFilledButton;
    'md-filled-tonal-button': MdFilledTonalButton;
    'md-text-button': MdTextButton;
    'md-circular-progress': MdCircularProgress;
    'md-outlined-segmented-button': MdOutlinedSegmentedButton;
  }
}
