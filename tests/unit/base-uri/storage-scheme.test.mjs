import { expect } from 'chai'
import fs from 'fs'
import os from 'os'
import path from 'path'

import config from '#config'
import {
  resolve_base_uri,
  is_storage_uri,
  is_valid_base_uri
} from '#libs-server/base-uri/base-uri-utilities.mjs'

describe('storage: base-URI scheme', () => {
  let storage_root
  let outside_root

  before(() => {
    storage_root = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-test-'))
    outside_root = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-outside-'))
    config.storage = {
      enabled: true,
      root_dir: storage_root,
      extension_whitelist: ['png', 'jpg']
    }
    fs.writeFileSync(path.join(storage_root, 'foo.png'), 'fake-png')
    fs.writeFileSync(path.join(outside_root, 'secret.png'), 'secret')
    fs.symlinkSync(
      path.join(outside_root, 'secret.png'),
      path.join(storage_root, 'escape.png')
    )
  })

  after(() => {
    fs.rmSync(storage_root, { recursive: true, force: true })
    fs.rmSync(outside_root, { recursive: true, force: true })
  })

  it('detects storage URIs', () => {
    expect(is_storage_uri('storage:foo.png')).to.equal(true)
    expect(is_storage_uri('user:foo.md')).to.equal(false)
    expect(is_storage_uri(null)).to.equal(false)
  })

  it('treats storage as a valid scheme', () => {
    expect(is_valid_base_uri('storage:foo.png')).to.equal(true)
    expect(is_valid_base_uri('storage:/foo.png')).to.equal(true)
  })

  it('resolves `storage:foo.png` to `<root>/foo.png`', () => {
    const resolved = resolve_base_uri('storage:foo.png')
    expect(resolved).to.equal(fs.realpathSync(path.join(storage_root, 'foo.png')))
  })

  it('strips a leading slash on `storage:/foo.png`', () => {
    const resolved = resolve_base_uri('storage:/foo.png')
    expect(resolved).to.equal(fs.realpathSync(path.join(storage_root, 'foo.png')))
  })

  it('rejects `storage:../etc/passwd` (path traversal)', () => {
    expect(() => resolve_base_uri('storage:../etc/passwd')).to.throw(
      /traversal|outside/i
    )
  })

  it('rejects symlinks whose realpath escapes the root', () => {
    expect(() => resolve_base_uri('storage:escape.png')).to.throw(
      /symlink|escape|traversal/i
    )
  })
})
