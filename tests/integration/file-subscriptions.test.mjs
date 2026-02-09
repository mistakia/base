/* global describe it beforeEach afterEach before after */
import { expect } from 'chai'
import { WebSocket } from 'ws'
import path from 'path'
import fs from 'fs/promises'

import {
  subscribe_to_file,
  unsubscribe_from_file,
  get_file_subscribers,
  remove_connection,
  emit_file_changed,
  emit_file_deleted
} from '#libs-server/file-subscriptions/index.mjs'
import {
  reset_all_tables,
  create_test_user,
  create_temp_test_repo,
  setup_api_test_registry
} from '#tests/utils/index.mjs'

describe('File Subscriptions Integration', function () {
  this.timeout(10000)

  let test_repo
  let registry_cleanup
  let test_user

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()

    // Set up temporary repo for filesystem operations
    test_repo = await create_temp_test_repo()

    // Create task directory and test files owned by test user
    await fs.mkdir(path.join(test_repo.user_path, 'task'), { recursive: true })
    await fs.mkdir(path.join(test_repo.user_path, 'guideline'), { recursive: true })

    // Create test files with proper ownership (public_read: true for testing)
    const test_file_content = `---
title: Test File
type: text
public_read: true
user_public_key: ${test_user.user_public_key}
---

Test content
`
    await fs.writeFile(
      path.join(test_repo.user_path, 'task', 'test.md'),
      test_file_content
    )
    await fs.writeFile(
      path.join(test_repo.user_path, 'task', 'shared.md'),
      test_file_content
    )
    await fs.writeFile(
      path.join(test_repo.user_path, 'task', 'file1.md'),
      test_file_content
    )
    await fs.writeFile(
      path.join(test_repo.user_path, 'task', 'file2.md'),
      test_file_content
    )
    await fs.writeFile(
      path.join(test_repo.user_path, 'guideline', 'file3.md'),
      test_file_content
    )

    // Setup registry for API calls
    registry_cleanup = setup_api_test_registry({
      system_base_directory: test_repo.system_path,
      user_base_directory: test_repo.user_path
    })
  })

  after(async () => {
    if (registry_cleanup) {
      registry_cleanup()
    }

    if (test_repo && test_repo.cleanup) {
      test_repo.cleanup()
    }

    await reset_all_tables()
  })

  // Create mock WebSocket objects with message capture and authentication
  const create_mock_ws = (options = {}) => {
    const messages = []
    return {
      readyState: WebSocket.OPEN,
      user_public_key: options.user_public_key || test_user?.user_public_key || null,
      is_authenticated: options.is_authenticated !== false,
      send: (data) => {
        messages.push(JSON.parse(data))
      },
      messages,
      get_last_message: () => messages[messages.length - 1],
      clear_messages: () => (messages.length = 0)
    }
  }

  describe('Subscription and Event Flow', () => {
    let ws1, ws2

    beforeEach(() => {
      ws1 = create_mock_ws()
      ws2 = create_mock_ws()
    })

    afterEach(() => {
      remove_connection(ws1)
      remove_connection(ws2)
    })

    it('should send FILE_CHANGED event only to subscribed clients', async () => {
      // ws1 subscribes, ws2 does not
      subscribe_to_file({ ws: ws1, path: 'task/test.md' })

      // Emit file changed event
      const notified_count = await emit_file_changed('task/test.md')

      // Only ws1 should receive the event
      expect(notified_count).to.equal(1)
      expect(ws1.messages).to.have.lengthOf(1)
      expect(ws1.get_last_message()).to.deep.equal({
        type: 'FILE_CHANGED',
        payload: { path: 'task/test.md' }
      })
      expect(ws2.messages).to.have.lengthOf(0)
    })

    it('should send FILE_DELETED event only to subscribed clients', async () => {
      subscribe_to_file({ ws: ws1, path: 'task/test.md' })

      const notified_count = await emit_file_deleted('task/test.md')

      expect(notified_count).to.equal(1)
      expect(ws1.get_last_message()).to.deep.equal({
        type: 'FILE_DELETED',
        payload: { path: 'task/test.md' }
      })
      expect(ws2.messages).to.have.lengthOf(0)
    })

    it('should send events to multiple subscribers', async () => {
      subscribe_to_file({ ws: ws1, path: 'task/shared.md' })
      subscribe_to_file({ ws: ws2, path: 'task/shared.md' })

      const notified_count = await emit_file_changed('task/shared.md')

      expect(notified_count).to.equal(2)
      expect(ws1.messages).to.have.lengthOf(1)
      expect(ws2.messages).to.have.lengthOf(1)
    })

    it('should not send events after unsubscription', async () => {
      subscribe_to_file({ ws: ws1, path: 'task/test.md' })
      unsubscribe_from_file({ ws: ws1, path: 'task/test.md' })

      const notified_count = await emit_file_changed('task/test.md')

      expect(notified_count).to.equal(0)
      expect(ws1.messages).to.have.lengthOf(0)
    })

    it('should stop sending events after connection removal', async () => {
      subscribe_to_file({ ws: ws1, path: 'task/test.md' })
      remove_connection(ws1)

      const notified_count = await emit_file_changed('task/test.md')

      expect(notified_count).to.equal(0)
    })

    it('should handle path normalization consistently', async () => {
      // Subscribe with leading slash
      subscribe_to_file({ ws: ws1, path: '/task/test.md' })

      // Emit without leading slash
      const notified_count = await emit_file_changed('task/test.md')

      expect(notified_count).to.equal(1)
      expect(ws1.messages).to.have.lengthOf(1)
    })

    it('should return 0 when no subscribers for path', async () => {
      const notified_count = await emit_file_changed('nonexistent/path.md')
      expect(notified_count).to.equal(0)
    })
  })

  describe('Connection Lifecycle', () => {
    it('should clean up all subscriptions when connection is removed', () => {
      const ws = create_mock_ws()

      subscribe_to_file({ ws, path: 'task/file1.md' })
      subscribe_to_file({ ws, path: 'task/file2.md' })
      subscribe_to_file({ ws, path: 'guideline/file3.md' })

      // Verify subscriptions exist
      expect(get_file_subscribers('task/file1.md')).to.include(ws)
      expect(get_file_subscribers('task/file2.md')).to.include(ws)
      expect(get_file_subscribers('guideline/file3.md')).to.include(ws)

      // Remove connection (simulating WebSocket close)
      remove_connection(ws)

      // Verify all subscriptions are cleaned up
      expect(get_file_subscribers('task/file1.md')).to.have.lengthOf(0)
      expect(get_file_subscribers('task/file2.md')).to.have.lengthOf(0)
      expect(get_file_subscribers('guideline/file3.md')).to.have.lengthOf(0)
    })

    it('should not affect other connections when one disconnects', async () => {
      const ws1 = create_mock_ws()
      const ws2 = create_mock_ws()

      subscribe_to_file({ ws: ws1, path: 'task/shared.md' })
      subscribe_to_file({ ws: ws2, path: 'task/shared.md' })

      remove_connection(ws1)

      // ws2 should still be subscribed
      const subscribers = get_file_subscribers('task/shared.md')
      expect(subscribers).to.have.lengthOf(1)
      expect(subscribers).to.include(ws2)

      // ws2 should still receive events
      const notified_count = await emit_file_changed('task/shared.md')
      expect(notified_count).to.equal(1)
      expect(ws2.messages).to.have.lengthOf(1)

      // Cleanup
      remove_connection(ws2)
    })
  })

  describe('Error Handling', () => {
    it('should handle WebSocket in non-OPEN state', async () => {
      const ws = create_mock_ws()
      ws.readyState = WebSocket.CLOSED

      subscribe_to_file({ ws, path: 'task/test.md' })

      // Should not throw, but should not send
      const notified_count = await emit_file_changed('task/test.md')
      expect(notified_count).to.equal(0)

      // Cleanup
      remove_connection(ws)
    })

    it('should handle send errors gracefully', async () => {
      const ws = create_mock_ws()
      ws.send = () => {
        throw new Error('Send failed')
      }

      subscribe_to_file({ ws, path: 'task/test.md' })

      // Should not throw, should return 0
      const notified_count = await emit_file_changed('task/test.md')
      expect(notified_count).to.equal(0)

      // Cleanup
      remove_connection(ws)
    })

    it('should handle null/undefined paths in emit functions', async () => {
      expect(await emit_file_changed(null)).to.equal(0)
      expect(await emit_file_changed(undefined)).to.equal(0)
      expect(await emit_file_deleted(null)).to.equal(0)
      expect(await emit_file_deleted(undefined)).to.equal(0)
    })
  })
})
