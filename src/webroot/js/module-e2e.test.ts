import { describe, expect, it, beforeAll } from 'vitest'
import { execSync } from 'child_process'
import { readFileSync, existsSync, statSync } from 'fs'
import { resolve } from 'path'

const PROJECT_ROOT = resolve(__dirname, '../../..')
const MODULE_DIR = resolve(PROJECT_ROOT, 'Module')

let files: string[]
let moduleProp: string

beforeAll(() => {
  try {
    execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'pipe', timeout: 60000 })
  } catch (e: any) {
    throw new Error(`Build failed: ${e.stderr?.toString() || e.message}`)
  }
  const out = execSync('find . -type f | sort', { cwd: MODULE_DIR, encoding: 'utf8', timeout: 10000 })
  files = out.trim().split('\n').filter(Boolean)
  moduleProp = readFileSync(`${MODULE_DIR}/module.prop`, 'utf8')
})

describe('module.zip structure', () => {
  it('build creates the Module directory', () => {
    expect(existsSync(MODULE_DIR)).toBe(true)
  })

  it('zip archive exists', () => {
    const zips = execSync('ls -1 *.zip 2>/dev/null || true', { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 5000 }).trim()
    expect(zips.length).toBeGreaterThan(0)
  })
})

describe('module.prop', () => {
  it('has required fields', () => {
    expect(moduleProp).toContain('id=specter')
    expect(moduleProp).toContain('version=')
    expect(moduleProp).toContain('versionCode=')
    expect(moduleProp).toContain('author=')
    expect(moduleProp).toContain('description=')
  })

  it('versionCode is numeric', () => {
    const vc = moduleProp.match(/versionCode=(\d+)/)
    expect(vc).not.toBeNull()
    expect(Number(vc![1])).toBeGreaterThan(0)
  })

  it('versionCode matches update.json', () => {
    const updateJson = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'update.json'), 'utf8'))
    const vc = moduleProp.match(/versionCode=(\d+)/)![1]
    expect(Number(vc)).toBe(updateJson.versionCode)
  })
})

describe('required files', () => {
  const REQUIRED = [
    'module.prop',
    'META-INF/com/google/android/update-binary',
    'META-INF/com/google/android/updater-script',
    'customize.sh',
    'action.sh',
    'service.sh',
    'post-fs-data.sh',
    'uninstall.sh',
    'refresh_desc.sh',
    'lib/common.sh',
    'features/keybox.sh',
    'features/gms.sh',
    'features/boot_hardening.sh',
    'features/boot_hash.sh',
    'features/adb_disabler.sh',
    'features/tee.sh',
    'webroot/index.html',
    'webroot/config.json',
    'webroot/json/module_paths.json',
    'webroot/json/dev.json',
  ]

  it('all required files exist in Module', () => {
    const missing = REQUIRED.filter(f => !existsSync(`${MODULE_DIR}/${f}`))
    expect(missing).toEqual([])
  })
})

describe('shell scripts', () => {
  let shFiles: string[]

  beforeAll(() => {
    shFiles = files.filter(f => f.endsWith('.sh'))
  })

  it('entry .sh files are executable', () => {
    expect(shFiles.length).toBeGreaterThan(0)
    const nonExec = shFiles.filter(f => !(statSync(`${MODULE_DIR}/${f}`).mode & 0o111))
      .filter(f => !['lib/', 'webroot/common/'].some(p => f.includes(p)))
    expect(nonExec).toEqual([])
  })

  it('entry .sh files have shebang', () => {
    const skipPatterns = ['lib/', 'webroot/common/', './customize.sh']
    const noShebang = shFiles.filter(f => {
      const first = readFileSync(`${MODULE_DIR}/${f}`, 'utf8').trimStart().slice(0, 2)
      return first !== '#!'
    }).filter(f => !skipPatterns.some(p => f.includes(p)))
    expect(noShebang).toEqual([])
  })
})

describe('JSON files', () => {
  it('known JSON files are valid', () => {
    const known = ['webroot/json/module_paths.json', 'webroot/json/dev.json', 'webroot/config.json']
    for (const f of known) {
      expect(existsSync(`${MODULE_DIR}/${f}`)).toBe(true)
      expect(() => JSON.parse(readFileSync(`${MODULE_DIR}/${f}`, 'utf8'))).not.toThrow()
    }
  })
})

describe('module sizes', () => {
  it('module.zip is under 2MB', () => {
    const zips = execSync('ls -1 *.zip 2>/dev/null || true', { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 5000 }).trim().split('\n').filter(Boolean)
    for (const z of zips) {
      expect(statSync(resolve(PROJECT_ROOT, z)).size).toBeLessThan(2 * 1024 * 1024)
    }
  })
})
