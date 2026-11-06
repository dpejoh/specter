function wireCard(id: string, load: () => Promise<unknown>): void {
  const el = document.getElementById(id) as HTMLButtonElement | null;
  if (!el || el.dataset.spWired) return;
  el.dataset.spWired = '1';
  el.addEventListener('click', () => { load().catch(() => {}); });
}

/** Wire the two read-only home status cards to their detail pages. */
export function wireHomeCards() {
  wireCard('keybox-card-hit', () =>
    import('./keybox-info-ui.js').then(m => m.openKeyboxInfoPage()),
  );
  wireCard('setup-card-hit', () =>
    import('./setup-info-ui.js').then(m => m.openSetupPage()),
  );
}
