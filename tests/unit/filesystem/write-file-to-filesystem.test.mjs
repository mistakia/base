import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

import { write_file_to_filesystem } from '#libs-server/filesystem/write-file-to-filesystem.mjs'

describe('write_file_to_filesystem', () => {
  let temp_dir

  beforeEach(async () => {
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'write-file-test-'))
  })

  afterEach(async () => {
    // Remove the temp directory and all its contents
    if (temp_dir) {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  it('should ensure directory exists and write file with correct content', async () => {
    const sub_dir = path.join(temp_dir, 'subdir')
    const absolute_path = path.join(sub_dir, 'file.txt')
    const file_content = 'test content'

    // Directory should not exist before
    let dir_exists = false
    try {
      await fs.access(sub_dir)
      dir_exists = true
    } catch {}
    expect(dir_exists).to.be.false

    await write_file_to_filesystem({ absolute_path, file_content })

    // Directory should exist after
    let dir_exists_after = false
    try {
      await fs.access(sub_dir)
      dir_exists_after = true
    } catch {}
    expect(dir_exists_after).to.be.true

    // File should exist and have correct content
    const written_content = await fs.readFile(absolute_path, 'utf8')
    expect(written_content).to.equal(file_content)
  })

  it('should overwrite file if it already exists', async () => {
    const absolute_path = path.join(temp_dir, 'file.txt')
    await fs.writeFile(absolute_path, 'old content', 'utf8')

    await write_file_to_filesystem({
      absolute_path,
      file_content: 'new content'
    })
    const written_content = await fs.readFile(absolute_path, 'utf8')
    expect(written_content).to.equal('new content')
  })

  it('should throw if parent directory cannot be created', async () => {
    // Try to write to a path that cannot be created (simulate by using an invalid path)
    const invalid_path = path.join('/dev/null', 'file.txt')
    try {
      await write_file_to_filesystem({
        absolute_path: invalid_path,
        file_content: 'content'
      })
      expect.fail('Should have thrown an error')
    } catch (err) {
      expect(err).to.be.an('error')
    }
  })
})
