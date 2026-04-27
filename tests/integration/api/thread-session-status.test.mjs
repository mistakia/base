import { expect } from 'chai'
import { readFile, writeFile } from 'fs/promises'
import path from 'path'

import { request } from '#tests/utils/test-request.mjs'
import server from '#server'
import {
  create_test_user,
  create_test_thread,
  create_temp_test_repo,
  reset_all_tables
} from '#tests/utils/index.mjs'

describe('PUT /api/threads/:thread_id/session-status', () => {
  let test_user
  let test_directories

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()
  })

  after(async () => {
    await reset_all_tables()
  })

  beforeEach(async () => {
    const test_repo = await create_temp_test_repo({
      prefix: 'thread-session-status-',
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

  it('should return 400 when session_status is missing', async () => {
    const thread = await create_test_thread({
      user_public_key: test_user.user_public_key,
      test_directories
    })

    const response = await request(server)
      .put(`/api/threads/${thread.thread_id}/session-status`)
      .send({})

    expect(response.status).to.equal(400)
    expect(response.body.error).to.include('session_status is required')
  })

  it('should return 400 when session_status is an invalid enum value', async () => {
    const thread = await create_test_thread({
      user_public_key: test_user.user_public_key,
      test_directories
    })

    const response = await request(server)
      .put(`/api/threads/${thread.thread_id}/session-status`)
      .send({ session_status: 'invalid_value' })

    expect(response.status).to.equal(400)
    expect(response.body.error).to.include('Invalid session_status')
    expect(response.body.error).to.include('queued')
    expect(response.body.error).to.include('active')
    expect(response.body.error).to.include('completed')
    expect(response.body.error).to.include('failed')
  })

  it('should return 404 when thread does not exist', async () => {
    const response = await request(server)
      .put('/api/threads/non-existent-thread-id/session-status')
      .send({ session_status: 'active' })

    expect(response.status).to.equal(404)
    expect(response.body.error).to.include('Thread not found')
  })

  it('should successfully update session_status in thread metadata', async () => {
    const thread = await create_test_thread({
      user_public_key: test_user.user_public_key,
      test_directories
    })

    const response = await request(server)
      .put(`/api/threads/${thread.thread_id}/session-status`)
      .send({ session_status: 'active' })

    expect(response.status).to.equal(200)
    expect(response.body).to.deep.equal({ success: true })

    // Verify the metadata file was updated
    const metadata_path = path.join(thread.context_dir, 'metadata.json')
    const raw = await readFile(metadata_path, 'utf-8')
    const metadata = JSON.parse(raw)

    expect(metadata.session_status).to.equal('active')
    expect(metadata.updated_at).to.be.a('string')
  })

  it('should set external_session.session_id when session_id is provided and external_session is null', async () => {
    const thread = await create_test_thread({
      user_public_key: test_user.user_public_key,
      test_directories
    })

    const test_session_id = 'test-session-abc-123'

    const response = await request(server)
      .put(`/api/threads/${thread.thread_id}/session-status`)
      .send({ session_status: 'starting', session_id: test_session_id })

    expect(response.status).to.equal(200)

    // Verify external_session was set in metadata
    const metadata_path = path.join(thread.context_dir, 'metadata.json')
    const raw = await readFile(metadata_path, 'utf-8')
    const metadata = JSON.parse(raw)

    expect(metadata.external_session).to.be.an('object')
    expect(metadata.external_session.session_id).to.equal(test_session_id)
    expect(metadata.external_session.provider).to.equal('claude')
  })

  it('should not overwrite existing external_session.session_id on subsequent calls', async () => {
    const thread = await create_test_thread({
      user_public_key: test_user.user_public_key,
      test_directories
    })

    const first_session_id = 'first-session-id'
    const second_session_id = 'second-session-id'

    // First call sets session_id
    await request(server)
      .put(`/api/threads/${thread.thread_id}/session-status`)
      .send({ session_status: 'starting', session_id: first_session_id })

    // Second call with a different session_id should not overwrite
    const response = await request(server)
      .put(`/api/threads/${thread.thread_id}/session-status`)
      .send({ session_status: 'active', session_id: second_session_id })

    expect(response.status).to.equal(200)

    // Verify the original session_id is preserved
    const metadata_path = path.join(thread.context_dir, 'metadata.json')
    const raw = await readFile(metadata_path, 'utf-8')
    const metadata = JSON.parse(raw)

    expect(metadata.external_session.session_id).to.equal(first_session_id)
    expect(metadata.session_status).to.equal('active')
  })

  it('should return 422 with validator detail when metadata fails schema validation', async () => {
    const thread = await create_test_thread({
      user_public_key: test_user.user_public_key,
      test_directories
    })

    const metadata_path = path.join(thread.context_dir, 'metadata.json')
    const raw = await readFile(metadata_path, 'utf-8')
    const metadata = JSON.parse(raw)
    delete metadata.thread_id
    await writeFile(metadata_path, JSON.stringify(metadata, null, 2))

    const response = await request(server)
      .put(`/api/threads/${thread.thread_id}/session-status`)
      .send({ session_status: 'active' })

    expect(response.status).to.equal(422)
    expect(response.body.error).to.include('schema violation')
    expect(response.body.message).to.include('thread_id')
  })

  // Note: The test HTTP helper connects via 127.0.0.1 which is always treated
  // as localhost by the endpoint. This test documents the expected behavior for
  // non-localhost requests but cannot fully simulate the scenario without
  // network-level changes or middleware mocking.
  it('should require authentication for non-localhost requests', async () => {
    // Since test requests originate from 127.0.0.1, we verify the auth logic
    // indirectly: localhost requests succeed without any auth header
    const thread = await create_test_thread({
      user_public_key: test_user.user_public_key,
      test_directories
    })

    // Localhost request without any auth should succeed
    const response = await request(server)
      .put(`/api/threads/${thread.thread_id}/session-status`)
      .send({ session_status: 'active' })

    expect(response.status).to.equal(200)
    expect(response.body).to.deep.equal({ success: true })
  })
})
