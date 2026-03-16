import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

import { with_transaction } from '#libs-server/utils/with-transaction.mjs'

describe('with_transaction', () => {
  let temp_dir

  beforeEach(async () => {
    temp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'transaction-test-'))
  })

  afterEach(async () => {
    if (temp_dir) {
      await fs.rm(temp_dir, { recursive: true, force: true })
    }
  })

  it('should write files successfully when no error occurs', async () => {
    const file_a = path.join(temp_dir, 'a.txt')
    const file_b = path.join(temp_dir, 'b.txt')

    await with_transaction(async (txn) => {
      await txn.write_file(file_a, 'content-a')
      await txn.write_file(file_b, 'content-b')
    })

    expect(await fs.readFile(file_a, 'utf8')).to.equal('content-a')
    expect(await fs.readFile(file_b, 'utf8')).to.equal('content-b')
  })

  it('should rollback all writes on error', async () => {
    const file_a = path.join(temp_dir, 'a.txt')
    await fs.writeFile(file_a, 'original', 'utf8')
    const file_b = path.join(temp_dir, 'b.txt')

    try {
      await with_transaction(async (txn) => {
        await txn.write_file(file_a, 'modified')
        await txn.write_file(file_b, 'new-file')
        throw new Error('simulated failure')
      })
    } catch (err) {
      expect(err.message).to.equal('simulated failure')
    }

    // file_a should be restored to original
    expect(await fs.readFile(file_a, 'utf8')).to.equal('original')

    // file_b should be removed (did not exist before)
    let exists = true
    try {
      await fs.access(file_b)
    } catch {
      exists = false
    }
    expect(exists).to.be.false
  })

  it('should delete files and rollback on error', async () => {
    const file_path = path.join(temp_dir, 'to-delete.txt')
    await fs.writeFile(file_path, 'important content', 'utf8')

    try {
      await with_transaction(async (txn) => {
        await txn.delete_file(file_path)
        // File should be gone at this point
        let exists = true
        try {
          await fs.access(file_path)
        } catch {
          exists = false
        }
        expect(exists).to.be.false
        throw new Error('rollback trigger')
      })
    } catch {
      // expected
    }

    // File should be restored
    const content = await fs.readFile(file_path, 'utf8')
    expect(content).to.equal('important content')
  })

  it('should handle register_new_file and clean up on rollback', async () => {
    const file_path = path.join(temp_dir, 'external.txt')

    try {
      await with_transaction(async (txn) => {
        // Create file outside the transaction
        await fs.writeFile(file_path, 'external content', 'utf8')
        txn.register_new_file(file_path)
        throw new Error('rollback trigger')
      })
    } catch {
      // expected
    }

    // File should be removed by rollback
    let exists = true
    try {
      await fs.access(file_path)
    } catch {
      exists = false
    }
    expect(exists).to.be.false
  })

  it('should return the operation result on success', async () => {
    const result = await with_transaction(async () => {
      return { status: 'ok', count: 42 }
    })

    expect(result).to.deep.equal({ status: 'ok', count: 42 })
  })

  it('should re-throw the original error after rollback', async () => {
    try {
      await with_transaction(async () => {
        throw new Error('original error')
      })
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err.message).to.equal('original error')
    }
  })
})
