import path from 'path'
import fs from 'fs/promises'
import { promisify } from 'util'
import child_process from 'child_process'
import { fileURLToPath } from 'url'

import create_temp_test_directory from './create-temp-test-directory.mjs'

const exec = promisify(child_process.exec)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const default_workflow_path = path.join(
  __dirname,
  '..',
  'fixtures',
  'default-workflow.md'
)

/**
 * Creates a temporary base repository with a user submodule for testing purposes
 *
 * @param {Object} params - Parameters
 * @param {string} [params.prefix='base-repo-'] - Optional prefix for the repo directory
 * @param {string} [params.initial_content='# Test Base Repository'] - Initial content for README.md
 * @returns {Promise<Object>} Object with repo path and cleanup function
 */
export async function create_temp_test_repo({
  prefix = 'base-repo-',
  initial_content = '# Test Base Repository'
} = {}) {
  const base_repo = create_temp_test_directory(prefix)
  const user_repo_path = path.join(base_repo.path, 'user')

  try {
    // Create the user repository directory inside the base repo
    await fs.mkdir(user_repo_path, { recursive: true })

    // Initialize base git repository
    await exec('git init', { cwd: base_repo.path })
    await exec('git config user.name "Test User"', { cwd: base_repo.path })
    await exec('git config user.email "test@example.com"', {
      cwd: base_repo.path
    })

    // Create initial commit with README
    const readme_path = path.join(base_repo.path, 'README.md')
    await fs.writeFile(readme_path, initial_content)
    await exec('git add README.md', { cwd: base_repo.path })

    // Create system/workflow directory
    const workflow_dir = path.join(base_repo.path, 'system', 'workflow')
    await fs.mkdir(workflow_dir, { recursive: true })

    // Read the default workflow file from fixtures
    const workflow_content = await fs.readFile(default_workflow_path, 'utf-8')

    // Write to the test repo
    const workflow_path = path.join(workflow_dir, 'default-workflow.md')
    await fs.writeFile(workflow_path, workflow_content)

    // Add to git
    await exec('git add system/workflow/default-workflow.md', {
      cwd: base_repo.path
    })

    // Initialize user submodule repository
    await exec('git init', { cwd: user_repo_path })
    await exec('git config user.name "Test User"', { cwd: user_repo_path })
    await exec('git config user.email "test@example.com"', {
      cwd: user_repo_path
    })

    // Create user README
    const user_readme_path = path.join(user_repo_path, 'README.md')
    await fs.writeFile(user_readme_path, '# Test User Repository')
    await exec('git add README.md', { cwd: user_repo_path })
    await exec('git commit -m "Initial commit"', { cwd: user_repo_path })
    await exec('git branch -M main', { cwd: user_repo_path })

    // Add user submodule to base repo
    await exec('git submodule add ./user user', {
      cwd: base_repo.path
    })

    // Commit all added files in base repo
    await exec('git commit -m "Initial commit with user submodule"', {
      cwd: base_repo.path
    })
    await exec('git branch -M main', { cwd: base_repo.path })

    return {
      path: base_repo.path,
      branch: 'main',
      user_path: user_repo_path,
      user_branch: 'main',
      cleanup: base_repo.cleanup
    }
  } catch (error) {
    // Clean up on failure
    base_repo.cleanup()
    throw error
  }
}

export default create_temp_test_repo
