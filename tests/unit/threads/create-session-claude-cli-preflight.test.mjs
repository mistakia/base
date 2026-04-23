import { describe, it, afterEach } from 'mocha'
import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'

import { assert_live_session_file_exists } from '#libs-server/threads/create-session-claude-cli.mjs'
import { resolve_account_host_path } from '#libs-server/threads/user-container-manager.mjs'

const SESSION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const WORKING_DIRECTORY = '/tmp/test-project'

const unique_username = () =>
  `preflight-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const expected_path_for = ({ username, claude_config_dir }) =>
  path.join(
    resolve_account_host_path({
      username,
      container_config_dir: claude_config_dir
    }),
    'projects',
    WORKING_DIRECTORY.replace(/\//g, '-'),
    `${SESSION_ID}.jsonl`
  )

describe('create_session_claude_cli pre-flight resume gate', function () {
  this.timeout(10000)

  const cleanup_paths = []

  afterEach(async () => {
    while (cleanup_paths.length) {
      const p = cleanup_paths.pop()
      await fs.rm(p, { recursive: true, force: true })
    }
  })

  it('rejects with descriptive error when live session file is missing (primary account)', async () => {
    const username = unique_username()
    const claude_config_dir = '/home/node/.claude'

    let error
    try {
      await assert_live_session_file_exists({
        session_id: SESSION_ID,
        username,
        claude_config_dir,
        working_directory: WORKING_DIRECTORY
      })
    } catch (err) {
      error = err
    }

    expect(error, 'expected rejection').to.be.an('error')
    expect(error.message).to.include('Pre-flight resume check failed')
    expect(error.message).to.include('account_namespace=primary')
    expect(error.message).to.include(`session_id=${SESSION_ID}`)
    expect(error.message).to.include(`claude_config_dir=${claude_config_dir}`)
    expect(error.message).to.include(
      `expected_path=${expected_path_for({ username, claude_config_dir })}`
    )
  })

  it('surfaces the secondary account namespace in the rejection message', async () => {
    const username = unique_username()
    const claude_config_dir = '/home/node/.claude-earn.crop.code'

    let error
    try {
      await assert_live_session_file_exists({
        session_id: SESSION_ID,
        username,
        claude_config_dir,
        working_directory: WORKING_DIRECTORY
      })
    } catch (err) {
      error = err
    }

    expect(error, 'expected rejection').to.be.an('error')
    expect(error.message).to.include('account_namespace=claude-earn.crop.code')
    expect(error.message).to.include(`claude_config_dir=${claude_config_dir}`)
  })

  it('falls back to (default) marker when claude_config_dir is null', async () => {
    const username = unique_username()

    let error
    try {
      await assert_live_session_file_exists({
        session_id: SESSION_ID,
        username,
        claude_config_dir: null,
        working_directory: WORKING_DIRECTORY
      })
    } catch (err) {
      error = err
    }

    expect(error, 'expected rejection').to.be.an('error')
    expect(error.message).to.include('claude_config_dir=(default)')
    expect(error.message).to.include('account_namespace=primary')
  })

  it('resolves cleanly when the live session file exists', async () => {
    const username = unique_username()
    const claude_config_dir = '/home/node/.claude'
    const target = expected_path_for({ username, claude_config_dir })

    // Track the per-user root for cleanup.
    const user_root = path.dirname(
      resolve_account_host_path({
        username,
        container_config_dir: claude_config_dir
      })
    )
    cleanup_paths.push(user_root)

    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, 'placeholder\n')

    await assert_live_session_file_exists({
      session_id: SESSION_ID,
      username,
      claude_config_dir,
      working_directory: WORKING_DIRECTORY
    })
  })
})
