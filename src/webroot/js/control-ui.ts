import { wireRowDialog } from './toggles.js';

/** Wire the configurable Control rows; safe to call after Tools too. */
export async function wireControlRows(): Promise<void> {
  const [prop, rom, adb, gms, actionSecurityPatch, actionKeybox, actionTarget, hma, autoTarget, autoHma, autopif, keyboxWatch] = await Promise.all([
    import('./prop-handler-ui.js').catch(() => null),
    import('./rom-fingerprint-ui.js').catch(() => null),
    import('./adb-disabler-ui.js').catch(() => null),
    import('./gms-ui.js').catch(() => null),
    import('./action-security-patch-ui.js').catch(() => null),
    import('./action-keybox-ui.js').catch(() => null),
    import('./action-target-ui.js').catch(() => null),
    import('./hma-ui.js').catch(() => null),
    import('./auto-target-ui.js').catch(() => null),
    import('./auto-hma-ui.js').catch(() => null),
    import('./autopif-ui.js').catch(() => null),
    import('./keybox-watch-ui.js').catch(() => null),
  ]);

  prop?.wirePropHandler();
  rom?.wireRomFingerprint();
  adb?.wireAdbDisabler();
  gms?.wireGms();
  actionSecurityPatch?.wireActionSecurityPatch();
  actionKeybox?.wireActionKeybox();
  actionTarget?.wireActionTarget();
  hma?.wireHma();
  autoTarget?.wireAutoTarget();
  autoHma?.wireAutoHma();
  autopif?.wireAutopif();
  keyboxWatch?.wireKeyboxWatch();

  wireRowDialog('toggle-boot_hash-row', () => {
    void import('./boot-hash-ui.js').then(m => m.openBootHashSubpage());
  });
}
