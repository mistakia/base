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

describe('analyze-thread-tags integration', () => {
  let test_dir
  const test_user_public_key = 'test-user-public-key-for-tags'

  before(async () => {
    // Create temporary test directory
    test_dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'thread-tags-test-')
    )

    // Create thread directory structure
    const thread_dir = path.join(test_dir, 'thread', uuid())
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

  // Note: Full thread state tests and LLM integration tests require:
  // - Thread state tests: proper directory isolation (conflicts with get_thread's config-based resolution)
  // - LLM tests: Ollama running locally
  // These scenarios are covered by manual testing and the unit tests for generate-tag-prompt.mjs
})
