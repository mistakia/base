import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { expect } from 'chai'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../..')
const BASE_CLI = path.join(ROOT, 'cli/base.mjs')

const _run_cli = (args, env = {}) => {
  const result = spawnSync(
    'bun',
    [BASE_CLI, 'thread', 'lease', ...args],
    {
      cwd: ROOT,
      env: { ...process.env, ...env, NODE_ENV: 'test' },
      encoding: 'utf-8'
    }
  )
  return result
}

describe('cli/base/thread-lease', function () {
  this.timeout(30000)

  describe('list', () => {
    it('prints help and exits when --help is passed', () => {
      const result = _run_cli(['list', '--help'])
      expect(result.status).to.equal(0)
      expect(result.stdout).to.match(/--filter/)
      expect(result.stdout).to.match(/owned-by-me/)
    })

    it('rejects an invalid filter value', () => {
      const result = _run_cli(['list', '--filter', 'bogus'])
      expect(result.status).to.not.equal(0)
      expect(result.stderr + result.stdout).to.match(/filter/i)
    })
  })

  describe('inspect', () => {
    it('requires a thread_id positional', () => {
      const result = _run_cli(['inspect'])
      expect(result.status).to.not.equal(0)
    })
  })
})
