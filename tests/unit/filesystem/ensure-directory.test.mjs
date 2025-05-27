/* global describe it beforeEach afterEach */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import { ensure_directory } from '#libs-server/filesystem/ensure-directory.mjs'

const expect = chai.expect

describe('Filesystem Operations - ensure_directory', function () {
  let test_dir_path

  beforeEach(async function () {
    // Create a unique temporary test directory path
    test_dir_path = path.join(
      os.tmpdir(),
      `ensure-dir-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    )
  })

  afterEach(async function () {
    try {
      await fs.rm(test_dir_path, { recursive: true, force: true })
    } catch (error) {
      console.error('Error cleaning up test directory:', error)
    }
  })

  it('should create a directory if it does not exist', async function () {
    await ensure_directory(test_dir_path)
    const stats = await fs.stat(test_dir_path)
    expect(stats.isDirectory()).to.be.true
  })

  it('should create nested directories recursively', async function () {
    const nested_path = path.join(test_dir_path, 'nested/test/dir')
    await ensure_directory(nested_path)
    const stats = await fs.stat(nested_path)
    expect(stats.isDirectory()).to.be.true
  })

  it('should not throw error if directory already exists', async function () {
    // Create directory first
    await fs.mkdir(test_dir_path, { recursive: true })

    // Should not throw when ensuring it exists
    await ensure_directory(test_dir_path) // This will throw if there's an error

    const stats = await fs.stat(test_dir_path)
    expect(stats.isDirectory()).to.be.true
  })
})
