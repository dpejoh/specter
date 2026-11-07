import '@material/web/icon/icon.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/labs/card/filled-card.js';
import '@material/web/progress/circular-progress.js';
import '@material/web/dialog/dialog.js';
import '@material/web/button/text-button.js';
// Components used by self-contained dialogs (confirm/reset/OMK) must be
// registered regardless of which page the user visited first.
import '@material/web/button/filled-button.js';
import '@material/web/button/filled-tonal-button.js';
import '@material/web/textfield/outlined-text-field.js';
import '@material/web/ripple/ripple.js';
import '@material/web/switch/switch.js';

// Register the shared Specter UI components during startup. Page modules use
// the tags, but they should not be the first place a component is defined;
// otherwise the first navigation pays for upgrading every existing instance.
import './ui/index.js';

import {styles as typescaleStyles} from '@material/web/typography/md-typescale-styles.js';
if (typescaleStyles.styleSheet) document.adoptedStyleSheets.push(typescaleStyles.styleSheet);
