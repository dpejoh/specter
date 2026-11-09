import { describe, expect, it } from 'vitest';
import {
  BLACKLIST_VISUALS,
  filterAndSortApps,
  nextCyclic,
  parsePlainList,
  parseSuffixedList,
  pruneBlacklistedLines,
  serializePlainSelection,
  serializeSuffixedSelection,
  type AppListEntry,
} from './app-list-model.js';

const app = (packageName: string, appName: string, state: string): AppListEntry => ({
  packageName,
  appName,
  state,
});

describe('app list model', () => {
  describe('target list parsing', () => {
    it('parses suffixes when per-app modes are enabled', () => {
      const map = parseSuffixedList('com.a!\ncom.b?\ncom.c\n', true);
      expect([...map]).toEqual([
        ['com.a', 'force'],
        ['com.b', 'conditional'],
        ['com.c', 'bare'],
      ]);
    });

    it('ignores suffixes and strips them when per-app modes are disabled', () => {
      const map = parseSuffixedList('com.a!\ncom.b?\ncom.c\n', false);
      expect([...map]).toEqual([
        ['com.a', 'bare'],
        ['com.b', 'bare'],
        ['com.c', 'bare'],
      ]);
    });

    it('skips blank lines and duplicates resolve to the last entry', () => {
      const map = parseSuffixedList('\n com.a \n\ncom.a?\n', true);
      expect(map.get('com.a')).toBe('conditional');
      expect(map.size).toBe(1);
    });
  });

  describe('target list serialization', () => {
    it('writes suffixes for selected modes and sorts packages', () => {
      const content = serializeSuffixedSelection([
        app('com.c', 'C', 'bare'),
        app('com.a', 'A', 'force'),
        app('com.b', 'B', 'conditional'),
        app('com.d', 'D', 'unchecked'),
      ], true);
      expect(content).toBe('com.a!\ncom.b?\ncom.c');
    });

    it('writes plain package names when per-app modes are disabled', () => {
      const content = serializeSuffixedSelection([
        app('com.a', 'A', 'force'),
        app('com.b', 'B', 'conditional'),
      ], false);
      expect(content).toBe('com.a\ncom.b');
    });
  });

  describe('plain list parsing and serialization', () => {
    it('marks every non-empty line as targeted', () => {
      expect([...parsePlainList('com.a\n\ncom.b\n')]).toEqual([
        ['com.a', 'targeted'],
        ['com.b', 'targeted'],
      ]);
    });

    it('serializes only the selected state', () => {
      const content = serializePlainSelection([
        app('com.c', 'C', 'targeted'),
        app('com.a', 'A', 'targeted'),
        app('com.b', 'B', 'unchecked'),
      ], 'targeted');
      expect(content).toBe('com.a\ncom.c');
    });
  });

  describe('pruning', () => {
    it('prunes with an identity line mapper', () => {
      const result = pruneBlacklistedLines('com.a\ncom.b\ncom.c\n', new Set(['com.b']), l => l);
      expect(result).toEqual({ content: 'com.a\ncom.c', removed: 1 });
    });

    it('prunes target lines by suffix-stripped package', () => {
      const result = pruneBlacklistedLines('com.a!\ncom.b?\ncom.c\n', new Set(['com.a', 'com.b']), l => l.replace(/[!?]$/, ''));
      expect(result).toEqual({ content: 'com.c', removed: 2 });
    });

    it('leaves content and count unchanged when nothing matches', () => {
      const result = pruneBlacklistedLines('com.a\ncom.b\n', new Set(['com.c']), l => l);
      expect(result).toEqual({ content: 'com.a\ncom.b', removed: 0 });
    });
  });

  describe('filtering and sorting', () => {
    const apps = [
      app('com.a.app', 'Alpha', 'force'),
      app('com.b.app', 'Bravo', 'unchecked'),
      app('com.c.app', 'Charlie', 'bare'),
      app('com.sys.one', 'System One', 'unchecked'),
    ];

    const base = {
      search: '',
      selection: 'all' as const,
      mode: 'primary' as const,
      showSystemApps: true,
      systemPackages: [] as string[],
      modeFilter: null,
    };

    it('matches search on package or app name case-insensitively', () => {
      expect(filterAndSortApps(apps, { ...base, search: 'alpha' }).map(a => a.packageName))
        .toEqual(['com.a.app']);
      expect(filterAndSortApps(apps, { ...base, search: 'COM.C' }).map(a => a.packageName))
        .toEqual(['com.c.app']);
    });

    it('filters selected and not selected in primary mode', () => {
      expect(filterAndSortApps(apps, { ...base, selection: 'selected' }).map(a => a.packageName))
        .toEqual(['com.a.app', 'com.c.app']);
      expect(filterAndSortApps(apps, { ...base, selection: 'not_selected' }).map(a => a.packageName))
        .toEqual(['com.b.app', 'com.sys.one']);
    });

    it('filters selected by blacklisted state in blacklist mode', () => {
      const blacklistApps = [
        app('com.a.app', 'Alpha', 'blacklisted'),
        app('com.b.app', 'Bravo', 'unchecked'),
      ];
      expect(filterAndSortApps(blacklistApps, {
        ...base,
        mode: 'blacklist',
        selection: 'selected',
      }).map(a => a.packageName)).toEqual(['com.a.app']);
      expect(filterAndSortApps(blacklistApps, {
        ...base,
        mode: 'blacklist',
        selection: 'not_selected',
      }).map(a => a.packageName)).toEqual(['com.b.app']);
    });

    it('applies the secondary mode filter only in primary mode', () => {
      expect(filterAndSortApps(apps, { ...base, modeFilter: 'bare' }).map(a => a.packageName))
        .toEqual(['com.c.app']);
      expect(filterAndSortApps(apps, {
        ...base,
        mode: 'blacklist',
        modeFilter: 'bare',
      }).map(a => a.packageName)).toEqual(['com.a.app', 'com.c.app', 'com.b.app', 'com.sys.one']);
    });

    it('hides unselected system apps but keeps selected ones visible', () => {
      const systemApps = [
        ...apps.slice(0, 3),
        app('com.sys.one', 'System One', 'unchecked'),
        app('com.sys.two', 'System Two', 'bare'),
      ];
      const filters = {
        ...base,
        showSystemApps: false,
        systemPackages: ['com.sys.one', 'com.sys.two'],
      };
      expect(filterAndSortApps(systemApps, filters).map(a => a.packageName))
        .toEqual(['com.a.app', 'com.c.app', 'com.sys.two', 'com.b.app']);
    });

    it('sorts selected apps before unselected apps, then by label', () => {
      const sorted = filterAndSortApps([
        app('com.z', 'Zulu', 'unchecked'),
        app('com.b', 'Bravo', 'bare'),
        app('com.a', 'Alpha', 'unchecked'),
        app('com.c', 'Charlie', 'bare'),
      ], base);
      expect(sorted.map(a => a.appName)).toEqual(['Bravo', 'Charlie', 'Alpha', 'Zulu']);
    });
  });

  describe('cycle helper', () => {
    it('wraps around and handles an unknown current value', () => {
      const order = ['bare', 'conditional', 'force'] as const;
      expect(nextCyclic(order, 'bare')).toBe('conditional');
      expect(nextCyclic(order, 'force')).toBe('bare');
      expect(nextCyclic(order, 'nope' as never)).toBe('bare');
      expect(nextCyclic([], 'x')).toBeUndefined();
    });
  });

  it('defines the shared blacklist visuals', () => {
    expect(BLACKLIST_VISUALS.unchecked?.labelKey).toBe('bl_state_not_blacklisted');
    expect(BLACKLIST_VISUALS.blacklisted?.icon).toBe('block');
  });
});
