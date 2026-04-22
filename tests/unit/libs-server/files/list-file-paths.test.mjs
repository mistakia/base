import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

import { list_file_paths } from '#libs-server/files/list-file-paths.mjs'
import { clear_config_cache } from '#libs-server/search/search-config.mjs'

describe('list_file_paths', function () {
  this.timeout(10000)

  let temp_dir
  let original_user_base_directory

  beforeEach(async () => {
    original_user_base_directory = process.env.USER_BASE_DIRECTORY
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'list-paths-test-'))
    process.env.USER_BASE_DIRECTORY = temp_dir
    clear_config_cache()
  })

  const run = (overrides = {}) =>
    list_file_paths({ user_base_directory: temp_dir, ...overrides })

  afterEach(async () => {
    if (original_user_base_directory) {
      process.env.USER_BASE_DIRECTORY = original_user_base_directory
    } else {
      delete process.env.USER_BASE_DIRECTORY
    }
    if (temp_dir) {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
    clear_config_cache()
  })

  it('returns an empty array for an empty directory', async () => {
    const result = await run()
    expect(result).to.be.an('array').with.lengthOf(0)
  })

  it('enumerates files under user_base_directory with relative and absolute paths', async () => {
    await fs.mkdir(path.join(temp_dir, 'task'), { recursive: true })
    await fs.mkdir(path.join(temp_dir, 'workflow'), { recursive: true })
    await fs.writeFile(path.join(temp_dir, 'task', 'a.md'), '# a')
    await fs.writeFile(path.join(temp_dir, 'task', 'b.md'), '# b')
    await fs.writeFile(path.join(temp_dir, 'workflow', 'w.md'), '# w')

    const result = await run()

    expect(result).to.be.an('array')
    const relative_paths = result.map((r) => r.file_path).sort()
    expect(relative_paths).to.deep.equal([
      'task/a.md',
      'task/b.md',
      'workflow/w.md'
    ])
    for (const entry of result) {
      expect(entry).to.have.property('type', 'file')
      expect(entry.absolute_path.startsWith(temp_dir)).to.equal(true)
    }
  })

  it('honors the max_results cap', async () => {
    await fs.mkdir(path.join(temp_dir, 'task'), { recursive: true })
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(temp_dir, 'task', `t${i}.md`), `# ${i}`)
    }

    const result = await run({ max_results: 2 })
    expect(result).to.have.lengthOf(2)
  })

  it('scopes enumeration to a subdirectory when provided', async () => {
    await fs.mkdir(path.join(temp_dir, 'task'), { recursive: true })
    await fs.mkdir(path.join(temp_dir, 'workflow'), { recursive: true })
    await fs.writeFile(path.join(temp_dir, 'task', 'a.md'), '# a')
    await fs.writeFile(path.join(temp_dir, 'workflow', 'w.md'), '# w')

    const result = await run({ directory: 'task' })

    expect(result.map((r) => r.file_path).sort()).to.deep.equal(['a.md'])
    expect(result[0].absolute_path).to.equal(
      path.join(temp_dir, 'task', 'a.md')
    )
  })
})
