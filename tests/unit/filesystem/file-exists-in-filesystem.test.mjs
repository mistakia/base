import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

import { file_exists_in_filesystem } from '#libs-server/filesystem/file-exists-in-filesystem.mjs'

describe('file_exists_in_filesystem', () => {
  let temp_dir

  beforeEach(async () => {
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-exists-test-'))
  })

  afterEach(async () => {
    // Remove the temp directory and all its contents
    if (temp_dir) {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  it('should return true for existing readable files', async () => {
    // Create a test file
    const file_path = path.join(temp_dir, 'existing-file.txt')
    await fs.writeFile(file_path, 'test content', 'utf8')

    const result = await file_exists_in_filesystem({ absolute_path: file_path })
    expect(result).to.be.true
  })

  it('should return false for non-existent files', async () => {
    const non_existent_path = path.join(temp_dir, 'non-existent-file.txt')
    const result = await file_exists_in_filesystem({
      absolute_path: non_existent_path
    })
    expect(result).to.be.false
  })

  it('should return false for directories', async () => {
    // Create a directory
    const dir_path = path.join(temp_dir, 'test-dir')
    await fs.mkdir(dir_path)

    const result = await file_exists_in_filesystem({ absolute_path: dir_path })
    expect(result).to.be.false
  })

  it('should handle invalid paths without throwing errors', async () => {
    const invalid_path = path.join('/non-existent-dir', 'file.txt')
    const result = await file_exists_in_filesystem({
      absolute_path: invalid_path
    })
    expect(result).to.be.false
  })
})
