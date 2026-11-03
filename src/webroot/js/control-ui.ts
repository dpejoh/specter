import { wireLazyClick } from './utils.js';

/** Wire the configurable Control rows; safe to call after Tools too. */
export async function wireControlRows(): Promise<void> {
  const [prop, rom, adb, gms, actionSecurityPatch, hma, autoTarget, autoHma, autopif, autokeybox] = await Promise.all([
    import('./prop-handler-ui.js').catch(() => null),
    import('./rom-fingerprint-ui.js').catch(() => null),
    import('./adb-disabler-ui.js').catch(() => null),
    import('./gms-ui.js').catch(() => null),
    import('./action-security-patch-ui.js').catch(() => null),
    import('./hma-ui.js').catch(() => null),
    import('./auto-target-ui.js').catch(() => null),
    import('./auto-hma-ui.js').catch(() => null),
    import('./autopif-ui.js').catch(() => null),
    import('./autokeybox-ui.js').catch(() => null),
  ]);

  prop?.wirePropHandler();
  rom?.wireRomFingerprint();
  adb?.wireAdbDisabler();
  gms?.wireGms();
  actionSecurityPatch?.wireActionSecurityPatch();
  hma?.wireHma();
  autoTarget?.wireAutoTarget();
  autoHma?.wireAutoHma();
  autopif?.wireAutopif();
  autokeybox?.wireAutokeybox();

  wireLazyClick('toggle-boot_hash-row', () => import('./boot-hash-ui.js').then(m => m.openBootHashSubpage()));
}
