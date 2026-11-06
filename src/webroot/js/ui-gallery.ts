import '@material/web/icon/icon.js';
import '@material/web/switch/switch.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/button/filled-button.js';
import '@material/web/button/filled-tonal-button.js';
import '@material/web/button/text-button.js';

import './ui/index.js';
import type { SpSettingsRow } from './ui/sp-settings-row.js';
import type { SpSkeleton } from './ui/sp-skeleton.js';

const hiddenRow = document.querySelector('#hidden-row') as SpSettingsRow | null;
const actionRow = document.querySelector('#action-row') as SpSettingsRow | null;
const skeleton = document.querySelector('#content-skeleton') as SpSkeleton | null;

document.querySelector('#toggle-hidden')?.addEventListener('click', () => {
  if (hiddenRow) hiddenRow.hidden = !hiddenRow.hidden;
});

document.querySelector('#toggle-loading')?.addEventListener('click', () => {
  if (actionRow) actionRow.loading = !actionRow.loading;
});

document.querySelector('#toggle-loaded')?.addEventListener('click', () => {
  if (skeleton) skeleton.loaded = !skeleton.loaded;
});
