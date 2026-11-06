import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openKeybox: vi.fn(),
  openSetup: vi.fn(),
}));

vi.mock('./keybox-info-ui.js', () => ({
  openKeyboxInfoPage: mocks.openKeybox,
}));
vi.mock('./setup-info-ui.js', () => ({
  openSetupPage: mocks.openSetup,
}));

import { wireHomeCards } from './home-cards.js';

describe('home cards', () => {
  beforeEach(() => {
    mocks.openKeybox.mockClear();
    mocks.openSetup.mockClear();
    document.body.innerHTML = `
      <button id="keybox-card-hit" type="button">Keybox</button>
      <button id="setup-card-hit" type="button">Setup</button>
    `;
    wireHomeCards();
  });

  it('opens the keybox page from the keybox card', async () => {
    document.getElementById('keybox-card-hit')!.click();
    await vi.waitFor(() => expect(mocks.openKeybox).toHaveBeenCalledTimes(1));
    expect(mocks.openSetup).not.toHaveBeenCalled();
  });

  it('opens the setup page from the setup card', async () => {
    const card = document.getElementById('setup-card-hit')!;
    expect(card.tagName).toBe('BUTTON');
    card.click();
    await vi.waitFor(() => expect(mocks.openSetup).toHaveBeenCalledTimes(1));
    expect(mocks.openKeybox).not.toHaveBeenCalled();
  });
});
