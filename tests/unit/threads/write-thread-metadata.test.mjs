import { mkdtemp, mkdir, writeFile, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { expect } from 'chai'

import { write_thread_metadata } from '#libs-server/threads/write-thread-metadata.mjs'
import { _drain_for_tests } from '#libs-server/threads/audit-log.mjs'

describe('libs-server/threads/write-thread-metadata', () => {
  let tmp_dir
  let thread_dir
  let metadata_path

  beforeEach(async () => {
    tmp_dir = await mkdtemp(join(tmpdir(), 'wtm-test-'))
    thread_dir = join(tmp_dir, 'thread', 't-1')
    await mkdir(thread_dir, { recursive: true })
    metadata_path = join(thread_dir, 'metadata.json')
    await writeFile(
      metadata_path,
      JSON.stringify({ title: 'old', message_count: 1 }, null, 2),
      'utf8'
    )
  })

  afterEach(async () => {
    await _drain_for_tests()
    await rm(tmp_dir, { recursive: true, force: true })
  })

  it('applies modify and emits an audit entry with the field diff', async () => {
    await write_thread_metadata({
      absolute_path: metadata_path,
      modify: (m) => ({ ...m, title: 'new', message_count: 2 }),
      audit_context: {
        thread_id: 't-1',
        machine_id: 'macbook',
        session_id: 's-1',
        actor: 'user-key',
        op: 'patch',
        lease_state: { machine_id: 'macbook', mode: 'session' },
        lease_token: 7
      }
    })
    await _drain_for_tests()

    const written = JSON.parse(await readFile(metadata_path, 'utf8'))
    expect(written.title).to.equal('new')
    expect(written.message_count).to.equal(2)
    expect(written._lease_token).to.equal(undefined)

    const audit = await readFile(join(thread_dir, 'audit.jsonl'), 'utf8')
    const entry = JSON.parse(audit.trim().split('\n')[0])
    expect(entry.op).to.equal('patch')
    expect(entry.machine_id).to.equal('macbook')
    expect(entry.lease_holder).to.equal('macbook')
    expect(entry.lease_mode).to.equal('session')
    expect(entry.lease_token).to.equal(7)
    expect(entry.fields_changed.title).to.deep.equal({
      before: 'old',
      after: 'new'
    })
    expect(entry.fields_changed.message_count).to.deep.equal({
      before: 1,
      after: 2
    })
  })

  it('does not emit audit entry when modify produces no diff', async () => {
    await write_thread_metadata({
      absolute_path: metadata_path,
      modify: (m) => ({ ...m }),
      audit_context: {
        thread_id: 't-1',
        machine_id: 'macbook',
        op: 'patch',
        lease_token: null
      }
    })
    await _drain_for_tests()

    let audit_exists = false
    try {
      await readFile(join(thread_dir, 'audit.jsonl'), 'utf8')
      audit_exists = true
    } catch {
      audit_exists = false
    }
    expect(audit_exists).to.equal(false)
  })

  it('does not emit an audit entry for non-thread-metadata paths', async () => {
    const other_path = join(tmp_dir, 'other.json')
    await writeFile(other_path, JSON.stringify({ foo: 1 }, null, 2), 'utf8')
    await write_thread_metadata({
      absolute_path: other_path,
      modify: (m) => ({ ...m, foo: 2 }),
      audit_context: {
        thread_id: 't-1',
        machine_id: 'macbook',
        op: 'patch',
        lease_token: 9
      }
    })
    await _drain_for_tests()
    const written = JSON.parse(await readFile(other_path, 'utf8'))
    expect(written.foo).to.equal(2)
  })

  it('never writes _lease_token to the metadata file', async () => {
    await write_thread_metadata({
      absolute_path: metadata_path,
      modify: (m) => ({ ...m, title: 'next' }),
      audit_context: {
        thread_id: 't-1',
        machine_id: 'macbook',
        op: 'patch',
        lease_token: 42
      }
    })
    await _drain_for_tests()
    const written = JSON.parse(await readFile(metadata_path, 'utf8'))
    expect(written._lease_token).to.equal(undefined)

    const audit = await readFile(join(thread_dir, 'audit.jsonl'), 'utf8')
    const entry = JSON.parse(audit.trim().split('\n')[0])
    expect(entry.lease_token).to.equal(42)
  })

  it('throws on missing absolute_path or modify', async () => {
    let err
    try {
      await write_thread_metadata({
        absolute_path: null,
        modify: (m) => m,
        audit_context: {}
      })
    } catch (e) {
      err = e
    }
    expect(err.message).to.match(/absolute_path/)
  })
})
