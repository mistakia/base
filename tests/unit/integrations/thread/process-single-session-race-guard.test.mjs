import { expect } from 'chai'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

import { process_single_session } from '#libs-server/integrations/thread/create-threads-from-session-provider.mjs'
import { generate_thread_id_from_session } from '#libs-server/threads/generate-thread-id-from-session.mjs'

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, stdio: ['ignore', 'ignore', 'ignore'] })

const make_provider = (session_id) => ({
  name: 'claude',
  get_session_id: () => session_id,
  normalize_session: (raw) => ({
    session_id: raw.session_id,
    session_provider: 'claude',
    messages: [{ role: 'user', content: 'hi' }],
    metadata: {
      start_time: '2026-04-10T00:00:00Z',
      end_time: '2026-04-10T00:01:00Z'
    }
  }),
  get_models_from_session: async () => ['claude-opus-4-6'],
  get_inference_provider: () => 'anthropic'
})

describe('process_single_session race guard for missing metadata.json', function () {
  this.timeout(15000)

  let user_base_directory
  let thread_submodule_dir
  let session_id
  let thread_id
  let thread_dir

  beforeEach(async function () {
    user_base_directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'race-guard-ub-')
    )
    thread_submodule_dir = path.join(user_base_directory, 'thread')
    await fs.mkdir(thread_submodule_dir, { recursive: true })

    git(thread_submodule_dir, 'init', '-q')
    git(thread_submodule_dir, 'config', 'user.email', 'test@example.com')
    git(thread_submodule_dir, 'config', 'user.name', 'Test')
    git(thread_submodule_dir, 'config', 'commit.gpgsign', 'false')

    session_id = 'race-guard-session-001'
    thread_id = generate_thread_id_from_session({
      session_id,
      session_provider: 'claude'
    })
    thread_dir = path.join(thread_submodule_dir, thread_id)
    await fs.mkdir(thread_dir, { recursive: true })

    const metadata = {
      thread_id,
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
      source: {
        provider: 'claude',
        session_id,
        execution_mode: 'container_user',
        container_user: 'arrin',
        container_name: 'arrin-box'
      }
    }
    await fs.writeFile(
      path.join(thread_dir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    )

    git(thread_submodule_dir, 'add', '.')
    git(thread_submodule_dir, 'commit', '-q', '-m', 'initial thread')

    // Race: metadata.json is transiently missing on disk
    await fs.unlink(path.join(thread_dir, 'metadata.json'))
  })

  afterEach(async function () {
    await fs.rm(user_base_directory, { recursive: true, force: true })
  })

  it('skips the session when thread_dir exists, metadata.json is missing, and git HEAD shows container_user', async function () {
    const result = await process_single_session({
      raw_session: { session_id },
      session_provider: make_provider(session_id),
      user_public_key: 'test-pubkey',
      user_base_directory,
      allow_updates: true,
      verbose: false,
      source_overrides: {
        execution_mode: 'host',
        container_user: null
      }
    })

    expect(result.status).to.equal('skipped')
    expect(result.data.reason).to.equal('thread_dir_exists_metadata_missing')
    expect(result.data.thread_id).to.equal(thread_id)

    // Directory must still be empty -- no recreation happened
    const metadata_exists = await fs
      .access(path.join(thread_dir, 'metadata.json'))
      .then(() => true)
      .catch(() => false)
    expect(metadata_exists).to.equal(false)
  })

  it('does not skip when git HEAD shows non-container_user attribution', async function () {
    // Rewrite HEAD to a host-mode metadata
    await fs.writeFile(
      path.join(thread_dir, 'metadata.json'),
      JSON.stringify(
        {
          thread_id,
          source: {
            provider: 'claude',
            session_id,
            execution_mode: 'host'
          }
        },
        null,
        2
      )
    )
    git(thread_submodule_dir, 'add', '.')
    git(thread_submodule_dir, 'commit', '-q', '-m', 'switch to host')
    await fs.unlink(path.join(thread_dir, 'metadata.json'))

    // Allow the creation path to proceed far enough to not hit the race guard.
    // We don't assert success here (the full create path has many dependencies
    // we don't stand up in this unit test); we assert only that the early
    // skip reason is NOT returned.
    let reason = null
    try {
      const result = await process_single_session({
        raw_session: { session_id },
        session_provider: make_provider(session_id),
        user_public_key: 'test-pubkey',
        user_base_directory,
        allow_updates: false,
        verbose: false
      })
      reason = result?.data?.reason
    } catch {
      // Create path may throw because the test harness lacks the full thread
      // creation scaffolding. What we care about is that the skip reason
      // did NOT fire.
    }
    expect(reason).to.not.equal('thread_dir_exists_metadata_missing')
  })
})
