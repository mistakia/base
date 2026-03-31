/* global describe, it, beforeEach */

import { expect } from 'chai'
import fs from 'fs'
import path from 'path'
import os from 'os'

import { load_extension_providers } from '#libs-server/extension/load-extension-providers.mjs'
import {
  get,
  get_all,
  has,
  list,
  _reset
} from '#libs-server/extension/capability-registry.mjs'

describe('load_extension_providers', () => {
  let temp_dir

  beforeEach(() => {
    _reset()
    temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-provider-test-'))
  })

  afterEach(() => {
    fs.rmSync(temp_dir, { recursive: true, force: true })
  })

  it('should load providers from provide/ directory', async () => {
    const ext_dir = path.join(temp_dir, 'test-ext')
    const provide_dir = path.join(ext_dir, 'provide')
    fs.mkdirSync(provide_dir, { recursive: true })
    fs.writeFileSync(
      path.join(provide_dir, 'test-cap.mjs'),
      'export function do_thing() { return "done" }\n'
    )

    const extensions = [
      {
        name: 'test-ext',
        extension_path: ext_dir,
        provided_capabilities: ['test-cap'],
        requires: []
      }
    ]

    await load_extension_providers(extensions)
    expect(has('test-cap')).to.be.true
    expect(get('test-cap')).to.have.property('do_thing')
  })

  it('should handle extensions with no provided capabilities', async () => {
    const extensions = [
      {
        name: 'cmd-only',
        extension_path: '/nonexistent',
        provided_capabilities: [],
        requires: []
      }
    ]

    await load_extension_providers(extensions)
    expect(list()).to.deep.equal({})
  })

  it('should handle missing provide file gracefully', async () => {
    const ext_dir = path.join(temp_dir, 'bad-ext')
    fs.mkdirSync(ext_dir, { recursive: true })

    const extensions = [
      {
        name: 'bad-ext',
        extension_path: ext_dir,
        provided_capabilities: ['missing-cap'],
        requires: []
      }
    ]

    // Should not throw
    await load_extension_providers(extensions)
    expect(has('missing-cap')).to.be.false
  })

  it('should register multiple providers for the same capability', async () => {
    const ext_a = path.join(temp_dir, 'ext-a')
    const ext_b = path.join(temp_dir, 'ext-b')
    fs.mkdirSync(path.join(ext_a, 'provide'), { recursive: true })
    fs.mkdirSync(path.join(ext_b, 'provide'), { recursive: true })

    fs.writeFileSync(
      path.join(ext_a, 'provide', 'notify.mjs'),
      'export const source = "a"\n'
    )
    fs.writeFileSync(
      path.join(ext_b, 'provide', 'notify.mjs'),
      'export const source = "b"\n'
    )

    const extensions = [
      {
        name: 'ext-a',
        extension_path: ext_a,
        provided_capabilities: ['notify'],
        requires: []
      },
      {
        name: 'ext-b',
        extension_path: ext_b,
        provided_capabilities: ['notify'],
        requires: []
      }
    ]

    await load_extension_providers(extensions)
    const providers = get_all('notify')
    expect(providers).to.have.lengthOf(2)
    expect(providers[0].source).to.equal('a')
    expect(providers[1].source).to.equal('b')
  })

  it('should warn when required capability is not provided', async () => {
    const extensions = [
      {
        name: 'needs-queue',
        extension_path: '/nonexistent',
        provided_capabilities: [],
        requires: ['queue']
      }
    ]

    // Should not throw -- just logs a warning
    await load_extension_providers(extensions)
  })

  it('should not warn when required capability is provided by another extension', async () => {
    const ext_dir = path.join(temp_dir, 'queue-ext')
    fs.mkdirSync(path.join(ext_dir, 'provide'), { recursive: true })
    fs.writeFileSync(
      path.join(ext_dir, 'provide', 'queue.mjs'),
      'export function enqueue() {}\n'
    )

    const extensions = [
      {
        name: 'queue-ext',
        extension_path: ext_dir,
        provided_capabilities: ['queue'],
        requires: []
      },
      {
        name: 'consumer',
        extension_path: '/nonexistent',
        provided_capabilities: [],
        requires: ['queue']
      }
    ]

    await load_extension_providers(extensions)
    expect(has('queue')).to.be.true
  })
})
