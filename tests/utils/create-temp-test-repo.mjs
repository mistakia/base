import path from 'path'
import fs from 'fs/promises'
import { promisify } from 'util'
import child_process from 'child_process'

import create_temp_test_directory from './create-temp-test-directory.mjs'
import { register_base_directories } from '#libs-server/base-uri/index.mjs'

const exec = promisify(child_process.exec)

/**
 * Creates a temporary base repository with a separate user repository for testing purposes
 *
 * @param {Object} params - Parameters
 * @param {string} [params.prefix='base-repo-'] - Optional prefix for the repo directory
 * @param {string} [params.initial_content='# Test Base Repository'] - Initial content for README.md
 * @param {boolean} [params.register_directories=true] - Whether to register directories with the base_uri registry
 * @returns {Promise<Object>} Object with repo path, user repo path, and cleanup function
 */
export async function create_temp_test_repo({
  prefix = 'base-repo-',
  initial_content = '# Test Base Repository',
  register_directories = true
} = {}) {
  const system_repo = create_temp_test_directory(prefix)
  const user_repo = create_temp_test_directory('user-repo-')

  try {
    // Initialize base git repository
    await exec('git init', { cwd: system_repo.path })
    await exec('git config user.name "Test User"', { cwd: system_repo.path })
    await exec('git config user.email "test@example.com"', {
      cwd: system_repo.path
    })

    // Create initial commit with README
    const readme_path = path.join(system_repo.path, 'README.md')
    await fs.writeFile(readme_path, initial_content)
    await exec('git add README.md', { cwd: system_repo.path })

    // Create system directory to match the real system structure
    const system_dir = path.join(system_repo.path, 'system')
    const workflow_dir = path.join(system_dir, 'workflow')
    await fs.mkdir(workflow_dir, { recursive: true })

    // Create a simple test workflow
    const test_workflow_content = `---
title: 'Test Workflow'
type: 'workflow'
description: 'A test workflow for testing purposes'
created_at: '2025-05-27T18:10:20.246Z'
entity_id: '123e4567-e89b-12d3-a456-426614174000'
updated_at: '2025-05-27T18:10:20.246Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

This is a test workflow for testing purposes.
`

    const test_workflow_path = path.join(workflow_dir, 'test-workflow.md')
    await fs.writeFile(test_workflow_path, test_workflow_content)

    // Add to git
    await exec('git add system/workflow/test-workflow.md', {
      cwd: system_repo.path
    })

    // Commit all added files in base repo
    await exec('git commit -m "Initial commit"', {
      cwd: system_repo.path
    })
    await exec('git branch -M main', { cwd: system_repo.path })

    // Initialize user repository as separate repo
    await exec('git init', { cwd: user_repo.path })
    await exec('git config user.name "Test User"', { cwd: user_repo.path })
    await exec('git config user.email "test@example.com"', {
      cwd: user_repo.path
    })

    // Create user README
    const user_readme_path = path.join(user_repo.path, 'README.md')
    await fs.writeFile(user_readme_path, '# Test User Repository')
    await exec('git add README.md', { cwd: user_repo.path })
    await exec('git commit -m "Initial commit"', { cwd: user_repo.path })
    await exec('git branch -M main', { cwd: user_repo.path })

    // Register directories with the base_uri registry if requested
    if (register_directories) {
      register_base_directories({
        system_base_directory: system_repo.path,
        user_base_directory: user_repo.path
      })
    }

    // Combined cleanup function
    const combined_cleanup = () => {
      system_repo.cleanup()
      user_repo.cleanup()
    }

    return {
      system_path: system_repo.path,
      system_branch: 'main',
      user_path: user_repo.path,
      user_branch: 'main',
      cleanup: combined_cleanup
    }
  } catch (error) {
    // Clean up on failure
    system_repo.cleanup()
    user_repo.cleanup()
    throw error
  }
}

export default create_temp_test_repo
