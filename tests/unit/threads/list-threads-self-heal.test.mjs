import { expect } from 'chai'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import {
  get_thread_metadata,
  process_threads_in_batches
} from '#libs-server/threads/list-threads.mjs'

const make_user_base = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'list-threads-heal-'))
  await fs.mkdir(path.join(dir, 'thread'), { recursive: true })
  return dir
}

describe('get_thread_metadata self-heal', function () {
  let user_base

  beforeEach(async function () {
    user_base = await make_user_base()
  })

  afterEach(async function () {
    await fs.rm(user_base, { recursive: true, force: true })
  })

  it('returns a synthetic orphaned record when metadata.json is missing', async function () {
    const thread_id = '3fb842ea-8233-596c-a146-2719c188810f'
    const thread_dir = path.join(user_base, 'thread', thread_id)
    await fs.mkdir(path.join(thread_dir, 'raw-data'), { recursive: true })
    await fs.writeFile(
      path.join(thread_dir, 'raw-data', 'claude-session.jsonl'),
      ''
    )

    const metadata = await get_thread_metadata({
      thread_id,
      user_base_directory: user_base
    })

    expect(metadata).to.not.be.null
    expect(metadata.thread_id).to.equal(thread_id)
    expect(metadata._orphaned).to.equal(true)
    expect(metadata.thread_state).to.equal('orphaned')
  })

  it('returns a transient record when an import lock is present', async function () {
    const thread_id = 'de71d946-7304-506a-b7ed-2bc03006a170'
    const thread_dir = path.join(user_base, 'thread', thread_id)
    await fs.mkdir(thread_dir, { recursive: true })
    await fs.writeFile(path.join(thread_dir, '.import.lock'), '')

    const metadata = await get_thread_metadata({
      thread_id,
      user_base_directory: user_base
    })

    expect(metadata._transient).to.equal(true)
    expect(metadata.thread_state).to.equal('importing')
  })

  it('returns normal metadata when metadata.json exists', async function () {
    const thread_id = 'a122df1a-fa23-41be-b233-9256baa6bee7'
    const thread_dir = path.join(user_base, 'thread', thread_id)
    await fs.mkdir(thread_dir, { recursive: true })
    await fs.writeFile(
      path.join(thread_dir, 'metadata.json'),
      JSON.stringify({ thread_id, models: ['claude-opus-4-7'] })
    )

    const metadata = await get_thread_metadata({
      thread_id,
      user_base_directory: user_base
    })

    expect(metadata.thread_id).to.equal(thread_id)
    expect(metadata._orphaned).to.be.undefined
    expect(metadata._transient).to.be.undefined
    expect(metadata.model).to.equal('claude-opus-4-7')
  })

  it('process_threads_in_batches skips synthetic records instead of failing', async function () {
    const live_id = 'ec67f399-29b5-53b0-bb1d-c5194ceb2f0e'
    const orphan_id = '015a0238-ad7d-4ebe-acdf-005a887ac53c'

    const live_dir = path.join(user_base, 'thread', live_id)
    await fs.mkdir(live_dir, { recursive: true })
    await fs.writeFile(
      path.join(live_dir, 'metadata.json'),
      JSON.stringify({ thread_id: live_id })
    )

    const orphan_dir = path.join(user_base, 'thread', orphan_id)
    await fs.mkdir(orphan_dir, { recursive: true })

    let synced_calls = 0
    const { synced, failed, failed_thread_ids } =
      await process_threads_in_batches({
        thread_ids: [live_id, orphan_id],
        sync_fn: async () => {
          synced_calls++
          return { success: true }
        },
        user_base_directory: user_base,
        options: { log_fn: () => {} }
      })

    expect(synced).to.equal(1)
    expect(failed).to.equal(0)
    expect(failed_thread_ids).to.deep.equal([])
    expect(synced_calls).to.equal(1)
  })
})
