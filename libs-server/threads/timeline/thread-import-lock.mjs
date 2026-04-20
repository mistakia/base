import fs from 'fs/promises'
import path from 'path'

const in_process_chains = new Map()
const LOCK_FILENAME = '.import.lock'
const RETRY_DELAY_MS = 50
const MAX_WAIT_MS = 5 * 60 * 1000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const acquire_file_lock = async ({ lock_path }) => {
  const deadline = Date.now() + MAX_WAIT_MS
  while (true) {
    try {
      const handle = await fs.open(lock_path, 'wx')
      await handle.write(`${process.pid}\n`)
      return handle
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (Date.now() > deadline) {
        throw new Error(`thread-import-lock timeout: ${lock_path}`)
      }
      await sleep(RETRY_DELAY_MS)
    }
  }
}

export const acquire_thread_import_lock = async ({ thread_dir }) => {
  if (!thread_dir)
    throw new Error('acquire_thread_import_lock: thread_dir required')
  const lock_path = path.join(thread_dir, LOCK_FILENAME)

  const previous = in_process_chains.get(lock_path) || Promise.resolve()
  let release_resolve
  const current = new Promise((resolve) => {
    release_resolve = resolve
  })
  const chain_tail = previous.then(() => current)
  in_process_chains.set(lock_path, chain_tail)

  await previous

  let handle
  try {
    handle = await acquire_file_lock({ lock_path })
  } catch (error) {
    release_resolve()
    throw error
  }

  const release = async () => {
    let unlink_error = null
    try {
      await handle.close()
    } finally {
      try {
        await fs.unlink(lock_path)
      } catch (error) {
        if (error.code !== 'ENOENT') unlink_error = error
      } finally {
        release_resolve()
      }
    }
    if (unlink_error) {
      throw unlink_error
    }
  }

  return { release }
}
