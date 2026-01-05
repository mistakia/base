/* global describe, it, before, after */

import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { v4 as uuid } from 'uuid'

import { analyze_thread_relations } from '#libs-server/metadata/analyze-thread-relations.mjs'
import {
  register_user_base_directory,
  clear_registered_directories
} from '#libs-server/base-uri/base-directory-registry.mjs'

describe('analyze-thread-relations integration', () => {
  let test_dir
  let thread_id
  let thread_dir

  before(async () => {
    // Create temporary test directory
    test_dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'thread-relations-test-')
    )

    // Create thread directory structure
    thread_id = uuid()
    thread_dir = path.join(test_dir, 'thread', thread_id)
    await fs.mkdir(thread_dir, { recursive: true })

    // Create a mock entity directory
    await fs.mkdir(path.join(test_dir, 'task'), { recursive: true })

    // Register test directory
    register_user_base_directory(test_dir)
  })

  after(async () => {
    // Cleanup
    clear_registered_directories()
    try {
      await fs.rm(test_dir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  it('should analyze thread with tool call references', async () => {
    // Create metadata.json
    const metadata = {
      thread_id,
      title: 'Test Thread',
      short_description: 'A test thread for relation analysis',
      user_public_key: 'test-user',
      session_provider: 'claude',
      thread_state: 'archived',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      external_session: { session_provider: 'claude' }
    }
    await fs.writeFile(
      path.join(thread_dir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    )

    // Create timeline.json with tool calls
    const timeline = [
      {
        id: 'entry-1',
        type: 'tool_call',
        content: {
          tool_name: 'mcp__base__entity_create',
          tool_parameters: { base_uri: 'user:task/created-task.md' }
        }
      },
      {
        id: 'entry-2',
        type: 'message',
        role: 'user',
        content: 'Please check [[user:task/referenced-task.md]]'
      }
    ]
    await fs.writeFile(
      path.join(thread_dir, 'timeline.json'),
      JSON.stringify(timeline, null, 2)
    )

    // Run analysis in dry-run mode (skip LLM calls)
    const result = await analyze_thread_relations({
      thread_id,
      dry_run: true,
      skip_related_threads: true
    })

    expect(result.status).to.equal('success')
    expect(result.thread_id).to.equal(thread_id)
    expect(result.entity_references_count).to.be.at.least(1)
    expect(result.relations).to.be.an('array')
    expect(result.dry_run).to.be.true
  })

  it('should skip already analyzed threads', async () => {
    // Update metadata to include relations_analyzed_at
    const metadata_path = path.join(thread_dir, 'metadata.json')
    const metadata = JSON.parse(await fs.readFile(metadata_path, 'utf-8'))
    metadata.relations_analyzed_at = new Date().toISOString()
    await fs.writeFile(metadata_path, JSON.stringify(metadata, null, 2))

    const result = await analyze_thread_relations({
      thread_id,
      dry_run: false,
      skip_related_threads: true
    })

    expect(result.status).to.equal('already_analyzed')
  })

  it('should throw error for missing thread_id', async () => {
    try {
      await analyze_thread_relations({ thread_id: null })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('thread_id is required')
    }
  })
})
