/* global describe it before after */
import { expect } from 'chai'
import { WebSocket } from 'ws'
import path from 'path'
import fs from 'fs/promises'

import {
  subscribe_user_connections_to_thread,
  get_thread_subscribers,
  remove_connection
} from '#libs-server/thread-subscriptions/index.mjs'
import {
  reset_all_tables,
  create_test_user,
  create_temp_test_repo,
  setup_api_test_registry
} from '#tests/utils/index.mjs'

describe('Thread Subscriptions Integration', function () {
  this.timeout(10000)

  let test_repo
  let registry_cleanup
  let test_user
  const thread_id = 'test-thread-resume-flicker'
  const other_thread_id = 'test-thread-other-user'

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()
    test_repo = await create_temp_test_repo()

    // Materialize a thread metadata file owned by test_user so that
    // check_thread_permission() resolves to allowed for that user.
    const thread_dir = path.join(test_repo.user_path, 'thread', thread_id)
    await fs.mkdir(thread_dir, { recursive: true })
    await fs.writeFile(
      path.join(thread_dir, 'metadata.json'),
      JSON.stringify({
        thread_id,
        user_public_key: test_user.user_public_key,
        public_read: false
      })
    )

    const other_dir = path.join(test_repo.user_path, 'thread', other_thread_id)
    await fs.mkdir(other_dir, { recursive: true })
    await fs.writeFile(
      path.join(other_dir, 'metadata.json'),
      JSON.stringify({
        thread_id: other_thread_id,
        user_public_key: 'different-user-key',
        public_read: false
      })
    )

    registry_cleanup = setup_api_test_registry({
      system_base_directory: test_repo.system_path,
      user_base_directory: test_repo.user_path
    })
  })

  after(async () => {
    if (registry_cleanup) registry_cleanup()
    if (test_repo && test_repo.cleanup) test_repo.cleanup()
    await reset_all_tables()
  })

  const create_mock_ws = (user_public_key) => ({
    readyState: WebSocket.OPEN,
    user_public_key,
    is_authenticated: true,
    send: () => {}
  })

  it('subscribes every connection authenticated as the requesting user', async () => {
    const ws_a = create_mock_ws(test_user.user_public_key)
    const ws_b = create_mock_ws(test_user.user_public_key)
    const ws_other = create_mock_ws('different-user-key')

    const fake_wss = { clients: new Set([ws_a, ws_b, ws_other]) }

    await subscribe_user_connections_to_thread({
      wss: fake_wss,
      user_public_key: test_user.user_public_key,
      thread_id
    })

    const subscribers = get_thread_subscribers(thread_id)
    expect(subscribers.has(ws_a)).to.equal(true)
    expect(subscribers.has(ws_b)).to.equal(true)
    expect(subscribers.has(ws_other)).to.equal(false)

    remove_connection(ws_a)
    remove_connection(ws_b)
    remove_connection(ws_other)
  })

  it('does not subscribe connections that fail the permission check', async () => {
    // ws is authenticated as test_user, but the target thread is owned by a
    // different user with public_read=false. subscribe_to_thread denies it.
    const ws = create_mock_ws(test_user.user_public_key)
    const fake_wss = { clients: new Set([ws]) }

    await subscribe_user_connections_to_thread({
      wss: fake_wss,
      user_public_key: test_user.user_public_key,
      thread_id: other_thread_id
    })

    const subscribers = get_thread_subscribers(other_thread_id)
    expect(subscribers.has(ws)).to.equal(false)

    remove_connection(ws)
  })

  it('is a no-op when wss/user_public_key/thread_id is missing', async () => {
    await subscribe_user_connections_to_thread({})
    await subscribe_user_connections_to_thread({
      wss: { clients: new Set() },
      user_public_key: null,
      thread_id
    })
    // No throw is the assertion.
  })
})
