import path from 'path'
import fs from 'fs/promises'
import { promisify } from 'util'
import child_process from 'child_process'

import create_temp_test_directory from './create_temp_test_directory.mjs'

const exec = promisify(child_process.exec)

/**
 * Creates a temporary git repository for testing purposes
 *
 * @param {Object} params - Parameters
 * @param {string} [params.prefix='git-repo-'] - Optional prefix for the repo directory
 * @param {string} [params.initial_content='# Test Repository'] - Initial content for README.md
 * @returns {Promise<Object>} Object with repo path and cleanup function
 */
export async function create_temp_test_repo({
  prefix = 'git-repo-',
  initial_content = '# Test Repository'
} = {}) {
  const repo = create_temp_test_directory(prefix)

  try {
    // Initialize git repository
    await exec('git init', { cwd: repo.path })
    await exec('git config user.name "Test User"', { cwd: repo.path })
    await exec('git config user.email "test@example.com"', { cwd: repo.path })

    // Create initial commit with README
    const readme_path = path.join(repo.path, 'README.md')
    await fs.writeFile(readme_path, initial_content)
    await exec('git add README.md', { cwd: repo.path })
    await exec('git commit -m "Initial commit"', { cwd: repo.path })
    await exec('git branch -M main', { cwd: repo.path })

    return repo
  } catch (error) {
    // Clean up on failure
    repo.cleanup()
    throw error
  }
}

export default create_temp_test_repo
