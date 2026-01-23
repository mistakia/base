import { expect } from 'chai'

import {
  subscribe_to_file,
  unsubscribe_from_file,
  get_file_subscribers,
  remove_connection,
  get_subscriptions
} from '#libs-server/file-subscriptions/subscription-manager.mjs'

describe('File Subscription Manager', () => {
  // Create mock WebSocket objects for testing
  const create_mock_ws = () => ({
    readyState: 1, // OPEN
    send: () => {}
  })

  // Clean up subscriptions between tests by removing all connections
  afterEach(() => {
    // Create fresh mock connections for next test
  })

  describe('subscribe_to_file', () => {
    it('should add path to connection subscriptions', () => {
      const ws = create_mock_ws()
      subscribe_to_file({ ws, path: 'task/test.md' })

      const subscriptions = get_subscriptions(ws)
      expect(subscriptions.has('task/test.md')).to.be.true

      // Cleanup
      remove_connection(ws)
    })

    it('should normalize paths by removing leading slash', () => {
      const ws = create_mock_ws()
      subscribe_to_file({ ws, path: '/task/test.md' })

      const subscriptions = get_subscriptions(ws)
      expect(subscriptions.has('task/test.md')).to.be.true

      // Cleanup
      remove_connection(ws)
    })

    it('should add connection to path subscribers', () => {
      const ws = create_mock_ws()
      subscribe_to_file({ ws, path: 'task/test.md' })

      const subscribers = get_file_subscribers('task/test.md')
      expect(subscribers).to.include(ws)

      // Cleanup
      remove_connection(ws)
    })

    it('should handle multiple connections subscribing to same path', () => {
      const ws1 = create_mock_ws()
      const ws2 = create_mock_ws()

      subscribe_to_file({ ws: ws1, path: 'task/shared.md' })
      subscribe_to_file({ ws: ws2, path: 'task/shared.md' })

      const subscribers = get_file_subscribers('task/shared.md')
      expect(subscribers).to.have.lengthOf(2)
      expect(subscribers).to.include(ws1)
      expect(subscribers).to.include(ws2)

      // Cleanup
      remove_connection(ws1)
      remove_connection(ws2)
    })

    it('should handle connection subscribing to multiple paths', () => {
      const ws = create_mock_ws()

      subscribe_to_file({ ws, path: 'task/file1.md' })
      subscribe_to_file({ ws, path: 'task/file2.md' })
      subscribe_to_file({ ws, path: 'guideline/file3.md' })

      const subscriptions = get_subscriptions(ws)
      expect(subscriptions.size).to.equal(3)
      expect(subscriptions.has('task/file1.md')).to.be.true
      expect(subscriptions.has('task/file2.md')).to.be.true
      expect(subscriptions.has('guideline/file3.md')).to.be.true

      // Cleanup
      remove_connection(ws)
    })

    it('should ignore invalid ws', () => {
      subscribe_to_file({ ws: null, path: 'task/test.md' })

      const subscribers = get_file_subscribers('task/test.md')
      expect(subscribers).to.have.lengthOf(0)
    })

    it('should ignore invalid path', () => {
      const ws = create_mock_ws()
      subscribe_to_file({ ws, path: null })

      const subscriptions = get_subscriptions(ws)
      expect(subscriptions.size).to.equal(0)
    })
  })

  describe('unsubscribe_from_file', () => {
    it('should remove path from connection subscriptions', () => {
      const ws = create_mock_ws()

      subscribe_to_file({ ws, path: 'task/test.md' })
      unsubscribe_from_file({ ws, path: 'task/test.md' })

      const subscriptions = get_subscriptions(ws)
      expect(subscriptions.has('task/test.md')).to.be.false

      // Cleanup
      remove_connection(ws)
    })

    it('should remove connection from path subscribers', () => {
      const ws = create_mock_ws()

      subscribe_to_file({ ws, path: 'task/test.md' })
      unsubscribe_from_file({ ws, path: 'task/test.md' })

      const subscribers = get_file_subscribers('task/test.md')
      expect(subscribers).to.not.include(ws)
    })

    it('should normalize paths by removing leading slash', () => {
      const ws = create_mock_ws()

      subscribe_to_file({ ws, path: 'task/test.md' })
      unsubscribe_from_file({ ws, path: '/task/test.md' })

      const subscriptions = get_subscriptions(ws)
      expect(subscriptions.has('task/test.md')).to.be.false

      // Cleanup
      remove_connection(ws)
    })

    it('should not affect other subscriptions', () => {
      const ws = create_mock_ws()

      subscribe_to_file({ ws, path: 'task/file1.md' })
      subscribe_to_file({ ws, path: 'task/file2.md' })
      unsubscribe_from_file({ ws, path: 'task/file1.md' })

      const subscriptions = get_subscriptions(ws)
      expect(subscriptions.size).to.equal(1)
      expect(subscriptions.has('task/file2.md')).to.be.true

      // Cleanup
      remove_connection(ws)
    })

    it('should not affect other connections', () => {
      const ws1 = create_mock_ws()
      const ws2 = create_mock_ws()

      subscribe_to_file({ ws: ws1, path: 'task/shared.md' })
      subscribe_to_file({ ws: ws2, path: 'task/shared.md' })
      unsubscribe_from_file({ ws: ws1, path: 'task/shared.md' })

      const subscribers = get_file_subscribers('task/shared.md')
      expect(subscribers).to.have.lengthOf(1)
      expect(subscribers).to.include(ws2)

      // Cleanup
      remove_connection(ws1)
      remove_connection(ws2)
    })
  })

  describe('get_file_subscribers', () => {
    it('should return empty array for path with no subscribers', () => {
      const subscribers = get_file_subscribers('nonexistent/path.md')
      expect(subscribers).to.be.an('array')
      expect(subscribers).to.have.lengthOf(0)
    })

    it('should return empty array for null path', () => {
      const subscribers = get_file_subscribers(null)
      expect(subscribers).to.be.an('array')
      expect(subscribers).to.have.lengthOf(0)
    })

    it('should normalize path when looking up subscribers', () => {
      const ws = create_mock_ws()

      subscribe_to_file({ ws, path: 'task/test.md' })

      const subscribers = get_file_subscribers('/task/test.md')
      expect(subscribers).to.include(ws)

      // Cleanup
      remove_connection(ws)
    })
  })

  describe('remove_connection', () => {
    it('should remove all subscriptions for a connection', () => {
      const ws = create_mock_ws()

      subscribe_to_file({ ws, path: 'task/file1.md' })
      subscribe_to_file({ ws, path: 'task/file2.md' })
      subscribe_to_file({ ws, path: 'guideline/file3.md' })

      remove_connection(ws)

      const subscriptions = get_subscriptions(ws)
      expect(subscriptions.size).to.equal(0)
    })

    it('should remove connection from all path subscriber sets', () => {
      const ws = create_mock_ws()

      subscribe_to_file({ ws, path: 'task/file1.md' })
      subscribe_to_file({ ws, path: 'task/file2.md' })

      remove_connection(ws)

      expect(get_file_subscribers('task/file1.md')).to.have.lengthOf(0)
      expect(get_file_subscribers('task/file2.md')).to.have.lengthOf(0)
    })

    it('should not affect other connections', () => {
      const ws1 = create_mock_ws()
      const ws2 = create_mock_ws()

      subscribe_to_file({ ws: ws1, path: 'task/shared.md' })
      subscribe_to_file({ ws: ws2, path: 'task/shared.md' })

      remove_connection(ws1)

      const subscribers = get_file_subscribers('task/shared.md')
      expect(subscribers).to.have.lengthOf(1)
      expect(subscribers).to.include(ws2)

      // Cleanup
      remove_connection(ws2)
    })

    it('should handle null ws gracefully', () => {
      // Should not throw
      remove_connection(null)
    })

    it('should handle ws with no subscriptions gracefully', () => {
      const ws = create_mock_ws()
      // Should not throw
      remove_connection(ws)
    })
  })

  describe('get_subscriptions', () => {
    it('should return empty Set for new connection', () => {
      const ws = create_mock_ws()
      const subscriptions = get_subscriptions(ws)
      expect(subscriptions).to.be.instanceOf(Set)
      expect(subscriptions.size).to.equal(0)
    })

    it('should return empty Set for null ws', () => {
      const subscriptions = get_subscriptions(null)
      expect(subscriptions).to.be.instanceOf(Set)
      expect(subscriptions.size).to.equal(0)
    })
  })
})
