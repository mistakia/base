/* global describe it beforeEach afterEach before after */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

import service from '#libs-server/mcp/service.mjs'

// Import git provider to register it
import '#libs-server/mcp/git/provider.mjs'

const execute = promisify(exec)
const expect = chai.expect

describe('MCP Git Tools Integration', function () {
  let test_dir
  let system_repo_path
  let data_repo_path
  let original_system_path
  let original_data_path

  before(function () {
    // Save the original environment variables if they exist
    original_system_path = process.env.MCP_REPO_SYSTEM_PATH
    original_data_path = process.env.MCP_REPO_DATA_PATH
  })

  // Create test repositories before tests
  beforeEach(async function () {
    // This test may take longer than usual
    this.timeout(15000)

    // Create a unique temporary directory for our test repositories
    test_dir = path.join(
      os.tmpdir(),
      `mcp-git-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    )
    system_repo_path = path.join(test_dir, 'system')
    data_repo_path = path.join(test_dir, 'data')

    console.log(`Setting up test in directory: ${test_dir}`)

    // Create the base directory
    await fs.mkdir(test_dir, { recursive: true })

    // Initialize system repository (simulating the main repo)
    await fs.mkdir(system_repo_path, { recursive: true })
    await execute('git init', { cwd: system_repo_path })
    await execute('git config user.name "Test User"', { cwd: system_repo_path })
    await execute('git config user.email "test@example.com"', {
      cwd: system_repo_path
    })

    // Create a README file in the system repo
    await fs.writeFile(
      path.join(system_repo_path, 'README.md'),
      '# Test System Repository'
    )
    await execute('git add README.md', { cwd: system_repo_path })
    await execute('git commit -m "Initial system commit"', {
      cwd: system_repo_path
    })
    await execute('git branch -M main', { cwd: system_repo_path })

    // Initialize data repository (simulating the data submodule)
    await fs.mkdir(data_repo_path, { recursive: true })
    await execute('git init', { cwd: data_repo_path })
    await execute('git config user.name "Test User"', { cwd: data_repo_path })
    await execute('git config user.email "test@example.com"', {
      cwd: data_repo_path
    })

    // Create directory structure in data repo (similar to what we'd have in the real data repo)
    await fs.mkdir(path.join(data_repo_path, 'concepts'), { recursive: true })
    await fs.mkdir(path.join(data_repo_path, 'concepts/dir'), {
      recursive: true
    })

    // Add some markdown files to test with
    await fs.writeFile(
      path.join(data_repo_path, 'concepts/file1.md'),
      '# File 1\n\nThis is test file 1.'
    )
    await fs.writeFile(
      path.join(data_repo_path, 'concepts/file2.md'),
      '# File 2\n\nThis is test file 2.'
    )
    await fs.writeFile(
      path.join(data_repo_path, 'concepts/dir/file3.md'),
      '# File 3\n\nThis is test file 3.'
    )

    // Commit the files to the data repo
    await execute('git add .', { cwd: data_repo_path })
    await execute('git commit -m "Initial data commit"', {
      cwd: data_repo_path
    })
    await execute('git branch -M main', { cwd: data_repo_path })

    // Set up data as a submodule of system (simulating our real setup)
    // We'll use a relative path for the submodule to avoid absolute path issues
    const data_dir_name = path.basename(data_repo_path)
    await execute(`git submodule add -f ../${data_dir_name} data`, {
      cwd: system_repo_path
    })
    await execute('git commit -m "Add data submodule"', {
      cwd: system_repo_path
    })

    // Set environment variables to point to our test repositories
    process.env.MCP_REPO_SYSTEM_PATH = system_repo_path
    process.env.MCP_REPO_DATA_PATH = data_repo_path
  })

  // Clean up after all tests
  afterEach(async function () {
    // Restore the original environment variables
    if (original_system_path) {
      process.env.MCP_REPO_SYSTEM_PATH = original_system_path
    } else {
      delete process.env.MCP_REPO_SYSTEM_PATH
    }

    if (original_data_path) {
      process.env.MCP_REPO_DATA_PATH = original_data_path
    } else {
      delete process.env.MCP_REPO_DATA_PATH
    }

    try {
      // Clean up temporary directories
      await fs.rm(test_dir, { recursive: true, force: true })
    } catch (error) {
      console.error('Error cleaning up test directories:', error)
    }
  })

  after(function () {
    // Final cleanup of environment variables after all tests
    if (original_system_path) {
      process.env.MCP_REPO_SYSTEM_PATH = original_system_path
    } else {
      delete process.env.MCP_REPO_SYSTEM_PATH
    }

    if (original_data_path) {
      process.env.MCP_REPO_DATA_PATH = original_data_path
    } else {
      delete process.env.MCP_REPO_DATA_PATH
    }
  })

  it('should create a branch and apply patches with knowledge_base_apply_patch', async function () {
    const result = await service.process_request('git', {
      method: 'tools/call',
      params: {
        name: 'knowledge_base_apply_patch',
        arguments: {
          repo: 'main',
          branch_name: 'feature-branch',
          patches: [
            {
              path: 'new-file.md',
              content: '# New content'
            }
          ],
          commit_message: 'Add new content'
        }
      }
    })

    expect(result).to.have.nested.property('result.success', true)
    expect(result).to.have.nested.property('result.branch', 'feature-branch')

    // Verify the branch was created
    const branch_check = await execute('git branch', { cwd: system_repo_path })
    expect(branch_check.stdout).to.include('feature-branch')

    // Checkout the branch and verify file content
    await execute('git checkout feature-branch', { cwd: system_repo_path })
    const file_exists = await fs
      .access(path.join(system_repo_path, 'new-file.md'))
      .then(() => true)
      .catch(() => false)
    expect(file_exists).to.be.true

    if (file_exists) {
      const content = await fs.readFile(
        path.join(system_repo_path, 'new-file.md'),
        'utf8'
      )
      expect(content).to.equal('# New content')
    }
  })

  it('should read a file from a specific branch with knowledge_base_read_file', async function () {
    // Create a test file with specific content
    const test_content = '# Test Content\n\nThis is test content.'
    await fs.writeFile(
      path.join(data_repo_path, 'concepts/test-file.md'),
      test_content
    )
    await execute('git add concepts/test-file.md', { cwd: data_repo_path })
    await execute('git commit -m "Add test file"', { cwd: data_repo_path })

    const result = await service.process_request('git', {
      method: 'tools/call',
      params: {
        name: 'knowledge_base_read_file',
        arguments: {
          repo: 'data',
          path: 'concepts/test-file.md',
          branch: 'main'
        }
      }
    })

    expect(result).to.have.nested.property('result.content')
    expect(result.result.content).to.include('Test Content')
    expect(result.result.content).to.include('This is test content')
  })

  it('should list files in the knowledge base with knowledge_base_list_files', async function () {
    const result = await service.process_request('git', {
      method: 'tools/call',
      params: {
        name: 'knowledge_base_list_files',
        arguments: {
          repo: 'data',
          path: 'concepts',
          branch: 'main'
        }
      }
    })

    expect(result).to.have.nested.property('result.files')
    expect(result.result.files).to.include('concepts/file1.md')
    expect(result.result.files).to.include('concepts/file2.md')
    expect(result.result.files).to.include('concepts/dir/file3.md')
  })

  it('should return diff between branches with knowledge_base_get_diff', async function () {
    // Create a branch with changes
    await execute('git checkout -b feature-branch', { cwd: system_repo_path })
    await fs.writeFile(
      path.join(system_repo_path, 'README.md'),
      '# Test System Repository\n\nUpdated content'
    )
    await execute('git add README.md', { cwd: system_repo_path })
    await execute('git commit -m "Update README"', { cwd: system_repo_path })
    await execute('git checkout main', { cwd: system_repo_path })

    const result = await service.process_request('git', {
      method: 'tools/call',
      params: {
        name: 'knowledge_base_get_diff',
        arguments: {
          repo: 'main',
          branch: 'feature-branch',
          compare_with: 'main'
        }
      }
    })

    expect(result).to.have.nested.property('result.diff')
    expect(result.result.diff).to.include('Updated content')
  })

  it('should search for content in the knowledge base with knowledge_base_search', async function () {
    // Add a file with unique searchable content
    const unique_term = `unique-search-term-${Date.now()}`
    await fs.writeFile(
      path.join(data_repo_path, 'concepts/searchable.md'),
      `This file contains a ${unique_term} pattern`
    )
    await execute('git add concepts/searchable.md', { cwd: data_repo_path })
    await execute('git commit -m "Add searchable content"', {
      cwd: data_repo_path
    })

    const result = await service.process_request('git', {
      method: 'tools/call',
      params: {
        name: 'knowledge_base_search',
        arguments: {
          repo: 'data',
          query: unique_term
        }
      }
    })

    expect(result).to.have.nested.property('result.results')
    expect(result.result.results.length).to.be.at.least(1)

    // Ensure the search results contain our term
    const has_matching_result = result.result.results.some(
      (result) => result.content && result.content.includes(unique_term)
    )
    expect(has_matching_result).to.be.true
  })

  it('should handle modifications with knowledge_base_apply_patch', async function () {
    // First create a file to modify
    await service.process_request('git', {
      method: 'tools/call',
      params: {
        name: 'knowledge_base_apply_patch',
        arguments: {
          repo: 'main',
          branch_name: 'feature-branch',
          patches: [
            {
              path: 'file-to-modify.md',
              content: '# Original Content\n\nThis will be modified.'
            }
          ],
          commit_message: 'Add file to modify'
        }
      }
    })

    // Then modify it
    const modify_result = await service.process_request('git', {
      method: 'tools/call',
      params: {
        name: 'knowledge_base_apply_patch',
        arguments: {
          repo: 'main',
          branch_name: 'feature-branch',
          patches: [
            {
              path: 'file-to-modify.md',
              content: '# Modified Content\n\nThis has been modified.'
            }
          ],
          commit_message: 'Modify file'
        }
      }
    })

    expect(modify_result).to.have.nested.property('result.success', true)

    // Verify the file was modified
    await execute('git checkout feature-branch', { cwd: system_repo_path })
    const file_content = await fs.readFile(
      path.join(system_repo_path, 'file-to-modify.md'),
      'utf8'
    )
    expect(file_content).to.include('Modified Content')
    expect(file_content).to.include('This has been modified')
  })

  it('should support file deletion with knowledge_base_apply_patch', async function () {
    // First create a file to delete
    await service.process_request('git', {
      method: 'tools/call',
      params: {
        name: 'knowledge_base_apply_patch',
        arguments: {
          repo: 'main',
          branch_name: 'feature-branch',
          patches: [
            {
              path: 'file-to-delete.md',
              content: '# File to delete'
            }
          ],
          commit_message: 'Add file to delete'
        }
      }
    })

    // Verify the file exists
    await execute('git checkout feature-branch', { cwd: system_repo_path })
    const file_exists_before = await fs
      .access(path.join(system_repo_path, 'file-to-delete.md'))
      .then(() => true)
      .catch(() => false)
    expect(file_exists_before).to.be.true

    // Go back to main branch
    await execute('git checkout main', { cwd: system_repo_path })

    // Then delete it
    const delete_result = await service.process_request('git', {
      method: 'tools/call',
      params: {
        name: 'knowledge_base_apply_patch',
        arguments: {
          repo: 'main',
          branch_name: 'feature-branch',
          patches: [
            {
              path: 'file-to-delete.md',
              operation: 'delete'
            }
          ],
          commit_message: 'Delete file'
        }
      }
    })

    expect(delete_result).to.have.nested.property('result.success', true)

    // Verify the file is gone
    await execute('git checkout feature-branch', { cwd: system_repo_path })
    const file_exists_after = await fs
      .access(path.join(system_repo_path, 'file-to-delete.md'))
      .then(() => true)
      .catch(() => false)
    expect(file_exists_after).to.be.false
  })
})
