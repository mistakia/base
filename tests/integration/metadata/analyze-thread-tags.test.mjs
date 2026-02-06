/* global describe, it, before, after */

import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { v4 as uuid } from 'uuid'

import { analyze_thread_for_tags } from '#libs-server/metadata/analyze-thread-tags.mjs'
import {
  register_user_base_directory,
  clear_registered_directories
} from '#libs-server/base-uri/base-directory-registry.mjs'
import { write_timeline_jsonl } from '#libs-server/threads/timeline/index.mjs'

describe('analyze-thread-tags integration', () => {
  let test_dir
  let thread_id
  let thread_dir
  const test_user_public_key = 'test-user-public-key-for-tags'

  before(async () => {
    // Create temporary test directory
    test_dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'thread-tags-test-')
    )

    // Create thread directory structure
    thread_id = uuid()
    thread_dir = path.join(test_dir, 'thread', thread_id)
    await fs.mkdir(thread_dir, { recursive: true })

    // Create tag directory with test tags
    const tag_dir = path.join(test_dir, 'tag')
    await fs.mkdir(tag_dir, { recursive: true })

    // Create a test tag file
    const test_tag_content = `---
title: Software Task
type: tag
description: Tag for software development tasks
base_uri: user:tag/software-task.md
entity_id: ${uuid()}
created_at: '2025-01-01T00:00:00.000Z'
updated_at: '2025-01-01T00:00:00.000Z'
user_public_key: ${test_user_public_key}
---

# Software Task

Tag for work involving programming, development, and technical implementation.
`
    await fs.writeFile(
      path.join(tag_dir, 'software-task.md'),
      test_tag_content
    )

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

  it('should throw error for missing thread_id', async () => {
    try {
      await analyze_thread_for_tags({
        thread_id: null,
        user_public_key: test_user_public_key
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('thread_id is required')
    }
  })

  it('should throw error for missing user_public_key', async () => {
    try {
      await analyze_thread_for_tags({
        thread_id: uuid(),
        user_public_key: null
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('user_public_key is required')
    }
  })

  // Note: Full thread state tests require proper directory isolation
  // which conflicts with get_thread's config-based directory resolution.
  // These tests verify the skip behavior works correctly when the thread
  // has the appropriate flags set.
  describe.skip('Thread state tests (require environment isolation)', () => {
    it('should skip thread with tags_user_set flag', async () => {
      // Create metadata with tags_user_set flag
      const metadata = {
        thread_id,
        title: 'User Tagged Thread',
        short_description: 'Thread with manually set tags',
        user_public_key: test_user_public_key,
        session_provider: 'claude',
        thread_state: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['user:tag/manual-tag.md'],
        tags_user_set: true,
        external_session: { session_provider: 'claude' }
      }
      await fs.writeFile(
        path.join(thread_dir, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      )

      const result = await analyze_thread_for_tags({
        thread_id,
        user_public_key: test_user_public_key
      })

      expect(result.status).to.equal('skipped')
      expect(result.reason).to.equal('tags_user_set')
      expect(result.current_tags).to.deep.equal(['user:tag/manual-tag.md'])
    })

    it('should skip already analyzed threads unless force is set', async () => {
      // Update metadata to include tags_analyzed_at
      const metadata_path = path.join(thread_dir, 'metadata.json')
      const metadata = JSON.parse(await fs.readFile(metadata_path, 'utf-8'))
      metadata.tags_user_set = false
      metadata.tags_analyzed_at = new Date().toISOString()
      metadata.tags = ['user:tag/previously-analyzed.md']
      await fs.writeFile(metadata_path, JSON.stringify(metadata, null, 2))

      const result = await analyze_thread_for_tags({
        thread_id,
        user_public_key: test_user_public_key,
        force: false
      })

      expect(result.status).to.equal('skipped')
      expect(result.reason).to.equal('already_analyzed')
    })

    it('should skip thread without user messages', async () => {
      // Create new thread without user messages
      const empty_thread_id = uuid()
      const empty_thread_dir = path.join(test_dir, 'thread', empty_thread_id)
      await fs.mkdir(empty_thread_dir, { recursive: true })

      const metadata = {
        thread_id: empty_thread_id,
        title: 'Empty Thread',
        user_public_key: test_user_public_key,
        session_provider: 'claude',
        thread_state: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        external_session: { session_provider: 'claude' }
      }
      await fs.writeFile(
        path.join(empty_thread_dir, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      )

      // Create empty timeline
      await write_timeline_jsonl({
        timeline_path: path.join(empty_thread_dir, 'timeline.jsonl'),
        entries: []
      })

      const result = await analyze_thread_for_tags({
        thread_id: empty_thread_id,
        user_public_key: test_user_public_key
      })

      expect(result.status).to.equal('skipped')
      expect(result.reason).to.equal('no_user_message')
    })
  })

  // Note: Full LLM integration tests require Ollama running
  // These are marked with .skip by default but can be run manually
  describe.skip('LLM integration (requires Ollama)', () => {
    it('should analyze thread and return tags', async () => {
      // Create thread with user message
      const llm_thread_id = uuid()
      const llm_thread_dir = path.join(test_dir, 'thread', llm_thread_id)
      await fs.mkdir(llm_thread_dir, { recursive: true })

      const metadata = {
        thread_id: llm_thread_id,
        title: 'Code Review Thread',
        short_description: 'Reviewing JavaScript code',
        user_public_key: test_user_public_key,
        session_provider: 'claude',
        thread_state: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        external_session: { session_provider: 'claude' }
      }
      await fs.writeFile(
        path.join(llm_thread_dir, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      )

      // Create timeline with software-related user message
      const timeline = [
        {
          id: 'entry-1',
          type: 'message',
          role: 'user',
          content: 'Please help me refactor this JavaScript function to use async/await'
        }
      ]
      await write_timeline_jsonl({
        timeline_path: path.join(llm_thread_dir, 'timeline.jsonl'),
        entries: timeline
      })

      const result = await analyze_thread_for_tags({
        thread_id: llm_thread_id,
        user_public_key: test_user_public_key,
        dry_run: true
      })

      expect(result.status).to.equal('dry_run')
      expect(result.updates).to.have.property('tags')
      expect(result.updates.tags).to.be.an('array')
    })
  })
})
