/*
 * Specter UI — experimental component kit.
 *
 * Importing this module registers the components. Keep each component file
 * independently copyable; this barrel is only a convenience entry point.
 */

import './sp-settings-row.js';
import './sp-settings-section.js';
import './sp-tooltip.js';
import './sp-skeleton.js';

export { SpSettingsRow, type SpSettingsRowVariant } from './sp-settings-row.js';
export { SpSettingsSection } from './sp-settings-section.js';
export { SpTooltip, type SpTooltipPosition } from './sp-tooltip.js';
export {
  SpSkeleton,
  type SpSkeletonAnimation,
  type SpSkeletonVariant,
} from './sp-skeleton.js';
