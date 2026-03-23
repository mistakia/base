import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

import { read_modify_write } from '#libs-server/filesystem/optimistic-write.mjs'

describe('read_modify_write', () => {
  let temp_dir

  beforeEach(async () => {
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'optimistic-write-'))
  })

  afterEach(async () => {
    if (temp_dir) {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  it('should read, modify, and write file on first attempt', async () => {
    const file_path = path.join(temp_dir, 'data.json')
    await fs.writeFile(file_path, JSON.stringify({ count: 1 }), 'utf8')

    const result = await read_modify_write({
      absolute_path: file_path,
      modify: (content) => {
        const data = JSON.parse(content)
        data.count += 1
        return JSON.stringify(data)
      }
    })

    expect(JSON.parse(result)).to.deep.equal({ count: 2 })

    const on_disk = JSON.parse(await fs.readFile(file_path, 'utf8'))
    expect(on_disk).to.deep.equal({ count: 2 })
  })

  it('should retry when file is modified between read and write', async () => {
    const file_path = path.join(temp_dir, 'data.json')
    await fs.writeFile(file_path, JSON.stringify({ count: 1 }), 'utf8')

    let modify_call_count = 0

    const result = await read_modify_write({
      absolute_path: file_path,
      modify: async (content) => {
        modify_call_count++
        const data = JSON.parse(content)

        // On first attempt, simulate a concurrent write by touching the file
        if (modify_call_count === 1) {
          await fs.writeFile(file_path, JSON.stringify({ count: 5 }), 'utf8')
        }

        data.count += 10
        return JSON.stringify(data)
      }
    })

    // Should have been called twice: first attempt conflicted, second succeeded
    expect(modify_call_count).to.equal(2)
    // Second attempt reads the concurrent write (count=5) and adds 10
    expect(JSON.parse(result)).to.deep.equal({ count: 15 })
  })

  it('should call modify with fresh content on retry', async () => {
    const file_path = path.join(temp_dir, 'data.json')
    await fs.writeFile(file_path, 'version-1', 'utf8')

    const contents_seen = []
    let modify_call_count = 0

    await read_modify_write({
      absolute_path: file_path,
      modify: async (content) => {
        modify_call_count++
        contents_seen.push(content)

        if (modify_call_count === 1) {
          await fs.writeFile(file_path, 'version-2', 'utf8')
        }

        return content + '-modified'
      }
    })

    expect(contents_seen[0]).to.equal('version-1')
    expect(contents_seen[1]).to.equal('version-2')
  })

  it('should throw after max retries exhausted', async () => {
    const file_path = path.join(temp_dir, 'data.json')
    await fs.writeFile(file_path, 'initial', 'utf8')

    let counter = 0

    try {
      await read_modify_write({
        absolute_path: file_path,
        max_retries: 2,
        modify: async (content) => {
          counter++
          // Always cause a conflict by modifying the file
          await fs.writeFile(file_path, `conflict-${counter}`, 'utf8')
          return content + '-modified'
        }
      })
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err.message).to.include('max retries')
      expect(err.message).to.include('2')
      // 1 initial + 2 retries = 3 calls
      expect(counter).to.equal(3)
    }
  })

  it('should work with async modify callback', async () => {
    const file_path = path.join(temp_dir, 'data.json')
    await fs.writeFile(file_path, '{"value": "old"}', 'utf8')

    await read_modify_write({
      absolute_path: file_path,
      modify: async (content) => {
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 5))
        const data = JSON.parse(content)
        data.value = 'new'
        return JSON.stringify(data)
      }
    })

    const result = JSON.parse(await fs.readFile(file_path, 'utf8'))
    expect(result.value).to.equal('new')
  })

  it('should leave no temp files after write', async () => {
    const file_path = path.join(temp_dir, 'data.txt')
    await fs.writeFile(file_path, 'content', 'utf8')

    await read_modify_write({
      absolute_path: file_path,
      modify: (content) => content + '-updated'
    })

    const files = await fs.readdir(temp_dir)
    const temp_files = files.filter((f) => f.startsWith('.tmp-write-'))
    expect(temp_files).to.have.lengthOf(0)
  })
})
