import { expect } from 'chai'
import os from 'os'
import path from 'path'
import fs from 'fs'

import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'

describe('threads-constants test sandbox guard', function () {
  const original_node_env = process.env.NODE_ENV

  afterEach(() => {
    if (original_node_env === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = original_node_env
    }
  })

  it('throws under NODE_ENV=test when user_base_directory is outside tmp roots', () => {
    process.env.NODE_ENV = 'test'
    expect(() =>
      get_thread_base_directory({
        user_base_directory: '/Users/someone/user-base'
      })
    ).to.throw(/Refusing to resolve thread base directory under NODE_ENV=test/)
  })

  it('throws for the real user home user-base path under NODE_ENV=test', () => {
    process.env.NODE_ENV = 'test'
    const fake_real_base = path.join(os.homedir(), 'user-base')
    expect(() =>
      get_thread_base_directory({ user_base_directory: fake_real_base })
    ).to.throw(/Refusing to resolve thread base directory/)
  })

  it('allows paths under os.tmpdir() in test mode', () => {
    process.env.NODE_ENV = 'test'
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'thread-sandbox-'))
    try {
      const result = get_thread_base_directory({ user_base_directory: sandbox })
      expect(result).to.equal(path.join(sandbox, 'thread'))
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true })
    }
  })

  it('allows /tmp/* paths in test mode (config-test.json pattern)', () => {
    process.env.NODE_ENV = 'test'
    expect(() =>
      get_thread_base_directory({ user_base_directory: '/tmp/base_data_test' })
    ).to.not.throw()
  })

  it('does not throw outside test mode for production paths', () => {
    process.env.NODE_ENV = 'production'
    const result = get_thread_base_directory({
      user_base_directory: '/Users/someone/user-base'
    })
    expect(result).to.equal('/Users/someone/user-base/thread')
  })

  it('simulates the original repro: /tmp/repro-timeline synthetic session cannot touch a production user-base in test mode', () => {
    process.env.NODE_ENV = 'test'
    const production_base = '/Users/someone/user-base'
    expect(() =>
      get_thread_base_directory({ user_base_directory: production_base })
    ).to.throw(/Refusing to resolve thread base directory/)
  })
})
