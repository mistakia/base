import { describe, it, beforeEach, afterEach } from 'mocha'
import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

import { process_single_session } from '#libs-server/integrations/thread/create-threads-from-session-provider.mjs'
import { create_temp_test_repo } from '#tests/utils/index.mjs'

/**
 * Minimal mock session provider that uses 'claude' as the provider name so
 * that save_raw_session_data recognizes it. This satisfies the interface
 * expected by process_single_session without pulling in real provider
 * dependencies.
 */
const create_mock_session_provider = () => ({
  name: 'claude',

  get_session_id(raw_session) {
    return raw_session.session_id
  },

  normalize_session(raw_session) {
    return {
      session_id: raw_session.session_id,
      session_provider: 'claude',
      messages: raw_session.messages || [],
      metadata: raw_session.metadata || {}
    }
  },

  validate_session() {
    return { valid: true, errors: [] }
  },

  get_inference_provider() {
    return 'claude'
  },

  async get_models_from_session() {
    return ['claude-sonnet-4-20250514']
  }
})

/**
 * Create a minimal metadata.json that update_existing_thread can read and
 * update without errors. Mirrors the structure produced by
 * create_thread_from_session.
 */
const create_minimal_metadata = ({
  thread_id,
  session_id,
  provider = 'mock'
}) => ({
  thread_id,
  thread_state: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  message_count: 1,
  tool_call_count: 0,
  user_message_count: 1,
  assistant_message_count: 0,
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  source: {
    provider,
    session_id,
    imported_at: new Date().toISOString(),
    raw_data_saved: false,
    provider_metadata: {}
  }
})

describe('process_single_session - known_thread_id routing', function () {
  this.timeout(15000)

  let temp_repo
  let user_base_directory

  beforeEach(async function () {
    temp_repo = await create_temp_test_repo({
      prefix: 'known-thread-id-',
      register_directories: true
    })
    user_base_directory = temp_repo.user_path

    // Ensure the thread directory root exists
    await fs.mkdir(path.join(user_base_directory, 'thread'), { recursive: true })
  })

  afterEach(async function () {
    if (temp_repo) {
      temp_repo.cleanup()
    }
  })

  describe('when known_thread_id is set', () => {
    it('should skip check_thread_exists and route directly to update_existing_session_thread', async () => {
      const thread_id = crypto.randomUUID()
      const session_id = 'test-session-known-route'
      const thread_dir = path.join(user_base_directory, 'thread', thread_id)

      // Pre-create the thread directory with valid metadata so the update
      // path can read and modify it
      await fs.mkdir(thread_dir, { recursive: true })
      await fs.writeFile(
        path.join(thread_dir, 'metadata.json'),
        JSON.stringify(
          create_minimal_metadata({ thread_id, session_id }),
          null,
          2
        )
      )

      const raw_session = {
        session_id,
        messages: [
          {
            role: 'user',
            content: 'Hello from known thread test',
            timestamp: new Date().toISOString()
          },
          {
            role: 'assistant',
            content: 'Response from assistant',
            timestamp: new Date().toISOString()
          }
        ],
        metadata: {}
      }

      const result = await process_single_session({
        raw_session,
        session_provider: create_mock_session_provider(),
        user_public_key: 'test-public-key',
        user_base_directory,
        allow_updates: true,
        verbose: false,
        known_thread_id: thread_id
      })

      // Should produce an 'updated' result, not 'created' or 'skipped'
      expect(result).to.have.property('status', 'updated')
      expect(result.data).to.have.property('thread_id', thread_id)
      expect(result.data).to.have.property('session_id', session_id)
    })

    it('should use the provided known_thread_id regardless of what check_thread_exists would return', async () => {
      // Use a completely different session_id than what the deterministic
      // lookup would produce -- the known_thread_id path must not call
      // check_thread_exists at all, so the session_id-to-thread_id mapping
      // is irrelevant.
      const thread_id = crypto.randomUUID()
      const session_id = 'session-that-would-not-match-' + crypto.randomUUID()
      const thread_dir = path.join(user_base_directory, 'thread', thread_id)

      await fs.mkdir(thread_dir, { recursive: true })
      await fs.writeFile(
        path.join(thread_dir, 'metadata.json'),
        JSON.stringify(
          create_minimal_metadata({ thread_id, session_id }),
          null,
          2
        )
      )

      const raw_session = {
        session_id,
        messages: [],
        metadata: {}
      }

      const result = await process_single_session({
        raw_session,
        session_provider: create_mock_session_provider(),
        user_public_key: 'test-public-key',
        user_base_directory,
        allow_updates: true,
        verbose: false,
        known_thread_id: thread_id
      })

      expect(result.status).to.equal('updated')
      expect(result.data.thread_id).to.equal(thread_id)
    })
  })

  describe('when known_thread_id is NOT set', () => {
    it('should use the deterministic check_thread_exists lookup (backward compat)', async () => {
      // When known_thread_id is null the function falls through to
      // check_thread_exists which hashes the session_id. Since we have NOT
      // pre-created a thread directory for that hash, the result should be
      // a 'created' status (new thread).
      const session_id = 'session-for-deterministic-lookup'

      const raw_session = {
        session_id,
        messages: [
          {
            role: 'user',
            content: 'First message',
            timestamp: new Date().toISOString()
          },
          {
            role: 'assistant',
            content: 'Reply',
            timestamp: new Date().toISOString()
          }
        ],
        metadata: {
          start_time: new Date().toISOString(),
          end_time: new Date().toISOString()
        }
      }

      const result = await process_single_session({
        raw_session,
        session_provider: create_mock_session_provider(),
        user_public_key: 'test-public-key',
        user_base_directory,
        allow_updates: false,
        verbose: false,
        known_thread_id: null
      })

      // Without known_thread_id, and no pre-existing thread directory,
      // the function should create a new thread via the deterministic path
      expect(result).to.have.property('status', 'created')
      expect(result.data).to.have.property('session_id', session_id)
      expect(result.data).to.have.property('thread_id').that.is.a('string')
      expect(result.data).to.have.property('thread_dir').that.is.a('string')
    })

    it('should skip an existing thread when allow_updates is false', async () => {
      const session_id = 'session-for-skip-test'

      const raw_session = {
        session_id,
        messages: [
          {
            role: 'user',
            content: 'Hello',
            timestamp: new Date().toISOString()
          },
          {
            role: 'assistant',
            content: 'Hi',
            timestamp: new Date().toISOString()
          }
        ],
        metadata: {
          start_time: new Date().toISOString(),
          end_time: new Date().toISOString()
        }
      }

      const provider = create_mock_session_provider()

      // First call creates the thread
      const create_result = await process_single_session({
        raw_session,
        session_provider: provider,
        user_public_key: 'test-public-key',
        user_base_directory,
        allow_updates: false,
        verbose: false,
        known_thread_id: null
      })
      expect(create_result.status).to.equal('created')

      // Second call should skip since the thread now exists
      const skip_result = await process_single_session({
        raw_session,
        session_provider: provider,
        user_public_key: 'test-public-key',
        user_base_directory,
        allow_updates: false,
        verbose: false,
        known_thread_id: null
      })

      expect(skip_result).to.have.property('status', 'skipped')
      expect(skip_result.data).to.have.property(
        'reason',
        'thread_already_exists'
      )
    })
  })

  describe('when known_thread_id points to a non-existent directory', () => {
    it('should throw because update_existing_thread cannot read metadata.json', async () => {
      // The known_thread_id path calls update_existing_session_thread
      // directly, which invokes update_existing_thread. That function
      // reads metadata.json from the thread_dir. When the directory does
      // not exist, the read will throw an ENOENT error. This is expected
      // behavior -- the caller is responsible for ensuring the thread_id
      // points to a valid pre-created thread.
      const non_existent_thread_id = crypto.randomUUID()
      const session_id = 'session-for-missing-thread'

      const raw_session = {
        session_id,
        messages: [],
        metadata: {}
      }

      let threw = false
      try {
        await process_single_session({
          raw_session,
          session_provider: create_mock_session_provider(),
          user_public_key: 'test-public-key',
          user_base_directory,
          allow_updates: true,
          verbose: false,
          known_thread_id: non_existent_thread_id
        })
      } catch (error) {
        threw = true
        // The error should originate from trying to read metadata.json
        // in the non-existent thread directory
        expect(error.message).to.include('ENOENT')
      }

      expect(threw).to.be.true
    })
  })
})
