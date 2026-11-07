import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { UI_COMPONENTS, getUiComponent, isUiComponentDefined } from './index.js';

describe('ui registry', () => {
  it('defines every registered component', () => {
    for (const component of UI_COMPONENTS) {
      expect(customElements.get(component.tag), component.tag).toBeTruthy();
      expect(isUiComponentDefined(component.tag), component.tag).toBe(true);
    }
  });

  it('uses unique tags and source files', () => {
    const tags = UI_COMPONENTS.map(component => component.tag);
    const files = UI_COMPONENTS.map(component => component.file);

    expect(new Set(tags).size).toBe(tags.length);
    expect(new Set(files).size).toBe(files.length);
  });

  it('ships a source file and a test file for every component', () => {
    for (const component of UI_COMPONENTS) {
      const source = component.file.replace(/\.js$/, '.ts');
      expect(existsSync(resolve(__dirname, source)), source).toBe(true);
      expect(existsSync(resolve(__dirname, source.replace(/\.ts$/, '.test.ts'))), source).toBe(true);
    }
  });

  it('registers every sp- tag used by the main document', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
    const used = new Set(
      Array.from(html.matchAll(/<(sp-[a-z0-9-]+)/g), match => match[1] as string),
    );

    for (const tag of used) {
      expect(getUiComponent(tag), tag).toBeDefined();
    }
  });
});
