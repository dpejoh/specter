import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  escapeHtml, shellEscape, fetchJson,
  setFriendlyNames, getFriendlyNames, getFriendlyName, isDevMode, setDevMode,
  makeRowInteractive, wireRowActivation, wireLazyClick, afterPaint,
  SpecterError, BridgeError, ScriptError, TimeoutError, ConfigError,
} from './utils.js'

function mockFetch(data: unknown, status = 200) {
  globalThis.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify(data), { status }))) as unknown as typeof globalThis.fetch
}

beforeEach(() => {
  document.body.innerHTML = ''
})


describe('escapeHtml', () => {
  it('escapes & < > " and \'', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;')
  })

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('')
  })

  it('passes through safe strings unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world')
  })

  it('coerces non-string input', () => {
    expect(escapeHtml(42 as unknown as string)).toBe('42')
  })
})

describe('shellEscape', () => {
  it('wraps simple string in single quotes', () => {
    expect(shellEscape('hello')).toBe("'hello'")
  })

  it('handles embedded single quotes', () => {
    expect(shellEscape("it's")).toBe("'it'\"'\"'s'")
  })

  it('handles empty string', () => {
    expect(shellEscape('')).toBe("''")
  })
})



describe('fetchJson', () => {
  it('returns null on network error', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network'))) as unknown as typeof globalThis.fetch
    const result = await fetchJson('http://example.com/data.json')
    expect(result).toBeNull()
  })

  it('returns null on non-ok response', async () => {
    mockFetch(null, 404)
    const result = await fetchJson('http://example.com/data.json')
    expect(result).toBeNull()
  })

  it('returns parsed JSON on success', async () => {
    mockFetch({ key: 'value' })
    const result = await fetchJson<{ key: string }>('http://example.com/data.json')
    expect(result).toEqual({ key: 'value' })
  })

  it('caches when ttlMs > 0', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ n: 1 }), { status: 200 })))
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch
    const r1 = await fetchJson('/test-cache.json', 60000)
    expect(r1).toEqual({ n: 1 })
    const r2 = await fetchJson('/test-cache.json', 60000)
    expect(r2).toEqual({ n: 1 })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('friendly names and dev mode', () => {
  it('stores friendly names and falls back to the key', () => {
    setFriendlyNames({ security_patch: 'Security Patch' })
    expect(getFriendlyName('security_patch')).toBe('Security Patch')
    expect(getFriendlyName('unknown_key')).toBe('unknown_key')
    expect(getFriendlyNames().security_patch).toBe('Security Patch')
  })

  it('toggles dev mode', () => {
    setDevMode(true)
    expect(isDevMode()).toBe(true)
    setDevMode(false)
    expect(isDevMode()).toBe(false)
  })
})

describe('error classes', () => {
  it('carry their code, name and message', () => {
    const base = new SpecterError('X_CODE', 'base msg')
    expect(base).toBeInstanceOf(Error)
    expect(base.code).toBe('X_CODE')
    expect(base.name).toBe('SpecterError')

    const bridge = new BridgeError('NO_BRIDGE', 'no-bridge')
    expect(bridge).toBeInstanceOf(SpecterError)
    expect(bridge.name).toBe('BridgeError')

    const script = new ScriptError({ success: false, output: 'o', rawOutput: 'r' })
    expect(script.code).toBe('SCRIPT_ERROR')
    expect(script.message).toBe('Script execution failed')
    expect(script.result).toEqual({ success: false, output: 'o', rawOutput: 'r' })

    const timeout = new TimeoutError()
    expect(timeout.code).toBe('TIMEOUT')
    expect(timeout.message).toBe('Operation timed out')

    const config = new ConfigError('bad config')
    expect(config.code).toBe('CONFIG_ERROR')
    expect(config.message).toBe('bad config')
  })
})

describe('makeRowInteractive', () => {
  it('rejects null, settings rows and native interactive elements', () => {
    expect(makeRowInteractive(null as unknown as HTMLElement)).toBe(false)
    expect(makeRowInteractive(document.createElement('sp-settings-row'))).toBe(false)
    expect(makeRowInteractive(document.createElement('button'))).toBe(false)
    expect(makeRowInteractive(document.createElement('input'))).toBe(false)
  })

  it('rejects rows with a non-button role or their own control', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    expect(makeRowInteractive(dialog)).toBe(false)

    const withSwitch = document.createElement('div')
    withSwitch.innerHTML = '<md-switch></md-switch>'
    expect(makeRowInteractive(withSwitch)).toBe(false)
  })

  it('keeps an existing button role and only adds tabindex when missing', () => {
    const el = document.createElement('div')
    el.setAttribute('role', 'button')
    expect(makeRowInteractive(el)).toBe(true)
    expect(el.tabIndex).toBe(0)

    const preset = document.createElement('div')
    preset.setAttribute('role', 'button')
    preset.setAttribute('tabindex', '3')
    expect(makeRowInteractive(preset)).toBe(true)
    expect(preset.getAttribute('tabindex')).toBe('3')
  })

  it('promotes a plain row to a button', () => {
    const el = document.createElement('div')
    expect(makeRowInteractive(el)).toBe(true)
    expect(el.getAttribute('role')).toBe('button')
    expect(el.tabIndex).toBe(0)
  })
})

describe('wireRowActivation', () => {
  it('activates on click and on Enter/Space for legacy rows', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const activate = vi.fn()
    wireRowActivation(el, activate)
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    expect(activate).toHaveBeenCalledTimes(1)
    el.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    el.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(activate).toHaveBeenCalledTimes(3)
    el.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'x', bubbles: true }))
    expect(activate).toHaveBeenCalledTimes(3)
  })

  it('ignores clicks and keys that land on an embedded switch', () => {
    const el = document.createElement('div')
    el.innerHTML = '<md-switch></md-switch>'
    document.body.appendChild(el)
    const activate = vi.fn()
    // makeRowInteractive leaves the row alone (own control), but the
    // listeners are still wired: the composed-path guard must filter.
    wireRowActivation(el, activate)
    const sw = el.querySelector('md-switch')!
    sw.dispatchEvent(new window.MouseEvent('click', { bubbles: true, composed: true }))
    expect(activate).not.toHaveBeenCalled()
  })

  it('uses sp-activate for settings rows', () => {
    const el = document.createElement('sp-settings-row')
    document.body.appendChild(el)
    const activate = vi.fn()
    wireRowActivation(el, activate)
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    expect(activate).not.toHaveBeenCalled()
    el.dispatchEvent(new window.CustomEvent('sp-activate'))
    expect(activate).toHaveBeenCalledTimes(1)
  })
})

describe('wireLazyClick', () => {
  it('loads once on first activation and wires only once', async () => {
    document.body.innerHTML = '<div id="lazy-row"></div>'
    const load = vi.fn(() => Promise.resolve('ok'))
    wireLazyClick('lazy-row', load)
    wireLazyClick('lazy-row', load)
    const el = document.getElementById('lazy-row')!
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('swallows load failures and ignores missing elements', async () => {
    expect(() => wireLazyClick('no-such-id', () => Promise.resolve())).not.toThrow()
    document.body.innerHTML = '<div id="lazy-fail"></div>'
    const load = vi.fn(() => Promise.reject(new Error('load boom')))
    wireLazyClick('lazy-fail', load)
    document.getElementById('lazy-fail')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    expect(load).toHaveBeenCalledTimes(1)
    await Promise.resolve()
  })
})

describe('afterPaint', () => {
  afterEach(() => { vi.useRealTimers(); delete (window as any).requestIdleCallback })

  it('falls back to a 200ms timeout without requestIdleCallback', () => {
    vi.useFakeTimers()
    delete (window as any).requestIdleCallback
    const fn = vi.fn()
    afterPaint(fn)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('uses requestIdleCallback with the timeout when available', () => {
    const ric = vi.fn((cb: () => void) => { cb(); return 7 })
    ;(window as any).requestIdleCallback = ric
    const fn = vi.fn()
    afterPaint(fn, 900)
    expect(ric).toHaveBeenCalledWith(expect.any(Function), { timeout: 900 })
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
