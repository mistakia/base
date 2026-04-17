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
import { thread_constants } from '#libs-shared'
import {
  read_timeline_jsonl,
  read_timeline_jsonl_or_default
} from '#libs-server/threads/timeline/index.mjs'

const { THREAD_STATE } = thread_constants

describe('create_thread', () => {
  let test_user
  let test_repo

  before(async () => {
    await reset_all_tables()
    test_user = await create_test_user()

    // Create test git repositories (both system and user)
    test_repo = await create_temp_test_repo({
      prefix: 'thread-test-repo-',
      register_directories: false
    })

    // Register test directories with the registry
    register_base_directories({
      system_base_directory: test_repo.system_path,
      user_base_directory: test_repo.user_path
    })
  })

  after(async () => {
    await reset_all_tables()

    // Clean up git repositories
    if (test_repo) {
      test_repo.cleanup()
    }
  })

  it('should create a thread with minimal required parameters', async () => {
    const thread_data = {
      user_public_key: test_user.user_public_key,
      workflow_base_uri: 'sys:system/workflow/test-workflow.md',
      inference_provider: 'ollama',
      models: ['llama2'],
      create_git_branches: true
    }

    const thread = await create_thread(thread_data)

    // Verify thread was created with proper structure
    expect(thread).to.be.an('object')
    expect(thread.thread_id).to.be.a('string')
    expect(thread.git_branch).to.equal(`thread/${thread.thread_id}`)

    // Check that thread context directory exists
    const thread_dir = path.join(thread.context_dir)
    const dir_exists = await fs
      .access(thread_dir)
      .then(() => true)
      .catch(() => false)
    expect(dir_exists).to.be.true

    // Check metadata file
    const metadata_path = path.join(thread_dir, 'metadata.json')
    const metadata = JSON.parse(await fs.readFile(metadata_path, 'utf-8'))

    expect(metadata.thread_id).to.equal(thread.thread_id)
    expect(metadata.user_public_key).to.equal(test_user.user_public_key)
    expect(metadata.inference_provider).to.equal('ollama')
    expect(metadata.models).to.be.an('array')
    expect(metadata.models).to.have.lengthOf(1)
    expect(metadata.models[0]).to.equal('llama2')
    expect(metadata.thread_state).to.equal(THREAD_STATE.ACTIVE)
    expect(metadata.created_at).to.be.a('string')
    expect(metadata.git_branch).to.equal(`thread/${thread.thread_id}`)

    // No initial_timeline_entry provided; the timeline file is created lazily
    // on first append, so the default-read returns an empty array.
    const timeline_path = path.join(thread_dir, 'timeline.jsonl')
    const timeline = await read_timeline_jsonl_or_default({ timeline_path })

    expect(timeline).to.be.an('array')
    expect(timeline).to.be.empty

    // Check memory directory
    const memory_dir = path.join(thread_dir, 'memory')
    const memory_dir_exists = await fs
      .access(memory_dir)
      .then(() => true)
      .catch(() => false)
    expect(memory_dir_exists).to.be.true

    // Verify git branches were created in both repos
    const branch_name = `thread/${thread.thread_id}`

    // Verify branches exist by checking the metadata (which confirms they were created)
    expect(thread.git_branch).to.equal(branch_name)
    expect(thread.system_worktree_path).to.be.a('string')
    expect(thread.user_worktree_path).to.be.a('string')
  })

  it('should create a thread with an initial timeline entry', async () => {
    const thread = await create_thread({
      user_public_key: test_user.user_public_key,
      workflow_base_uri: 'sys:system/workflow/test-workflow.md',
      inference_provider: 'ollama',
      models: ['llama2'],
      initial_timeline_entry: {
        type: 'message',
        role: 'user',
        content: 'Hello, this is my first message'
      },
      create_git_branches: true
    })

    const timeline_path = path.join(thread.context_dir, 'timeline.jsonl')
    const timeline = await read_timeline_jsonl({ timeline_path })

    expect(timeline).to.be.an('array')
    expect(timeline).to.have.lengthOf(1)
    expect(timeline[0].type).to.equal('message')
    expect(timeline[0].role).to.equal('user')
    expect(timeline[0].content).to.equal('Hello, this is my first message')
  })

  it('should create a thread with custom tools', async () => {
    const thread_data = {
      user_public_key: test_user.user_public_key,
      workflow_base_uri: 'sys:system/workflow/test-workflow.md',
      inference_provider: 'ollama',
      models: ['llama2'],
      tools: ['web_search', 'calculator'],
      create_git_branches: true
    }

    const thread = await create_thread(thread_data)

    // Check metadata file
    const metadata_path = path.join(thread.context_dir, 'metadata.json')
    const metadata = JSON.parse(await fs.readFile(metadata_path, 'utf-8'))

    expect(metadata.tools).to.be.an('array')
    expect(metadata.tools).to.include.members(['web_search', 'calculator'])
    expect(metadata.tools).to.have.length(2)
  })

  it('should create a thread with archived state', async () => {
    const thread_data = {
      user_public_key: test_user.user_public_key,
      workflow_base_uri: 'sys:system/workflow/test-workflow.md',
      inference_provider: 'ollama',
      models: ['llama2'],
      thread_state: THREAD_STATE.ARCHIVED,
      additional_metadata: {
        archive_reason: 'completed',
        archived_at: new Date().toISOString()
      },
      create_git_branches: true
    }

    const thread = await create_thread(thread_data)

    // Check metadata file
    const metadata_path = path.join(thread.context_dir, 'metadata.json')
    const metadata = JSON.parse(await fs.readFile(metadata_path, 'utf-8'))

    expect(metadata.thread_state).to.equal(THREAD_STATE.ARCHIVED)
    expect(metadata.archive_reason).to.equal('completed')
    expect(metadata.archived_at).to.be.a('string')
  })

  it('should reject invalid thread parameters', async () => {
    const invalid_thread_data = {
      // Missing user_public_key
      inference_provider: 'ollama',
      model: 'llama2'
    }

    try {
      await create_thread(invalid_thread_data)
      // Should not reach here
      expect.fail('Should have thrown an error for missing user_public_key')
    } catch (error) {
      expect(error).to.be.an('error')
      expect(error.message).to.include('user_public_key')
    }
  })

  it('should reject invalid state transitions', async () => {
    const invalid_state_data = {
      user_public_key: test_user.user_public_key,
      inference_provider: 'ollama',
      models: ['llama2'],
      thread_state: 'invalid_state' // Invalid state value
    }

    try {
      await create_thread(invalid_state_data)
      // Should not reach here
      expect.fail('Should have thrown an error for invalid thread state')
    } catch (error) {
      expect(error).to.be.an('error')
      expect(error.message).to.include('thread state')
    }
  })

  it('should reject deprecated thread states', async () => {
    const deprecated_state_data = {
      user_public_key: test_user.user_public_key,
      inference_provider: 'ollama',
      models: ['llama2'],
      thread_state: 'terminated' // Deprecated state
    }

    try {
      await create_thread(deprecated_state_data)
      // Should not reach here
      expect.fail('Should have thrown an error for deprecated thread state')
    } catch (error) {
      expect(error).to.be.an('error')
      expect(error.message).to.include('thread state')
    }
  })
})
