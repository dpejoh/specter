import { beforeEach, describe, expect, it } from 'vitest';
import './sp-skeleton.js';
import type { SpSkeleton } from './sp-skeleton.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('sp-skeleton', () => {
  it('defaults to a pulsing text skeleton', async () => {
    const skeleton = document.createElement('sp-skeleton') as SpSkeleton;
    document.body.appendChild(skeleton);
    await skeleton.updateComplete;

    expect(skeleton.variant).toBe('text');
    expect(skeleton.animation).toBe('pulse');
    expect(skeleton.shadowRoot!.querySelector('.shape')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('reflects variant and animation', async () => {
    const skeleton = document.createElement('sp-skeleton') as SpSkeleton;
    skeleton.variant = 'circular';
    skeleton.animation = 'wave';
    document.body.appendChild(skeleton);
    await skeleton.updateComplete;

    expect(skeleton.getAttribute('variant')).toBe('circular');
    expect(skeleton.getAttribute('animation')).toBe('wave');
  });

  it('marks slotted content busy until loaded', async () => {
    const skeleton = document.createElement('sp-skeleton') as SpSkeleton;
    const content = document.createElement('p');
    content.textContent = 'Loaded content';
    skeleton.appendChild(content);
    document.body.appendChild(skeleton);
    await skeleton.updateComplete;
    await tick();

    expect(skeleton.hasContent).toBe(true);
    expect(skeleton.hasAttribute('has-content')).toBe(true);
    expect(skeleton.hasAttribute('aria-busy')).toBe(true);

    skeleton.loaded = true;
    await skeleton.updateComplete;
    expect(skeleton.hasAttribute('loaded')).toBe(true);
    expect(skeleton.hasAttribute('aria-busy')).toBe(false);
  });
});
