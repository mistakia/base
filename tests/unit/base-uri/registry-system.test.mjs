import { expect } from 'chai'
import path from 'path'
import { promises as fs } from 'fs'

import {
  register_base_directories,
  clear_registered_directories,
  get_system_base_directory,
  get_user_base_directory,
  resolve_base_uri_from_registry,
  get_git_info_from_registry
} from '#libs-server/base-uri/index.mjs'
import { create_temp_test_directory } from '#tests/utils/index.mjs'

describe('Base Directory Registry System', () => {
  let test_system_dir, test_user_dir

  beforeEach(async () => {
    // Clear any existing registrations
    clear_registered_directories()

    // Create temporary directories for testing
    test_system_dir = await create_temp_test_directory('registry-system-test')
    test_user_dir = await create_temp_test_directory('registry-user-test')
  })

  afterEach(() => {
    // Clean up
    clear_registered_directories()
    if (test_system_dir?.cleanup) test_system_dir.cleanup()
    if (test_user_dir?.cleanup) test_user_dir.cleanup()
  })

  describe('register_base_directories', () => {
    it('should register system and user directories', () => {
      register_base_directories({
        system_base_directory: test_system_dir.path,
        user_base_directory: test_user_dir.path
      })

      expect(get_system_base_directory()).to.equal(test_system_dir.path)
      expect(get_user_base_directory()).to.equal(test_user_dir.path)
    })

    it('should throw error if system_base_directory is missing', () => {
      expect(() => {
        register_base_directories({
          user_base_directory: test_user_dir.path
        })
      }).to.throw('system_base_directory is required')
    })

    it('should throw error if user_base_directory is missing', () => {
      expect(() => {
        register_base_directories({
          system_base_directory: test_system_dir.path
        })
      }).to.throw('user_base_directory is required')
    })
  })

  describe('resolve_base_uri_from_registry', () => {
    beforeEach(() => {
      register_base_directories({
        system_base_directory: test_system_dir.path,
        user_base_directory: test_user_dir.path
      })
    })

    it('should resolve sys: URIs using registered system directory', () => {
      const base_uri = 'sys:schema/task.md'
      const expected_path = path.join(test_system_dir.path, 'schema/task.md')

      const resolved_path = resolve_base_uri_from_registry(base_uri)
      expect(resolved_path).to.equal(expected_path)
    })

    it('should resolve user: URIs using registered user directory', () => {
      const base_uri = 'user:task/my-task.md'
      const expected_path = path.join(test_user_dir.path, 'task/my-task.md')

      const resolved_path = resolve_base_uri_from_registry(base_uri)
      expect(resolved_path).to.equal(expected_path)
    })

    it('should throw error if directories are not registered', () => {
      clear_registered_directories()

      expect(() => {
        resolve_base_uri_from_registry('sys:schema/task.md')
      }).to.throw('System base directory not registered')
    })

    it('should throw error for unsupported URI schemes', () => {
      expect(() => {
        resolve_base_uri_from_registry('http://example.com/file.md')
      }).to.throw('Cannot resolve remote URI to local path')
    })
  })

  describe('get_git_info_from_registry', () => {
    beforeEach(() => {
      register_base_directories({
        system_base_directory: test_system_dir.path,
        user_base_directory: test_user_dir.path
      })
    })

    it('should return git info for sys: URIs', () => {
      const base_uri = 'sys:workflow/test.md'
      const result = get_git_info_from_registry(base_uri)

      expect(result.git_relative_path).to.equal('workflow/test.md')
      expect(result.repo_path).to.equal(test_system_dir.path)
    })

    it('should return git info for user: URIs', () => {
      const base_uri = 'user:task/my-task.md'
      const result = get_git_info_from_registry(base_uri)

      expect(result.git_relative_path).to.equal('task/my-task.md')
      expect(result.repo_path).to.equal(test_user_dir.path)
    })

    it('should throw error for unsupported schemes', () => {
      expect(() => {
        get_git_info_from_registry('ssh://server/file.md')
      }).to.throw('Unsupported scheme for git operations')
    })
  })

  describe('integration with workflow functions', () => {
    it('should work with read_workflow_from_filesystem using registry', async () => {
      // Register directories
      register_base_directories({
        system_base_directory: test_system_dir.path,
        user_base_directory: test_user_dir.path
      })

      // Create a test workflow file
      const workflow_dir = path.join(test_system_dir.path, 'system', 'workflow')
      await fs.mkdir(workflow_dir, { recursive: true })

      const workflow_content = `---
title: "Registry Test Workflow"
type: "workflow"
description: "Test workflow for registry system"
---

# Registry Test Workflow

This workflow tests the registry system.`

      await fs.writeFile(
        path.join(workflow_dir, 'registry-test.md'),
        workflow_content
      )

      // Import the function dynamically to avoid import issues
      const { read_workflow_from_filesystem } =
        await import('#libs-server/workflow/filesystem/read-workflow-from-filesystem.mjs')

      // Test with URI format - should use registry if available
      const result = await read_workflow_from_filesystem({
        base_uri: 'sys:system/workflow/registry-test.md'
      })

      expect(result.success).to.be.true
      expect(result.entity_properties.title).to.equal('Registry Test Workflow')
      expect(result.entity_properties.type).to.equal('workflow')
    })
  })
})
