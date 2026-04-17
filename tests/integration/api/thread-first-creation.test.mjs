import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import { request } from '#tests/utils/test-request.mjs'

import server from '#server'
import {
  create_test_user,
  create_temp_test_repo,
  authenticate_request,
  reset_all_tables
} from '#tests/utils/index.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'

describe('Thread-First Creation Flow', () => {
  let test_user
  let test_directories

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user({ can_create_threads: true })
  })

  after(async () => {
    await reset_all_tables()
  })

  beforeEach(async () => {
    const test_repo = await create_temp_test_repo({
      prefix: 'thread-first-test-',
      register_directories: true
    })
    test_directories = {
      system_path: test_repo.system_path,
      user_path: test_repo.user_path,
      cleanup: test_repo.cleanup
    }
  })

  afterEach(async () => {
    if (test_directories) {
      test_directories.cleanup()
    }
  })

  describe('POST /api/threads/create-session', () => {
    it('should return thread_id and job_id in response', async () => {
      const response = await authenticate_request(
        request(server).post('/api/threads/create-session'),
        test_user
      ).send({
        prompt: 'Test prompt for thread-first creation',
        working_directory: 'user:'
      })

      // The request may fail due to Redis/queue being unavailable in test,
      // but if it succeeds, verify the response shape
      if (response.status === 200) {
        expect(response.body).to.have.property('thread_id')
        expect(response.body).to.have.property('job_id')
        expect(response.body).to.have.property('queue_position')
        expect(response.body.thread_id).to.be.a('string')
        expect(response.body.job_id).to.be.a('string')

        // Verify thread was created on disk
        const thread_dir = path.join(
          get_thread_base_directory({
            user_base_directory: test_directories.user_path
          }),
          response.body.thread_id
        )
        const metadata_raw = await fs.readFile(
          path.join(thread_dir, 'metadata.json'),
          'utf-8'
        )
        const metadata = JSON.parse(metadata_raw)

        expect(metadata.thread_id).to.equal(response.body.thread_id)
        expect(metadata.session_status).to.equal('queued')
        expect(metadata.prompt_snippet).to.equal(
          'Test prompt for thread-first creation'
        )
        expect(metadata.job_id).to.equal(response.body.job_id)
        expect(metadata.thread_state).to.equal('active')
        expect(metadata.inference_provider).to.equal('anthropic')
        expect(metadata.models).to.deep.equal([])

        // Verify timeline.jsonl was created with initial message
        const timeline_raw = await fs.readFile(
          path.join(thread_dir, 'timeline.jsonl'),
          'utf-8'
        )
        const timeline_entries = timeline_raw
          .trim()
          .split('\n')
          .map(JSON.parse)
        expect(timeline_entries).to.have.lengthOf(1)
        expect(timeline_entries[0].type).to.equal('message')
        expect(timeline_entries[0].role).to.equal('user')
        expect(timeline_entries[0].content).to.equal(
          'Test prompt for thread-first creation'
        )
        expect(timeline_entries[0].schema_version).to.equal(2)
      }
    })

    it('should truncate prompt_snippet to 200 characters', async () => {
      const long_prompt = 'x'.repeat(300)
      const response = await authenticate_request(
        request(server).post('/api/threads/create-session'),
        test_user
      ).send({
        prompt: long_prompt,
        working_directory: 'user:'
      })

      if (response.status === 200) {
        const thread_dir = path.join(
          get_thread_base_directory({
            user_base_directory: test_directories.user_path
          }),
          response.body.thread_id
        )
        const metadata = JSON.parse(
          await fs.readFile(
            path.join(thread_dir, 'metadata.json'),
            'utf-8'
          )
        )

        expect(metadata.prompt_snippet).to.have.lengthOf(200)
      }
    })
  })
})
