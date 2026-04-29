import { expect } from 'chai'
import { mkdtemp, mkdir, writeFile, utimes } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

import { run_stuck_thread_sweep } from '#libs-server/embedded-database-index/sync/stuck-thread-sweep.mjs'

const write_thread_metadata = async ({
  user_base_directory,
  thread_id,
  metadata,
  mtime_ms = null
}) => {
  const dir = join(user_base_directory, 'thread', thread_id)
  await mkdir(dir, { recursive: true })
  const path = join(dir, 'metadata.json')
  await writeFile(path, JSON.stringify(metadata), 'utf-8')
  if (mtime_ms != null) {
    const seconds = mtime_ms / 1000
    await utimes(path, seconds, seconds)
  }
}

describe('libs-server/embedded-database-index/sync/stuck-thread-sweep', () => {
  let user_base_directory

  beforeEach(async () => {
    user_base_directory = await mkdtemp(join(tmpdir(), 'stuck-sweep-test-'))
  })

  it('flags threads stuck at session_status=starting past the threshold', async () => {
    const old_iso = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    await write_thread_metadata({
      user_base_directory,
      thread_id: 'stuck-1',
      metadata: {
        thread_id: 'stuck-1',
        session_status: 'starting',
        updated_at: old_iso,
        job_id: 'job-stuck-1',
        execution: { container_name: 'base-user-test' }
      }
    })

    const result = await run_stuck_thread_sweep({ user_base_directory })

    expect(result.ran).to.equal(true)
    expect(result.stuck).to.have.lengthOf(1)
    expect(result.stuck[0].thread_id).to.equal('stuck-1')
    expect(result.stuck[0].job_id).to.equal('job-stuck-1')
    expect(result.stuck[0].container_name).to.equal('base-user-test')
  })

  it('does not flag threads with non-starting status', async () => {
    const old_iso = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    await write_thread_metadata({
      user_base_directory,
      thread_id: 'completed-1',
      metadata: {
        thread_id: 'completed-1',
        session_status: 'completed',
        updated_at: old_iso
      }
    })
    await write_thread_metadata({
      user_base_directory,
      thread_id: 'active-1',
      metadata: {
        thread_id: 'active-1',
        session_status: 'active',
        updated_at: old_iso
      }
    })

    const result = await run_stuck_thread_sweep({ user_base_directory })
    expect(result.stuck).to.have.lengthOf(0)
  })

  it('does not flag threads still within the threshold', async () => {
    const recent_iso = new Date(Date.now() - 30 * 1000).toISOString()
    await write_thread_metadata({
      user_base_directory,
      thread_id: 'recent-1',
      metadata: {
        thread_id: 'recent-1',
        session_status: 'starting',
        updated_at: recent_iso
      }
    })

    const result = await run_stuck_thread_sweep({ user_base_directory })
    expect(result.stuck).to.have.lengthOf(0)
  })

  it('skips threads outside the fresh window via mtime filter', async () => {
    const old_iso = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const ancient_mtime = Date.now() - 48 * 60 * 60 * 1000
    await write_thread_metadata({
      user_base_directory,
      thread_id: 'ancient-1',
      metadata: {
        thread_id: 'ancient-1',
        session_status: 'starting',
        updated_at: old_iso
      },
      mtime_ms: ancient_mtime
    })

    const result = await run_stuck_thread_sweep({
      user_base_directory,
      fresh_window_ms: 24 * 60 * 60 * 1000
    })
    expect(result.stuck).to.have.lengthOf(0)
    expect(result.scanned).to.equal(0)
  })
})
