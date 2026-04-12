import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'

import create_thread from '#libs-server/threads/create-thread.mjs'
import { register_base_directories } from '#libs-server/base-uri/index.mjs'
import {
  create_temp_test_repo,
  create_test_user,
  reset_all_tables
} from '#tests/utils/index.mjs'
import { generate_thread_id_from_session } from '#libs-server/threads/generate-thread-id-from-session.mjs'

describe('create_thread explicit thread_id parameter', () => {
  let test_user
  let test_repo

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()

    test_repo = await create_temp_test_repo({
      prefix: 'thread-explicit-id-test-',
      register_directories: false
    })

    register_base_directories({
      system_base_directory: test_repo.system_path,
      user_base_directory: test_repo.user_path
    })
  })

  after(async () => {
    await reset_all_tables()

    if (test_repo) {
      test_repo.cleanup()
    }
  })

  it('should use the provided thread_id for the thread directory', async () => {
    const explicit_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

    const thread = await create_thread({
      user_public_key: test_user.user_public_key,
      workflow_base_uri: 'sys:system/workflow/test-workflow.md',
      inference_provider: 'ollama',
      models: ['llama2'],
      thread_id: explicit_id
    })

    expect(thread.thread_id).to.equal(explicit_id)

    // Verify directory was created using the explicit ID
    const thread_dir = thread.context_dir
    expect(thread_dir).to.include(explicit_id)

    const dir_exists = await fs
      .access(thread_dir)
      .then(() => true)
      .catch(() => false)
    expect(dir_exists).to.be.true

    // Verify metadata contains the explicit ID
    const metadata_path = path.join(thread_dir, 'metadata.json')
    const metadata = JSON.parse(await fs.readFile(metadata_path, 'utf-8'))
    expect(metadata.thread_id).to.equal(explicit_id)
  })

  it('should throw when both thread_id and source.session_id are provided', async () => {
    try {
      await create_thread({
        user_public_key: test_user.user_public_key,
        inference_provider: 'ollama',
        models: ['llama2'],
        thread_id: 'some-explicit-id',
        source: {
          provider: 'claude',
          session_id: 'some-session-id'
        }
      })
      expect.fail(
        'Should have thrown an error for conflicting thread_id and source.session_id'
      )
    } catch (error) {
      expect(error).to.be.an('error')
      expect(error.message).to.include('thread_id')
      expect(error.message).to.include('source.session_id')
    }
  })

  it('should allow empty models array for pre-created threads', async () => {
    const explicit_id = 'bbbbbbbb-1111-2222-3333-444444444444'

    const thread = await create_thread({
      user_public_key: test_user.user_public_key,
      workflow_base_uri: 'sys:system/workflow/test-workflow.md',
      inference_provider: 'ollama',
      models: [],
      thread_id: explicit_id
    })

    expect(thread.thread_id).to.equal(explicit_id)
    expect(thread.models).to.be.an('array')
    expect(thread.models).to.have.lengthOf(0)
  })

  it('should skip workflow_base_uri validation for pre-created threads', async () => {
    const explicit_id = 'cccccccc-1111-2222-3333-444444444444'

    // No workflow_base_uri provided -- should succeed for pre-created threads
    const thread = await create_thread({
      user_public_key: test_user.user_public_key,
      inference_provider: 'ollama',
      models: ['llama2'],
      thread_id: explicit_id
    })

    expect(thread.thread_id).to.equal(explicit_id)
    expect(thread.workflow_base_uri).to.be.undefined
  })

  it('should use deterministic UUIDv5 when source is provided without explicit thread_id', async () => {
    const source = {
      provider: 'claude',
      session_id: 'deterministic-test-session-123'
    }

    const thread = await create_thread({
      user_public_key: test_user.user_public_key,
      inference_provider: 'ollama',
      models: ['llama2'],
      source
    })

    const expected_id = generate_thread_id_from_session({
      session_id: source.session_id,
      session_provider: source.provider
    })

    expect(thread.thread_id).to.equal(expected_id)
  })

  it('should use random UUIDv4 when neither thread_id nor source is provided', async () => {
    const thread = await create_thread({
      user_public_key: test_user.user_public_key,
      workflow_base_uri: 'sys:system/workflow/test-workflow.md',
      inference_provider: 'ollama',
      models: ['llama2']
    })

    // Verify it is a valid UUID v4 format
    const uuid_v4_regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    expect(thread.thread_id).to.match(uuid_v4_regex)
  })
})
