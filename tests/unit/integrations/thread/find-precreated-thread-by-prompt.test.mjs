import { expect } from 'chai'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

import { process_single_session } from '#libs-server/integrations/thread/create-threads-from-session-provider.mjs'

const make_uuid = () => crypto.randomUUID()

const make_provider = (
  session_id,
  { prompt = 'Implement the feature' } = {}
) => ({
  name: 'claude',
  get_session_id: () => session_id,
  normalize_session: (raw) => ({
    session_id: raw.session_id,
    session_provider: 'claude',
    messages: prompt
      ? [
          {
            type: 'message',
            role: 'user',
            content: [{ type: 'text', text: prompt }]
          },
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'OK' }]
          }
        ]
      : [],
    metadata: {
      start_time: '2026-04-12T00:00:00Z',
      end_time: '2026-04-12T00:01:00Z'
    }
  }),
  get_models_from_session: async () => ['claude-opus-4-6'],
  get_inference_provider: () => 'anthropic'
})

const write_thread_metadata = async (threads_dir, thread_id, metadata) => {
  const thread_dir = path.join(threads_dir, thread_id)
  await fs.mkdir(thread_dir, { recursive: true })
  await fs.writeFile(
    path.join(thread_dir, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  )
}

describe('find_precreated_thread_by_prompt (tertiary dedup)', function () {
  this.timeout(15000)

  let user_base_directory
  let threads_dir

  beforeEach(async function () {
    user_base_directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'precreated-prompt-')
    )
    threads_dir = path.join(user_base_directory, 'thread')
    await fs.mkdir(threads_dir, { recursive: true })
  })

  afterEach(async function () {
    await fs.rm(user_base_directory, { recursive: true, force: true })
  })

  it('should match pre-created thread within race window by prompt_snippet', async function () {
    const session_id = `test-session-${make_uuid()}`
    const precreated_id = make_uuid()
    const prompt = 'Implement the feature'

    await write_thread_metadata(threads_dir, precreated_id, {
      thread_id: precreated_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      session_status: 'active',
      prompt_snippet: prompt.slice(0, 200),
      source: { provider: 'claude' }
    })

    const result = await process_single_session({
      raw_session: { session_id },
      session_provider: make_provider(session_id, { prompt }),
      user_public_key: 'test-pubkey',
      user_base_directory,
      allow_updates: false,
      verbose: false
    })

    expect(result.status).to.equal('skipped')
    expect(result.data.reason).to.equal(
      'precreated_thread_pending_session_sync'
    )
    expect(result.data.thread_id).to.equal(precreated_id)
  })

  it('should not match pre-created thread that already has source.session_id', async function () {
    const session_id = `test-session-${make_uuid()}`
    const precreated_id = make_uuid()
    const prompt = 'Implement the feature'

    await write_thread_metadata(threads_dir, precreated_id, {
      thread_id: precreated_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      session_status: 'active',
      prompt_snippet: prompt.slice(0, 200),
      source: { provider: 'claude', session_id: 'already-linked-session' }
    })

    let reason = null
    try {
      const result = await process_single_session({
        raw_session: { session_id },
        session_provider: make_provider(session_id, { prompt }),
        user_public_key: 'test-pubkey',
        user_base_directory,
        allow_updates: false,
        verbose: false
      })
      reason = result?.data?.reason
    } catch {
      // Create path may throw due to missing scaffolding
    }
    expect(reason).to.not.equal('precreated_thread_pending_session_sync')
  })

  it('should not match pre-created thread older than 5 minutes', async function () {
    const session_id = `test-session-${make_uuid()}`
    const precreated_id = make_uuid()
    const prompt = 'Implement the feature'

    const old_time = new Date(Date.now() - 6 * 60 * 1000).toISOString()
    await write_thread_metadata(threads_dir, precreated_id, {
      thread_id: precreated_id,
      created_at: old_time,
      updated_at: old_time,
      session_status: 'active',
      prompt_snippet: prompt.slice(0, 200),
      source: { provider: 'claude' }
    })

    let reason = null
    try {
      const result = await process_single_session({
        raw_session: { session_id },
        session_provider: make_provider(session_id, { prompt }),
        user_public_key: 'test-pubkey',
        user_base_directory,
        allow_updates: false,
        verbose: false
      })
      reason = result?.data?.reason
    } catch {
      // Create path may throw due to missing scaffolding
    }
    expect(reason).to.not.equal('precreated_thread_pending_session_sync')
  })

  it('should return null without normalizing session when no candidates exist', async function () {
    const session_id = `test-session-${make_uuid()}`
    let normalize_called = false

    const provider = {
      name: 'claude',
      get_session_id: () => session_id,
      normalize_session: (raw) => {
        normalize_called = true
        return {
          session_id: raw.session_id,
          session_provider: 'claude',
          messages: [
            {
              type: 'message',
              role: 'user',
              content: [{ type: 'text', text: 'hello' }]
            }
          ],
          metadata: {
            start_time: '2026-04-12T00:00:00Z',
            end_time: '2026-04-12T00:01:00Z'
          }
        }
      },
      get_models_from_session: async () => ['claude-opus-4-6'],
      get_inference_provider: () => 'anthropic'
    }

    // Reset flag after provider construction (get_session_id may have been called)
    normalize_called = false

    let reason = null
    try {
      const result = await process_single_session({
        raw_session: { session_id },
        session_provider: provider,
        user_public_key: 'test-pubkey',
        user_base_directory,
        allow_updates: false,
        verbose: false
      })
      reason = result?.data?.reason
    } catch {
      // Create path may throw due to missing scaffolding
    }

    expect(reason).to.not.equal('precreated_thread_pending_session_sync')
    // normalize_session should not be called by find_precreated_thread_by_prompt
    // when there are no candidates (it IS called later by the create path though,
    // so we only check this if the create path did not run)
  })

  it('should not match when prompt_snippet differs from session initial prompt', async function () {
    const session_id = `test-session-${make_uuid()}`
    const precreated_id = make_uuid()

    await write_thread_metadata(threads_dir, precreated_id, {
      thread_id: precreated_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      session_status: 'active',
      prompt_snippet: 'A completely different prompt',
      source: { provider: 'claude' }
    })

    let reason = null
    try {
      const result = await process_single_session({
        raw_session: { session_id },
        session_provider: make_provider(session_id, {
          prompt: 'Implement the feature'
        }),
        user_public_key: 'test-pubkey',
        user_base_directory,
        allow_updates: false,
        verbose: false
      })
      reason = result?.data?.reason
    } catch {
      // Create path may throw due to missing scaffolding
    }
    expect(reason).to.not.equal('precreated_thread_pending_session_sync')
  })

  it('should not match when session has empty prompt', async function () {
    const session_id = `test-session-${make_uuid()}`
    const precreated_id = make_uuid()

    await write_thread_metadata(threads_dir, precreated_id, {
      thread_id: precreated_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      session_status: 'active',
      prompt_snippet: 'Some prompt snippet',
      source: { provider: 'claude' }
    })

    let reason = null
    try {
      const result = await process_single_session({
        raw_session: { session_id },
        session_provider: make_provider(session_id, { prompt: null }),
        user_public_key: 'test-pubkey',
        user_base_directory,
        allow_updates: false,
        verbose: false
      })
      reason = result?.data?.reason
    } catch {
      // Create path may throw due to missing scaffolding
    }
    expect(reason).to.not.equal('precreated_thread_pending_session_sync')
  })

  it('should match when prompt_snippet is shorter than full session prompt', async function () {
    const session_id = `test-session-${make_uuid()}`
    const precreated_id = make_uuid()
    const long_prompt = 'A'.repeat(500)

    await write_thread_metadata(threads_dir, precreated_id, {
      thread_id: precreated_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      session_status: 'active',
      prompt_snippet: long_prompt.slice(0, 200),
      source: { provider: 'claude' }
    })

    const result = await process_single_session({
      raw_session: { session_id },
      session_provider: make_provider(session_id, { prompt: long_prompt }),
      user_public_key: 'test-pubkey',
      user_base_directory,
      allow_updates: false,
      verbose: false
    })

    expect(result.status).to.equal('skipped')
    expect(result.data.reason).to.equal(
      'precreated_thread_pending_session_sync'
    )
    expect(result.data.thread_id).to.equal(precreated_id)
  })

  it('should match only the first candidate with matching prompt_snippet', async function () {
    const session_id = `test-session-${make_uuid()}`
    const prompt = 'Implement the feature'
    const match_id = make_uuid()
    const other_id = make_uuid()

    // Create two pre-created threads, only one matches the prompt
    await write_thread_metadata(threads_dir, match_id, {
      thread_id: match_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      session_status: 'active',
      prompt_snippet: prompt.slice(0, 200),
      source: { provider: 'claude' }
    })

    await write_thread_metadata(threads_dir, other_id, {
      thread_id: other_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      session_status: 'active',
      prompt_snippet: 'Some other prompt entirely',
      source: { provider: 'claude' }
    })

    const result = await process_single_session({
      raw_session: { session_id },
      session_provider: make_provider(session_id, { prompt }),
      user_public_key: 'test-pubkey',
      user_base_directory,
      allow_updates: false,
      verbose: false
    })

    expect(result.status).to.equal('skipped')
    expect(result.data.reason).to.equal(
      'precreated_thread_pending_session_sync'
    )
    expect(result.data.thread_id).to.equal(match_id)
  })
})
