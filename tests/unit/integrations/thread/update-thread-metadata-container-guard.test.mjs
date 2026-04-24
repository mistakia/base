import { expect } from 'chai'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { update_thread_metadata } from '#libs-server/integrations/thread/create-from-session.mjs'

const make_session = () => ({
  session_id: 'test-session-001',
  session_provider: 'claude',
  messages: [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' }
  ],
  metadata: {
    start_time: '2026-04-10T00:00:00Z',
    end_time: '2026-04-10T00:01:00Z'
  }
})

describe('update_thread_metadata container_user downgrade guard', function () {
  let thread_dir

  beforeEach(async function () {
    thread_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'thread-meta-guard-'))
    const existing = {
      thread_id: 'abc',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
      message_count: 0,
      tool_call_count: 0,
      external_session: {
        provider: 'claude',
        session_id: 'test-session-001',
        execution_mode: 'container_user',
        container_user: 'arrin',
        container_name: 'arrin-box',
        user_public_key: 'arrin-pubkey',
        imported_at: '2026-04-01T00:00:00Z'
      }
    }
    await fs.writeFile(
      path.join(thread_dir, 'metadata.json'),
      JSON.stringify(existing, null, 2)
    )
  })

  afterEach(async function () {
    await fs.rm(thread_dir, { recursive: true, force: true })
  })

  it('refuses to overwrite container_user attribution when incoming override is host', async function () {
    const changed = await update_thread_metadata(thread_dir, make_session(), {
      source_overrides: {
        execution_mode: 'host',
        container_user: null,
        container_name: null
      }
    })

    const after = JSON.parse(
      await fs.readFile(path.join(thread_dir, 'metadata.json'), 'utf-8')
    )

    expect(after.external_session.execution_mode).to.equal('container_user')
    expect(after.external_session.container_user).to.equal('arrin')
    expect(after.external_session.container_name).to.equal('arrin-box')
    expect(after.external_session.user_public_key).to.equal('arrin-pubkey')
    // message_count may update from session even when source is preserved
    expect(changed).to.be.a('boolean')
  })

  it('refuses to overwrite container_user attribution when incoming override is an empty host record', async function () {
    await update_thread_metadata(thread_dir, make_session(), {
      source_overrides: { execution_mode: 'host' }
    })

    const after = JSON.parse(
      await fs.readFile(path.join(thread_dir, 'metadata.json'), 'utf-8')
    )

    expect(after.external_session.execution_mode).to.equal('container_user')
    expect(after.external_session.container_user).to.equal('arrin')
  })

  it('allows container_user override to persist on a non-container thread', async function () {
    // Overwrite existing metadata with a host thread
    const host_metadata = {
      thread_id: 'abc',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
      message_count: 0,
      tool_call_count: 0,
      external_session: {
        provider: 'claude',
        session_id: 'test-session-001',
        execution_mode: 'host',
        imported_at: '2026-04-01T00:00:00Z'
      }
    }
    await fs.writeFile(
      path.join(thread_dir, 'metadata.json'),
      JSON.stringify(host_metadata, null, 2)
    )

    await update_thread_metadata(thread_dir, make_session(), {
      source_overrides: {
        execution_mode: 'container_user',
        container_user: 'arrin',
        container_name: 'arrin-box'
      }
    })

    const after = JSON.parse(
      await fs.readFile(path.join(thread_dir, 'metadata.json'), 'utf-8')
    )
    expect(after.external_session.execution_mode).to.equal('container_user')
    expect(after.external_session.container_user).to.equal('arrin')
  })

  it('preserves container_user attribution when no overrides are supplied', async function () {
    await update_thread_metadata(thread_dir, make_session(), {})

    const after = JSON.parse(
      await fs.readFile(path.join(thread_dir, 'metadata.json'), 'utf-8')
    )
    expect(after.external_session.execution_mode).to.equal('container_user')
    expect(after.external_session.container_user).to.equal('arrin')
  })
})
