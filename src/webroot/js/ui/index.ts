/*
 * Specter UI component registry.
 *
 * Importing this module registers the shared components. Import it once during
 * app startup, then use the tags anywhere. Page modules may import individual
 * components, but they should not be the first place a component is defined:
 * defining one upgrades every existing instance and can block navigation.
 *
 * Each component file is self-contained. This file only adds the registry
 * metadata and a single place to load them all.
 */

import './sp-settings-row.js';
import './sp-settings-section.js';
import './sp-tooltip.js';
import './sp-skeleton.js';
import './sp-page-skeleton.js';
import './sp-snackbar.js';

export interface UiComponentDefinition {
  /** Custom-element tag used in markup. */
  tag: string;
  /** Exported class name. */
  name: string;
  /** Source module, relative to this registry. */
  file: string;
  /** Short description used by the docs and gallery. */
  summary: string;
}

/**
 * The component registry. Keep it in sync with the imports above; the registry
 * test fails if a tag is missing or a component is not defined.
 */
export const UI_COMPONENTS = [
  {
    tag: 'sp-settings-row',
    name: 'SpSettingsRow',
    file: './sp-settings-row.js',
    summary: 'Preference row with icon, headline, supporting text, and trailing content.',
  },
  {
    tag: 'sp-settings-section',
    name: 'SpSettingsSection',
    file: './sp-settings-section.js',
    summary: 'Groups rows and recomputes the connected M3 corner treatment.',
  },
  {
    tag: 'sp-tooltip',
    name: 'SpTooltip',
    file: './sp-tooltip.js',
    summary: 'Anchored tooltip that describes a target element.',
  },
  {
    tag: 'sp-skeleton',
    name: 'SpSkeleton',
    file: './sp-skeleton.js',
    summary: 'Single loading placeholder or a skeleton that wraps content.',
  },
  {
    tag: 'sp-page-skeleton',
    name: 'SpPageSkeleton',
    file: './sp-page-skeleton.js',
    summary: 'Page-level loading placeholder composed of section and row shapes.',
  },
  {
    tag: 'sp-snackbar',
    name: 'SpSnackbar',
    file: './sp-snackbar.js',
    summary: 'Material 3 snackbar: a short process update with an optional action and close affordance.',
  },
] as const satisfies readonly UiComponentDefinition[];

export type UiComponentTag = (typeof UI_COMPONENTS)[number]['tag'];

export function getUiComponent(tag: string): UiComponentDefinition | undefined {
  return UI_COMPONENTS.find(component => component.tag === tag);
}

export function isUiComponentDefined(tag: string): boolean {
  return !!customElements.get(tag);
}

/** Throws when a registry entry was imported but never registered. */
export function assertUiComponentsDefined(): void {
  for (const component of UI_COMPONENTS) {
    if (!isUiComponentDefined(component.tag)) {
      throw new Error(`Specter UI: <${component.tag}> is registered but not defined`);
    }
  }
}

export { SpSettingsRow, type SpSettingsRowVariant } from './sp-settings-row.js';
export { SpSettingsSection } from './sp-settings-section.js';
export { SpTooltip, type SpTooltipPosition } from './sp-tooltip.js';
export { SpPageSkeleton } from './sp-page-skeleton.js';
export { SpSnackbar } from './sp-snackbar.js';
export {
  SpSkeleton,
  type SpSkeletonAnimation,
  type SpSkeletonVariant,
} from './sp-skeleton.js';

// Fail fast during startup if a registry entry was added without its component
// definition. The registry test checks the same thing.
assertUiComponentsDefined();
