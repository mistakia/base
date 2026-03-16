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
    if (temp_dir) {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  it('should ensure directory exists and write file with correct content', async () => {
    const sub_dir = path.join(temp_dir, 'subdir')
    const absolute_path = path.join(sub_dir, 'file.txt')
    const file_content = 'test content'

    let dir_exists = false
    try {
      await fs.access(sub_dir)
      dir_exists = true
    } catch {}
    expect(dir_exists).to.be.false

    await write_file_to_filesystem({ absolute_path, file_content })

    let dir_exists_after = false
    try {
      await fs.access(sub_dir)
      dir_exists_after = true
    } catch {}
    expect(dir_exists_after).to.be.true

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

  describe('atomic write behavior', () => {
    it('should leave no temp files after successful write', async () => {
      const absolute_path = path.join(temp_dir, 'file.txt')
      await write_file_to_filesystem({
        absolute_path,
        file_content: 'content'
      })

      const files = await fs.readdir(temp_dir)
      const temp_files = files.filter((f) => f.startsWith('.tmp-write-'))
      expect(temp_files).to.have.lengthOf(0)
    })

    it('should preserve original file content when overwriting', async () => {
      const absolute_path = path.join(temp_dir, 'file.txt')
      const original_content = 'original content'
      const new_content = 'new content'

      await fs.writeFile(absolute_path, original_content, 'utf8')
      await write_file_to_filesystem({
        absolute_path,
        file_content: new_content
      })

      // After atomic rename, file should have new content with no corruption
      const written = await fs.readFile(absolute_path, 'utf8')
      expect(written).to.equal(new_content)
      expect(written).to.have.lengthOf(new_content.length)
    })

    it('should clean up temp file when write to read-only target fails', async () => {
      // Create a directory that is read-only to prevent rename
      const readonly_dir = path.join(temp_dir, 'readonly')
      await fs.mkdir(readonly_dir)
      const target_path = path.join(readonly_dir, 'file.txt')

      // Write a file first, then make directory read-only
      await fs.writeFile(target_path, 'original', 'utf8')
      await fs.chmod(readonly_dir, 0o444)

      try {
        await write_file_to_filesystem({
          absolute_path: target_path,
          file_content: 'should fail'
        })
        expect.fail('Should have thrown an error')
      } catch {
        // Expected to fail
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(readonly_dir, 0o755)
      }

      // No temp files should remain
      const files = await fs.readdir(readonly_dir)
      const temp_files = files.filter((f) => f.startsWith('.tmp-write-'))
      expect(temp_files).to.have.lengthOf(0)
    })

    it('should not corrupt file content when writing shorter content over longer content', async () => {
      // This is the exact scenario that caused the original corruption:
      // a shorter write over a longer file without truncation leaves trailing bytes
      const absolute_path = path.join(temp_dir, 'file.json')
      const long_content = JSON.stringify({ data: 'a'.repeat(1000) }, null, 2)
      const short_content = JSON.stringify({ data: 'b' }, null, 2)

      await write_file_to_filesystem({
        absolute_path,
        file_content: long_content
      })
      await write_file_to_filesystem({
        absolute_path,
        file_content: short_content
      })

      const result = await fs.readFile(absolute_path, 'utf8')
      expect(result).to.equal(short_content)
      // Verify no trailing garbage bytes from the longer previous content
      expect(result).to.have.lengthOf(short_content.length)
      // Verify it parses as valid JSON (corruption would break parsing)
      expect(() => JSON.parse(result)).to.not.throw()
    })

    it('should handle concurrent writes without corruption', async () => {
      const absolute_path = path.join(temp_dir, 'concurrent.txt')

      // Launch multiple writes concurrently - atomic rename means
      // the file will contain one complete write, never a mix
      const writes = Array.from({ length: 10 }, (_, i) =>
        write_file_to_filesystem({
          absolute_path,
          file_content: `content-${i}-${'x'.repeat(100)}`
        })
      )

      await Promise.all(writes)

      const result = await fs.readFile(absolute_path, 'utf8')
      // Result should be one of the complete writes, not a corrupted mix
      expect(result).to.match(/^content-\d+-x{100}$/)

      // No temp files left behind
      const files = await fs.readdir(temp_dir)
      const temp_files = files.filter((f) => f.startsWith('.tmp-write-'))
      expect(temp_files).to.have.lengthOf(0)
    })
  })
})
