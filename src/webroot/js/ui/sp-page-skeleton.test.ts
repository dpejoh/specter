import { beforeEach, describe, expect, it } from 'vitest';
import './sp-page-skeleton.js';
import type { SpPageSkeleton } from './sp-page-skeleton.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

function makeSkeleton(): SpPageSkeleton {
  const skeleton = document.createElement('sp-page-skeleton') as SpPageSkeleton;
  document.body.appendChild(skeleton);
  return skeleton;
}

describe('sp-page-skeleton', () => {
  it('renders three sections of three rows by default', async () => {
    const skeleton = makeSkeleton();
    await skeleton.updateComplete;

    const root = skeleton.shadowRoot!;
    expect(root.querySelectorAll('.section').length).toBe(3);
    expect(root.querySelectorAll('.row').length).toBe(9);
    expect(skeleton.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('.skeleton')?.getAttribute('part')).toBe('skeleton');
  });

  it('renders configurable section and row counts', async () => {
    const skeleton = makeSkeleton();
    skeleton.sections = 2;
    skeleton.rows = 1;
    await skeleton.updateComplete;

    const root = skeleton.shadowRoot!;
    expect(root.querySelectorAll('.section').length).toBe(2);
    expect(root.querySelectorAll('.row').length).toBe(2);
  });

  it('clamps counts to at least one', async () => {
    const skeleton = makeSkeleton();
    skeleton.sections = 0;
    skeleton.rows = -2;
    await skeleton.updateComplete;

    const root = skeleton.shadowRoot!;
    expect(root.querySelectorAll('.section').length).toBe(1);
    expect(root.querySelectorAll('.row').length).toBe(1);
  });

  it('clamps counts to at most twelve', async () => {
    const skeleton = makeSkeleton();
    skeleton.sections = 99;
    skeleton.rows = 99;
    await skeleton.updateComplete;

    const root = skeleton.shadowRoot!;
    expect(root.querySelectorAll('.section').length).toBe(12);
    expect(root.querySelectorAll('.row').length).toBe(144);
  });

  it('falls back to the defaults for non-finite counts', async () => {
    const skeleton = makeSkeleton();
    skeleton.sections = Number.NaN;
    skeleton.rows = Number.NaN;
    await skeleton.updateComplete;

    const root = skeleton.shadowRoot!;
    expect(root.querySelectorAll('.section').length).toBe(3);
    expect(root.querySelectorAll('.row').length).toBe(9);
  });

  it('floors fractional counts', async () => {
    const skeleton = makeSkeleton();
    skeleton.sections = 2.9;
    skeleton.rows = 1.9;
    await skeleton.updateComplete;

    const root = skeleton.shadowRoot!;
    expect(root.querySelectorAll('.section').length).toBe(2);
    expect(root.querySelectorAll('.row').length).toBe(2);
  });
});
