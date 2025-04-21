/* global describe it beforeEach afterEach before after */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import {
  create_temp_test_repo,
  create_temp_test_directory
} from '#tests/utils/index.mjs'

const execute = promisify(exec)
const expect = chai.expect

// Helper function to parse MCP response
function parse_mcp_response(response) {
  // If the response has content property (indicating it's wrapped), extract the data
  if (response.content && Array.isArray(response.content) && response.content.length > 0) {
    try {
      // Try to parse the text content if it's a JSON string
      if (response.content[0].text) {
        return JSON.parse(response.content[0].text)
      }
    } catch (error) {
      console.warn('Failed to parse response content as JSON:', error)
    }
  }
  
  // Return the original response if it can't be parsed
  return response
}

describe('MCP File Tools Integration', function () {
  let test_dir
  let system_repo
  let user_repo
  let mcp_client

  before(async function () {
    // This test may take longer than usual
    this.timeout(15000)

    // Initialize the MCP client with stdio transport
    const transport = new StdioClientTransport({
      command: 'node',
      args: [path.resolve(process.cwd(), 'scripts/mcp/mcp_server_stdio.mjs')],
      cwd: process.cwd(),
      env: {
        ...process.env,
        CONFIG_ENCRYPTION_KEY:
          'ca25b9c4f1c26bc9a6475af467d9885d3b2a9d9a98a815a15af1264e6c50444a'
      }
    })

    mcp_client = new Client({
      name: 'mcp-test-client',
      version: '1.0.0'
    })

    await mcp_client.connect(transport)
  })

  // Create test repositories before tests
  beforeEach(async function () {
    // This test may take longer than usual
    this.timeout(15000)

    // Create a unique temporary directory for our test repositories
    test_dir = create_temp_test_directory('mcp-git-test-')

    // Initialize system repository (simulating the main repo)
    system_repo = await create_temp_test_repo({
      prefix: 'system-repo-',
      initial_content: '# Test System Repository'
    })

    // Initialize data repository (simulating the data submodule)
    user_repo = await create_temp_test_repo({
      prefix: 'user-repo-',
      initial_content: '# Test User Repository'
    })

    // Create directory structure in data repo (similar to what we'd have in the real data repo)
    await fs.mkdir(path.join(user_repo.path, 'concepts'), {
      recursive: true
    })
    await fs.mkdir(path.join(user_repo.path, 'concepts/dir'), {
      recursive: true
    })

    // Add some markdown files to test with
    await fs.writeFile(
      path.join(user_repo.path, 'concepts/file1.md'),
      '# File 1\n\nThis is test file 1.'
    )
    await fs.writeFile(
      path.join(user_repo.path, 'concepts/file2.md'),
      '# File 2\n\nThis is test file 2.'
    )
    await fs.writeFile(
      path.join(user_repo.path, 'concepts/dir/file3.md'),
      '# File 3\n\nThis is test file 3.'
    )

    // Commit the files to the data repo
    await execute('git add .', { cwd: user_repo.path })
    await execute('git commit -m "Initial data commit"', {
      cwd: user_repo.path
    })
  })

  // Clean up after all tests
  afterEach(async function () {
    try {
      // Clean up temporary directories
      if (system_repo) system_repo.cleanup()
      if (user_repo) user_repo.cleanup()
      if (test_dir) test_dir.cleanup()
    } catch (error) {
      console.error('Error cleaning up test directories:', error)
    }
  })

  after(async function () {
    // Disconnect the MCP client
    if (mcp_client) {
      await mcp_client.close()
    }
  })

  it('should create a branch and write to a file with file_write', async function () {
    const result = await mcp_client.callTool({
      name: 'file_write',
      arguments: {
        path: 'new-file.md',
        content: '# New content',
        thread_id: 'test-thread',
        change_request_title: 'Add new content',
        change_request_description: 'Test file creation',
        repo_path: system_repo.path
      }
    })

    console.log(result)

    const parsed_result = parse_mcp_response(result)
    expect(parsed_result).to.have.property('success', true)
    expect(parsed_result).to.have.property('change_request_id').that.is.a('string')

    // Verify the file was created in the change request branch
    const cr_id = parsed_result.change_request_id
    const cr_branch = `cr/${cr_id}` // Assuming this is the branch naming convention

    // Checkout the branch and verify file content
    await execute(`git checkout ${cr_branch}`, { cwd: system_repo.path })
    const file_exists = await fs
      .access(path.join(system_repo.path, 'new-file.md'))
      .then(() => true)
      .catch(() => false)
    expect(file_exists).to.be.true

    if (file_exists) {
      const content = await fs.readFile(
        path.join(system_repo.path, 'new-file.md'),
        'utf8'
      )
      expect(content).to.equal('# New content')
    }
  })

  it('should read a file with file_read', async function () {
    // Create a test file with specific content
    const test_content = '# Test Content\n\nThis is test content.'
    await fs.writeFile(
      path.join(user_repo.path, 'concepts/test-file.md'),
      test_content
    )
    await execute('git add concepts/test-file.md', { cwd: user_repo.path })
    await execute('git commit -m "Add test file"', { cwd: user_repo.path })

    const result = await mcp_client.callTool({
      name: 'file_read',
      arguments: {
        path: 'concepts/test-file.md',
        change_request_id: 'main', // Using branch name as change_request_id for this test
        repo_path: user_repo.path
      }
    })

    const parsed_result = parse_mcp_response(result)
    expect(parsed_result).to.have.property('content')
    expect(parsed_result.content).to.include('Test Content')
    expect(parsed_result.content).to.include('This is test content')
  })

  it('should list files with file_list', async function () {
    const result = await mcp_client.callTool({
      name: 'file_list',
      arguments: {
        path: 'concepts',
        branch: 'main', // Using branch name directly
        repo_path: user_repo.path
      }
    })

    const parsed_result = parse_mcp_response(result)
    expect(parsed_result).to.have.property('files')
    expect(parsed_result.files).to.include('concepts/file1.md')
    expect(parsed_result.files).to.include('concepts/file2.md')
    expect(parsed_result.files).to.include('concepts/dir/file3.md')
  })

  it('should return diff between branches with file_diff', async function () {
    // Create a branch with changes
    await execute('git checkout -b feature-branch', {
      cwd: system_repo.path
    })
    await fs.writeFile(
      path.join(system_repo.path, 'README.md'),
      '# Test System Repository\n\nUpdated content'
    )
    await execute('git add README.md', { cwd: system_repo.path })
    await execute('git commit -m "Update README"', {
      cwd: system_repo.path
    })
    await execute('git checkout main', { cwd: system_repo.path })

    const result = await mcp_client.callTool({
      name: 'file_diff',
      arguments: {
        path: 'README.md',
        branch: 'feature-branch',
        compare_with: 'main',
        repo_path: system_repo.path
      }
    })

    const parsed_result = parse_mcp_response(result)
    expect(parsed_result).to.have.property('diff')
    expect(parsed_result.diff).to.include('Updated content')
  })

  it('should search for content with file_search', async function () {
    // Add a file with unique searchable content
    const unique_term = `unique-search-term-${Date.now()}`
    await fs.writeFile(
      path.join(user_repo.path, 'concepts/searchable.md'),
      `This file contains a ${unique_term} pattern`
    )
    await execute('git add concepts/searchable.md', {
      cwd: user_repo.path
    })
    await execute('git commit -m "Add searchable content"', {
      cwd: user_repo.path
    })

    const result = await mcp_client.callTool({
      name: 'file_search',
      arguments: {
        query: unique_term,
        branch: 'main',
        repo_path: user_repo.path
      }
    })

    const parsed_result = parse_mcp_response(result)
    expect(parsed_result).to.have.property('results')
    expect(parsed_result).to.have.property('count')
    expect(parsed_result.count).to.be.greaterThan(0)
    // Ensure the search results contain our term
    const result_content = parsed_result.results.map((r) => r.content || '').join(' ')
    expect(result_content).to.include(unique_term)
  })

  it('should handle file modifications with file_write', async function () {
    // First create a file
    const create_result = await mcp_client.callTool({
      name: 'file_write',
      arguments: {
        path: 'file-to-modify.md',
        content: '# Original Content\n\nThis will be modified.',
        branch: 'main',
        repo_path: system_repo.path
      }
    })

    const parsed_create_result = parse_mcp_response(create_result)
    expect(parsed_create_result).to.have.property('success', true)

    // Then modify it in the same branch
    const modify_result = await mcp_client.callTool({
      name: 'file_write',
      arguments: {
        path: 'file-to-modify.md',
        content: '# Modified Content\n\nThis has been modified.',
        branch: 'main',
        commit_message: 'Modify file',
        repo_path: system_repo.path
      }
    })

    const parsed_modify_result = parse_mcp_response(modify_result)
    expect(parsed_modify_result).to.have.property('success', true)

    // Verify the file was modified
    const file_content = await fs.readFile(
      path.join(system_repo.path, 'file-to-modify.md'),
      'utf8'
    )
    expect(file_content).to.include('Modified Content')
    expect(file_content).to.include('This has been modified')
  })

  it('should support file deletion with file_delete', async function () {
    // First create a file to delete
    const create_result = await mcp_client.callTool({
      name: 'file_write',
      arguments: {
        path: 'file-to-delete.md',
        content: '# File to delete',
        branch: 'main',
        repo_path: system_repo.path
      }
    })

    const parsed_create_result = parse_mcp_response(create_result)
    expect(parsed_create_result).to.have.property('success', true)

    // Verify the file exists
    const file_exists_before = await fs
      .access(path.join(system_repo.path, 'file-to-delete.md'))
      .then(() => true)
      .catch(() => false)
    expect(file_exists_before).to.be.true

    // Then delete it
    const delete_result = await mcp_client.callTool({
      name: 'file_delete',
      arguments: {
        path: 'file-to-delete.md',
        branch: 'main',
        commit_message: 'Delete file',
        repo_path: system_repo.path
      }
    })

    const parsed_delete_result = parse_mcp_response(delete_result)
    expect(parsed_delete_result).to.have.property('success', true)

    // Verify the file is gone
    const file_exists_after = await fs
      .access(path.join(system_repo.path, 'file-to-delete.md'))
      .then(() => true)
      .catch(() => false)
    expect(file_exists_after).to.be.false
  })
})
