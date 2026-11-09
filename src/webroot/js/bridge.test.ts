import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import { initBridge, exec, runScript, getModuleDir, getDataDir, getPackagesInfo } from './bridge.js'
import type { KsuBridge } from './types.js'

function mockKsu(overrides?: Partial<KsuBridge>) {
  const mock: KsuBridge = {
    exec: vi.fn((_cmd, _opts, _cb) => {}),
    spawn: vi.fn((_cmd, _args, _opts, _name) => {}),
    ...overrides,
  }
  Object.defineProperty(window, 'ksu', { value: mock, configurable: true, writable: true })
  return mock
}

function mockFetchJson(data: unknown) {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
  ) as unknown as typeof globalThis.fetch
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  delete (window as any).ksu
  vi.restoreAllMocks()
})

describe('initBridge', () => {
  it('fetches module_paths.json and sets MODULE', async () => {
    mockKsu()
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await initBridge()
    expect(globalThis.fetch).toHaveBeenCalledWith('/json/module_paths.json')
  })

  it('returns SPECTER_DIR from getDataDir', async () => {
    mockKsu()
    mockFetchJson({ MODDIR: '/data/adb/modules/specter', SPECTER_DIR: '/data/adb/specter' })
    await initBridge()
    expect(getDataDir()).toBe('/data/adb/specter')
  })

  it('expands modules_update to modules in the path', async () => {
    mockKsu()
    mockFetchJson({ MODDIR: '/data/adb/modules_update/specter' })
    await initBridge()
    expect(getModuleDir()).toBe('/data/adb/modules/specter')
  })

  it('throws when no module path can be determined', async () => {
    mockKsu()
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('fetch fail'))) as unknown as typeof globalThis.fetch
    Object.defineProperty(document, 'currentScript', { value: null, configurable: true })
    await expect(initBridge()).rejects.toThrow('Cannot determine module path')
  })
})

describe('exec', () => {
  it('rejects with typed error when no bridge is available', async () => {
    delete (window as any).ksu
    await expect(exec('echo hi')).rejects.toThrow('no-bridge')
  })

  it('invokes window.ksu.exec with the command', async () => {
    const ksu = mockKsu()
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await initBridge()
    exec('echo hello')
    expect(ksu.exec).toHaveBeenCalledWith(
      'echo hello',
      '{}',
      expect.stringMatching(/^__sp_/)
    )
  })

  it('resolves with stdout when callback fires synchronously', async () => {
    mockKsu({
      exec(_cmd, _opts, cbName) {
        const cb = (window as any)[cbName]
        cb(0, 'output text', '')
      },
    })
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await initBridge()
    const result = await exec('test-cmd')
    expect(result).toEqual({ code: 0, stdout: 'output text', stderr: '' })
  })

  it('resolves with parsed JSON when callback receives a JSON string', async () => {
    mockKsu({
      exec(_cmd, _opts, cbName) {
        const cb = (window as any)[cbName]
        cb(JSON.stringify({ result: 'parsed_value', stderr: '' }))
      },
    })
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await initBridge()
    const result = await exec('json-cmd')
    expect(result.stdout).toBe('parsed_value')
  })
})

describe('runScript', () => {
  it('rejects when no bridge', async () => {
    delete (window as any).ksu
    await expect(runScript('test.sh')).rejects.toThrow('no-bridge')
  })

  it('invokes ksu.exec with sh script path', async () => {
    const ksu = mockKsu()
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await initBridge()
    runScript('test.sh', 'feature')
    expect(ksu.exec).toHaveBeenCalledWith(
      "sh '/data/adb/modules/specter/features/test.sh'",
      '{}',
      expect.stringMatching(/^__sp_/)
    )
  })

  it('resolves with success on zero exit code', async () => {
    mockKsu({
      exec(_cmd, _opts, cbName) {
        const cb = (window as any)[cbName]
        cb(0, 'done', '')
      },
    })
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await initBridge()
    const result = await runScript('ok.sh')
    expect(result).toEqual({ success: true, output: 'done', rawOutput: 'done' })
  })

  it('resolves with failure on non-zero exit code', async () => {
    mockKsu({
      exec(_cmd, _opts, cbName) {
        const cb = (window as any)[cbName]
        cb(1, 'fail output', 'stderr here')
      },
    })
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await initBridge()
    const result = await runScript('fail.sh')
    expect(result.success).toBe(false)
    expect(result.output).toBe('fail output')
  })

  it('rejects on JSON script error', async () => {
    mockKsu({
      exec(_cmd, _opts, cbName) {
        const cb = (window as any)[cbName]
        cb(JSON.stringify({ success: false, stdout: 'error from script' }))
      },
    })
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await initBridge()
    await expect(runScript('fail-json.sh')).rejects.toThrow('Script execution failed')
  })

  it('resolves on a JSON string result with success', async () => {
    mockKsu({
      exec(_cmd, _opts, cbName) {
        ;(window as any)[cbName](JSON.stringify({ success: true, result: 'json-out' }))
      },
    })
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await initBridge()
    const result = await runScript('ok-json.sh')
    expect(result).toEqual({ success: true, output: 'json-out', rawOutput: JSON.stringify({ success: true, result: 'json-out' }) })
  })

  it('resolves as failure on a non-JSON string result', async () => {
    mockKsu({
      exec(_cmd, _opts, cbName) {
        ;(window as any)[cbName]('plain failure text')
      },
    })
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await initBridge()
    const result = await runScript('plain.sh')
    expect(result).toEqual({ success: false, output: 'plain failure text', rawOutput: 'plain failure text' })
  })

  it('resolves as failure on an empty callback value', async () => {
    mockKsu({
      exec(_cmd, _opts, cbName) {
        ;(window as any)[cbName](undefined)
      },
    })
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await initBridge()
    const result = await runScript('empty.sh')
    expect(result).toEqual({ success: false, output: '', rawOutput: '' })
  })

  it('rejects when ksu.exec throws synchronously', async () => {
    mockKsu({ exec: vi.fn(() => { throw new Error('exec boom') }) })
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await initBridge()
    await expect(runScript('throw.sh')).rejects.toThrow('exec boom')
  })

  it('rejects with a timeout when the callback never fires', async () => {
    mockKsu()
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await initBridge()
    const p = runScript('hang.sh')
    const assertion = expect(p).rejects.toThrow('Operation timed out')
    vi.advanceTimersByTime(60000)
    await assertion
  })
})

describe('initBridge preloaded promise', () => {
  afterEach(() => { delete (window as any).__modulePathsPromise })

  it('uses the preloaded module paths and expands modules_update', async () => {
    mockKsu()
    ;(window as any).__modulePathsPromise = Promise.resolve({ MODDIR: '/data/adb/modules_update/specter', SPECTER_DIR: '/data/adb/specter' })
    globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch
    await initBridge()
    expect(getModuleDir()).toBe('/data/adb/modules/specter')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('falls back to fetch when the preload has no MODDIR', async () => {
    mockKsu()
    ;(window as any).__modulePathsPromise = Promise.resolve({ nope: true })
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await initBridge()
    expect(globalThis.fetch).toHaveBeenCalledWith('/json/module_paths.json')
    expect(getModuleDir()).toBe('/data/adb/modules/specter')
  })

  it('falls back to fetch when the preload rejects', async () => {
    mockKsu()
    ;(window as any).__modulePathsPromise = Promise.reject(new Error('preload fail'))
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await initBridge()
    expect(getModuleDir()).toBe('/data/adb/modules/specter')
  })
})

describe('getPackagesInfo', () => {
  it('returns null when the bridge has no getPackagesInfo', () => {
    mockKsu()
    expect(getPackagesInfo(['com.example'])).toBeNull()
  })

  it('parses the JSON the bridge returns', () => {
    const ksu = mockKsu()
    const fn = vi.fn(() => JSON.stringify([{ packageName: 'com.a', appLabel: 'A' }]))
    ;(ksu as any).getPackagesInfo = fn
    expect(getPackagesInfo(['com.a'])).toEqual([{ packageName: 'com.a', appLabel: 'A' }])
    expect(fn).toHaveBeenCalledWith('["com.a"]')
  })

  it('returns null when the bridge throws or returns bad JSON', () => {
    const ksu = mockKsu()
    ;(ksu as any).getPackagesInfo = vi.fn(() => { throw new Error('nope') })
    expect(getPackagesInfo(['com.a'])).toBeNull()
    ;(ksu as any).getPackagesInfo = vi.fn(() => 'not json')
    expect(getPackagesInfo(['com.a'])).toBeNull()
  })
})

describe('exec result shapes', () => {
  beforeEach(async () => {
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await initBridge()
  })

  it('reads code/stdout/stderr from a JSON string result', async () => {
    mockKsu({
      exec(_cmd, _opts, cbName) {
        ;(window as any)[cbName](JSON.stringify({ code: 3, stdout: 'o', stderr: 'e' }))
      },
    })
    await expect(exec('x')).resolves.toEqual({ code: 3, stdout: 'o', stderr: 'e' })
  })

  it('maps a JSON failure without a code to exit code 1', async () => {
    mockKsu({
      exec(_cmd, _opts, cbName) {
        ;(window as any)[cbName](JSON.stringify({ success: false, error: 'boom' }))
      },
    })
    await expect(exec('x')).resolves.toEqual({ code: 1, stdout: '', stderr: 'boom' })
  })

  it('treats a non-JSON string as raw stdout with code -1', async () => {
    mockKsu({
      exec(_cmd, _opts, cbName) {
        ;(window as any)[cbName]('raw text')
      },
    })
    await expect(exec('x')).resolves.toEqual({ code: -1, stdout: 'raw text', stderr: '' })
  })

  it('returns code -1 and empty streams on an empty callback value', async () => {
    mockKsu({
      exec(_cmd, _opts, cbName) {
        ;(window as any)[cbName](undefined)
      },
    })
    await expect(exec('x')).resolves.toEqual({ code: -1, stdout: '', stderr: '' })
  })

  it('blanks non-string stdout/stderr on a numeric result', async () => {
    mockKsu({
      exec(_cmd, _opts, cbName) {
        ;(window as any)[cbName](0, 42, null)
      },
    })
    await expect(exec('x')).resolves.toEqual({ code: 0, stdout: '', stderr: '' })
  })

  it('rejects when ksu.exec throws synchronously', async () => {
    mockKsu({ exec: vi.fn(() => { throw new Error('exec boom') }) })
    await expect(exec('x')).rejects.toThrow('exec boom')
  })

  it('times out and removes the global callback', async () => {
    const ksu = mockKsu()
    const p = exec('hang')
    const assertion = expect(p).rejects.toThrow('Operation timed out')
    const cbName = (ksu.exec as any).mock.calls[0][2] as string
    expect(typeof (window as any)[cbName]).toBe('function')
    vi.advanceTimersByTime(60000)
    await assertion
    expect((window as any)[cbName]).toBeUndefined()
  })
})

describe('spawnScript', () => {
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }

  async function freshBridge() {
    vi.resetModules()
    return import('./bridge.js')
  }

  it('reports null dirs before init', async () => {
    const b = await freshBridge()
    expect(b.getModuleDir()).toBeNull()
    expect(b.getDataDir()).toBeNull()
  })

  it('emits NO_BRIDGE error without a bridge', async () => {
    const b = await freshBridge()
    delete (window as any).ksu
    const child = b.spawnScript('x.sh')
    const err = vi.fn()
    child.on('error', err)
    vi.advanceTimersByTime(1)
    expect(err).toHaveBeenCalledTimes(1)
    expect((err.mock.calls[0]![0] as Error).message).toBe('no-bridge')
  })

  it('emits NO_MODULE error when the module path is unknown', async () => {
    const b = await freshBridge()
    mockKsu()
    const child = b.spawnScript('x.sh')
    const err = vi.fn()
    child.on('error', err)
    vi.advanceTimersByTime(1)
    expect((err.mock.calls[0]![0] as Error).message).toBe('no-module-path')
  })

  it('uses ksu.spawn, wires the child streams and cleans up on exit', async () => {
    const b = await freshBridge()
    const ksu = mockKsu()
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await b.initBridge()
    const child = b.spawnScript('run.sh', 'feature', ['--flag'])
    expect(ksu.spawn).toHaveBeenCalledWith(
      'sh',
      JSON.stringify(['/data/adb/modules/specter/features/run.sh', '--flag']),
      '{}',
      expect.stringMatching(/^__sp_/)
    )
    const globalName = (ksu.spawn as any).mock.calls[0][3] as string
    expect((window as any)[globalName]).toBe(child)

    const out = vi.fn(); const exit = vi.fn()
    child.stdout.on('data', out)
    child.on('exit', exit)
    child.stdout.emit('data', 'line1')
    expect(out).toHaveBeenCalledWith('line1')
    // Non-'data' events and unknown event names are ignored.
    child.stdout.on('close' as any, out)
    child.on('bogus-event', exit)
    ;(child as any).emit('exit', 0)
    expect(exit).toHaveBeenCalledWith(0)
    expect((window as any)[globalName]).toBeUndefined()
  })

  it('emits the thrown error when ksu.spawn throws', async () => {
    const b = await freshBridge()
    mockKsu({ spawn: vi.fn(() => { throw new Error('spawn boom') }) })
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await b.initBridge()
    const child = b.spawnScript('run.sh')
    const err = vi.fn()
    child.on('error', err)
    vi.advanceTimersByTime(1)
    expect((err.mock.calls[0]![0] as Error).message).toBe('spawn boom')
  })

  it('emits a timeout error when a spawn never exits', async () => {
    const b = await freshBridge()
    mockKsu()
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await b.initBridge()
    const child = b.spawnScript('hang.sh')
    const err = vi.fn()
    child.on('error', err)
    vi.advanceTimersByTime(60000)
    expect(err).toHaveBeenCalledTimes(1)
    expect((err.mock.calls[0]![0] as Error).message).toBe('Operation timed out')
  })

  it('falls back to exec when ksu.spawn is unavailable', async () => {
    const b = await freshBridge()
    mockKsu({
      spawn: undefined as any,
      exec(_cmd, _opts, cbName) {
        ;(window as any)[cbName](0, 'l1\nl2\n', 'e1\n')
      },
    })
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await b.initBridge()
    const child = b.spawnScript('run.sh', 'feature', ['a b'])
    const out: string[] = []; const errOut: string[] = []; const exit = vi.fn()
    child.stdout.on('data', d => out.push(d))
    child.stderr.on('data', d => errOut.push(d))
    child.on('exit', exit)
    await flush()
    expect(out).toEqual(['l1', 'l2'])
    expect(errOut).toEqual(['e1'])
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('fallback emits error when exec throws', async () => {
    const b = await freshBridge()
    mockKsu({
      spawn: undefined as any,
      exec: vi.fn(() => { throw new Error('exec boom') }),
    })
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await b.initBridge()
    const child = b.spawnScript('run.sh')
    const err = vi.fn()
    child.on('error', err)
    await flush()
    expect((err.mock.calls[0]![0] as Error).message).toBe('exec boom')
  })

  it('fallback emits a timeout error when exec never answers', async () => {
    const b = await freshBridge()
    mockKsu({ spawn: undefined as any })
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await b.initBridge()
    const child = b.spawnScript('hang.sh')
    const err = vi.fn()
    child.on('error', err)
    vi.advanceTimersByTime(60000)
    await flush()
    expect(err).toHaveBeenCalled()
    expect((err.mock.calls[0]![0] as Error).message).toBe('Operation timed out')
  })
})

describe('spawnCommand', () => {
  async function freshBridge() {
    vi.resetModules()
    return import('./bridge.js')
  }

  it('uses ksu.spawn with command directly and collects stdout on exit', async () => {
    const b = await freshBridge()
    const ksu = mockKsu()
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await b.initBridge()

    const promise = b.spawnCommand('echo hello')
    expect(ksu.spawn).toHaveBeenCalledWith(
      'echo hello',
      '[]',
      '{}',
      expect.stringMatching(/^__sp_/)
    )
    const globalName = (ksu.spawn as any).mock.calls[0][3] as string
    const child = (window as any)[globalName]
    expect(child).toBeDefined()

    child.stdout.emit('data', 'hello')
    child.emit('exit', 0)

    const res = await promise
    expect(res).toEqual({ code: 0, stdout: 'hello', stderr: '' })
    expect((window as any)[globalName]).toBeUndefined()
  })

  it('falls back to exec when ksu.spawn is not available', async () => {
    const b = await freshBridge()
    mockKsu({
      spawn: undefined as any,
      exec(_cmd: string, _opts: string, cbName: string) {
        ;(window as any)[cbName]?.(0, 'fallback out', '')
      },
    })
    mockFetchJson({ MODDIR: '/data/adb/modules/specter' })
    await b.initBridge()

    const res = await b.spawnCommand('echo fallback')
    expect(res).toEqual({ code: 0, stdout: 'fallback out', stderr: '' })
  })
})

