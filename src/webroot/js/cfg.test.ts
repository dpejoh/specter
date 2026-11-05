import { describe, expect, it, beforeEach, vi } from 'vitest'
import { cfgGet, cfgSet, cfgInit, cfgInvalidate, setDataDir, migrateLocalStorage } from './cfg.js'
import { exec } from './bridge.js'

vi.mock('./bridge.js', () => ({
  exec: vi.fn(() => Promise.resolve({ stdout: '', stderr: '', code: 0 })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  setDataDir('/data/adb/specter')
  cfgInvalidate()
  localStorage.clear()
  delete (window as any).__statePromise
  delete (window as any).__preloadedCfg
})

describe('cfg (caching layer)', () => {
  it('cfgGet returns cached value after cfgSet', async () => {
    cfgSet('test_key', 'test_value')
    const val = await cfgGet('test_key')
    expect(val).toBe('test_value')
  })

  it('cfgSet overwrites existing value', async () => {
    cfgSet('test_key', 'first')
    cfgSet('test_key', 'second')
    const val = await cfgGet('test_key')
    expect(val).toBe('second')
  })

  it('cfgGet returns defaultValue when not cached', async () => {
    const val = await cfgGet('nonexistent', 'default')
    expect(val).toBe('default')
  })

  it('cfgGet returns undefined when key missing and no default', async () => {
    const val = await cfgGet('nonexistent')
    expect(val).toBeUndefined()
  })

  it('cfgInvalidate removes single key', async () => {
    cfgSet('temp', 'value')
    expect(await cfgGet('temp')).toBe('value')
    cfgInvalidate('temp')
    expect(await cfgGet('temp')).toBeUndefined()
  })

  it('cfgInvalidate with no args clears all cache', async () => {
    cfgSet('a', '1')
    cfgSet('b', '2')
    cfgInvalidate()
    expect(await cfgGet('a')).toBeUndefined()
    expect(await cfgGet('b')).toBeUndefined()
  })

  it('prefers the state snapshot when local cache is older', async () => {
    ;(window as any).__statePromise = Promise.resolve({
      config: { theme: 'state', toggle_x: '1' },
      config_ts: 2000,
    })
    localStorage.setItem('sp_cfg_theme', 'local')
    localStorage.setItem('sp_cfg_ts', '1000')

    await cfgInit()

    expect(await cfgGet('theme')).toBe('state')
    expect(await cfgGet('toggle_x')).toBe('1')
  })

  it('prefers a newer local cache over the state snapshot', async () => {
    ;(window as any).__statePromise = Promise.resolve({
      config: { theme: 'state' },
      config_ts: 1000,
    })
    ;(window as any).__preloadedCfg = { theme: 'local' }
    localStorage.setItem('sp_cfg_ts', String(2000 * 1000))

    await cfgInit()

    expect(await cfgGet('theme')).toBe('local')
  })

  it('does not expose the local cache timestamp as a config key', async () => {
    ;(window as any).__statePromise = Promise.resolve({
      config: { theme: 'state' },
      config_ts: 2000,
    })
    localStorage.setItem('sp_cfg_ts', '1000')

    await cfgInit()

    expect(await cfgGet('ts')).toBeUndefined()
  })


  it('serializes rapid writes to the same key', async () => {
    const calls: string[] = []
    vi.mocked(exec).mockImplementation(((cmd: string) => {
      calls.push(cmd)
      return new Promise(resolve => setTimeout(() => resolve({ stdout: '', stderr: '', code: 0 }), 0))
    }) as typeof exec)

    await Promise.all([cfgSet('serial', 'first'), cfgSet('serial', 'second')])

    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain("'first'")
    expect(calls[1]).toContain("'second'")
  })

  it('migrateLocalStorage migrates keys', async () => {
    localStorage.setItem('selectedLanguage', 'en')
    localStorage.setItem('themeMode', 'dark')
    await migrateLocalStorage()
    expect(await cfgGet('lang')).toBe('en')
    expect(await cfgGet('theme')).toBe('dark')
    expect(localStorage.getItem('_cfg_migrated')).toBe('1')
  })

  it('migrateLocalStorage only runs once', async () => {
    localStorage.setItem('selectedLanguage', 'en')
    await migrateLocalStorage()
    localStorage.setItem('selectedLanguage', 'fr')
    await migrateLocalStorage()
    expect(await cfgGet('lang')).toBe('en')
  })
})
