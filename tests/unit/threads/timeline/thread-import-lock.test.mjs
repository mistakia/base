import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import { acquire_thread_import_lock } from '#libs-server/threads/timeline/thread-import-lock.mjs'

describe('thread-import-lock', function () {
  let thread_dir

  beforeEach(async () => {
    thread_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'thread-import-lock-'))
  })

  afterEach(async () => {
    await fs.rm(thread_dir, { recursive: true, force: true })
  })

  it('creates .import.lock and returns a release handle', async () => {
    const lock = await acquire_thread_import_lock({ thread_dir })
    const lock_path = path.join(thread_dir, '.import.lock')
    const stat = await fs.stat(lock_path)
    expect(stat.isFile()).to.equal(true)
    expect(lock).to.have.property('release').that.is.a('function')
    await lock.release()
  })

  it('release removes the lock file and allows re-acquire', async () => {
    const first = await acquire_thread_import_lock({ thread_dir })
    await first.release()
    const lock_path = path.join(thread_dir, '.import.lock')
    let missing = false
    try {
      await fs.stat(lock_path)
    } catch (error) {
      if (error.code === 'ENOENT') missing = true
      else throw error
    }
    expect(missing).to.equal(true)

    const second = await acquire_thread_import_lock({ thread_dir })
    await second.release()
  })

  it('serializes two concurrent acquires', async () => {
    const events = []

    const first_lock = await acquire_thread_import_lock({ thread_dir })
    events.push('first_acquired')

    const second_promise = acquire_thread_import_lock({ thread_dir }).then(
      (lock) => {
        events.push('second_acquired')
        return lock
      }
    )

    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(events).to.deep.equal(['first_acquired'])

    events.push('first_releasing')
    await first_lock.release()

    const second_lock = await second_promise
    expect(events).to.deep.equal([
      'first_acquired',
      'first_releasing',
      'second_acquired'
    ])
    await second_lock.release()
  })

  it('throws when thread_dir is missing', async () => {
    let error
    try {
      await acquire_thread_import_lock({})
    } catch (e) {
      error = e
    }
    expect(error).to.exist
    expect(error.message).to.match(/thread_dir/)
  })
})
