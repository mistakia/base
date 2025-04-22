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
  create_temp_test_directory,
  create_test_thread
} from '#tests/utils/index.mjs'

const execute = promisify(exec)
const expect = chai.expect

// Helper function to parse MCP response
function parse_mcp_response(response) {
  // If the response has content property (indicating it's wrapped), extract the data
  if (
    response.content &&
    Array.isArray(response.content) &&
    response.content.length > 0
  ) {
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
  let test_thread

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

    // Create a test thread that will use our repositories
    test_thread = await create_test_thread({
      system_base_directory: system_repo.path,
      user_base_directory: user_repo.path,
      thread_main_request: 'Initial test message'
    })
  })

  // Clean up after all tests
  afterEach(async function () {
    try {
      // Clean up test thread resources
      if (test_thread && test_thread.cleanup) {
        test_thread.cleanup()
      }

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

  it('should write to a file with file_write using thread_id', async function () {
    const result = await mcp_client.callTool({
      name: 'file_write',
      arguments: {
        path: 'new-file.md',
        content: '# New content',
        thread_id: test_thread.thread_id,
        repo_path: system_repo.path,
        commit_message: 'Add new content'
      }
    })

    // Parse the response properly
    const parsed_result = parse_mcp_response(result)

    // Verify the operation succeeded according to the response
    expect(parsed_result).to.have.property('success', true)
    expect(parsed_result)
      .to.have.property('branch')
      .that.includes(test_thread.thread_id)
    expect(parsed_result).to.have.property('file_path', 'new-file.md')
    expect(parsed_result).to.have.property('operation', 'update')
    expect(parsed_result)
      .to.have.property('message')
      .that.includes('completed successfully')
  })

  it('should read a file with file_read using thread_id', async function () {
    // Create a test file with specific content in the thread branch
    const test_content =
      '# Test Content\n\nThis is test content for thread branch.'

    // First write the file to the thread branch
    await mcp_client.callTool({
      name: 'file_write',
      arguments: {
        path: 'thread-test-file.md',
        content: test_content,
        thread_id: test_thread.thread_id,
        repo_path: user_repo.path,
        commit_message: 'Add test file to thread branch'
      }
    })

    // Then read it back using file_read
    const result = await mcp_client.callTool({
      name: 'file_read',
      arguments: {
        path: 'thread-test-file.md',
        thread_id: test_thread.thread_id,
        repo_path: user_repo.path
      }
    })

    const parsed_result = parse_mcp_response(result)
    expect(parsed_result).to.have.property('content')
    expect(parsed_result.content).to.include('Test Content')
    expect(parsed_result.content).to.include('for thread branch')
  })

  it('should list files with file_list using thread_id', async function () {
    // First create a file in the thread branch
    await mcp_client.callTool({
      name: 'file_write',
      arguments: {
        path: 'concepts/thread-specific-file.md',
        content: '# Thread Specific File',
        thread_id: test_thread.thread_id,
        repo_path: user_repo.path,
        commit_message: 'Add thread-specific file'
      }
    })

    const result = await mcp_client.callTool({
      name: 'file_list',
      arguments: {
        path: 'concepts',
        thread_id: test_thread.thread_id,
        repo_path: user_repo.path
      }
    })

    const parsed_result = parse_mcp_response(result)
    expect(parsed_result).to.have.property('files')
    expect(parsed_result.files).to.include('concepts/file1.md')
    expect(parsed_result.files).to.include('concepts/file2.md')
    expect(parsed_result.files).to.include('concepts/dir/file3.md')
    expect(parsed_result.files).to.include('concepts/thread-specific-file.md')
  })

  it('should return diff between thread branch and main with file_diff', async function () {
    // Add a file to the thread branch
    await mcp_client.callTool({
      name: 'file_write',
      arguments: {
        path: 'README.md',
        content: '# Test System Repository\n\nThread branch content',
        thread_id: test_thread.thread_id,
        repo_path: system_repo.path,
        commit_message: 'Update README in thread branch'
      }
    })

    const result = await mcp_client.callTool({
      name: 'file_diff',
      arguments: {
        path: 'README.md',
        thread_id: test_thread.thread_id,
        compare_with: 'main', // Compare thread branch against main
        repo_path: system_repo.path
      }
    })

    const parsed_result = parse_mcp_response(result)
    expect(parsed_result).to.have.property('diff')
    // The diff should include the thread branch content we added
    expect(parsed_result.diff).to.include('Thread branch content')
  })

  it('should search for content with file_search in thread branch', async function () {
    // Add a file with unique searchable content to the thread branch
    const unique_term = `thread-unique-term-${Date.now()}`

    await mcp_client.callTool({
      name: 'file_write',
      arguments: {
        path: 'concepts/thread-searchable.md',
        content: `This file contains a ${unique_term} pattern`,
        thread_id: test_thread.thread_id,
        repo_path: user_repo.path,
        commit_message: 'Add searchable content to thread branch'
      }
    })

    const result = await mcp_client.callTool({
      name: 'file_search',
      arguments: {
        query: unique_term,
        thread_id: test_thread.thread_id,
        repo_path: user_repo.path
      }
    })

    const parsed_result = parse_mcp_response(result)
    expect(parsed_result).to.have.property('results')
    expect(parsed_result).to.have.property('count')
    expect(parsed_result.count).to.be.greaterThan(0)
    // Ensure the search results contain our term
    const result_content = parsed_result.results
      .map((r) => r.content || '')
      .join(' ')
    expect(result_content).to.include(unique_term)
  })

  it('should handle file modifications with file_write in thread branch', async function () {
    // First create a file in the thread branch
    const create_result = await mcp_client.callTool({
      name: 'file_write',
      arguments: {
        path: 'thread-file-to-modify.md',
        content: '# Original Thread Content\n\nThis will be modified.',
        thread_id: test_thread.thread_id,
        repo_path: system_repo.path,
        commit_message: 'Add file to thread branch'
      }
    })

    const parsed_create_result = parse_mcp_response(create_result)
    expect(parsed_create_result).to.have.property('success', true)

    // Then modify it in the same thread branch
    const modify_result = await mcp_client.callTool({
      name: 'file_write',
      arguments: {
        path: 'thread-file-to-modify.md',
        content:
          '# Modified Thread Content\n\nThis has been modified in the thread.',
        thread_id: test_thread.thread_id,
        repo_path: system_repo.path,
        commit_message: 'Modify file in thread branch'
      }
    })

    const parsed_modify_result = parse_mcp_response(modify_result)
    expect(parsed_modify_result).to.have.property('success', true)

    // Read the modified file to verify content
    const read_result = await mcp_client.callTool({
      name: 'file_read',
      arguments: {
        path: 'thread-file-to-modify.md',
        thread_id: test_thread.thread_id,
        repo_path: system_repo.path
      }
    })

    const parsed_read_result = parse_mcp_response(read_result)
    expect(parsed_read_result).to.have.property('content')
    expect(parsed_read_result.content).to.include('Modified Thread Content')
    expect(parsed_read_result.content).to.include('modified in the thread')
  })

  it('should support file deletion with file_delete in thread branch', async function () {
    // First create a file in the thread branch
    await mcp_client.callTool({
      name: 'file_write',
      arguments: {
        path: 'thread-file-to-delete.md',
        content: '# Thread file to delete',
        thread_id: test_thread.thread_id,
        repo_path: system_repo.path,
        commit_message: 'Add file to thread for deletion'
      }
    })

    // Verify file exists via file_read
    const read_result = await mcp_client.callTool({
      name: 'file_read',
      arguments: {
        path: 'thread-file-to-delete.md',
        thread_id: test_thread.thread_id,
        repo_path: system_repo.path
      }
    })

    const parsed_read_result = parse_mcp_response(read_result)
    expect(parsed_read_result).to.have.property('content')
    expect(parsed_read_result.content).to.include('Thread file to delete')

    // Then delete it
    const delete_result = await mcp_client.callTool({
      name: 'file_delete',
      arguments: {
        path: 'thread-file-to-delete.md',
        thread_id: test_thread.thread_id,
        repo_path: system_repo.path,
        commit_message: 'Delete file from thread branch'
      }
    })

    const parsed_delete_result = parse_mcp_response(delete_result)
    expect(parsed_delete_result).to.have.property('success', true)

    // Try to read the file - should fail or return an error
    try {
      const failed_read = await mcp_client.callTool({
        name: 'file_read',
        arguments: {
          path: 'thread-file-to-delete.md',
          thread_id: test_thread.thread_id,
          repo_path: system_repo.path
        }
      })

      const parsed_failed_read = parse_mcp_response(failed_read)
      // If we get a result, it should contain an error
      if (!parsed_failed_read.error) {
        expect.fail('Should not be able to read deleted file')
      }
    } catch (error) {
      // This is expected - file should not exist
    }
  })

  it('should apply a Git patch to a file using patch_content', async function () {
    // First create an initial file in the thread branch
    const initial_content = '# Patch Test File\n\nLine 1\nLine 2\nLine 3\n'
    await mcp_client.callTool({
      name: 'file_write',
      arguments: {
        path: 'patch-test-file.md',
        content: initial_content,
        thread_id: test_thread.thread_id,
        repo_path: system_repo.path,
        commit_message: 'Add file for patch testing'
      }
    })

    // Verify the file was created with the expected content
    const initial_read = await mcp_client.callTool({
      name: 'file_read',
      arguments: {
        path: 'patch-test-file.md',
        thread_id: test_thread.thread_id,
        repo_path: system_repo.path
      }
    })

    const parsed_initial = parse_mcp_response(initial_read)
    expect(parsed_initial.content).to.equal(initial_content)

    // Create a Git patch that modifies the file
    // This patch removes Line 2 and adds two new lines after Line 3
    const patch_content = `diff --git a/patch-test-file.md b/patch-test-file.md
index abcdef123..987654321 100644
--- a/patch-test-file.md
+++ b/patch-test-file.md
@@ -1,5 +1,6 @@
 # Patch Test File
 
 Line 1
-Line 2
 Line 3
+Line 4 - Added by patch
+Line 5 - Also added by patch
`

    // Apply the patch using file_write with patch_content
    const patch_result = await mcp_client.callTool({
      name: 'file_write',
      arguments: {
        path: 'patch-test-file.md',
        patch_content,
        thread_id: test_thread.thread_id,
        repo_path: system_repo.path,
        commit_message: 'Apply patch to test file'
      }
    })

    const parsed_patch_result = parse_mcp_response(patch_result)
    expect(parsed_patch_result).to.have.property('success', true)

    // Read the file after patching to verify the changes
    const after_patch_read = await mcp_client.callTool({
      name: 'file_read',
      arguments: {
        path: 'patch-test-file.md',
        thread_id: test_thread.thread_id,
        repo_path: system_repo.path
      }
    })

    const parsed_after_patch = parse_mcp_response(after_patch_read)

    // Verify the content was modified according to the patch
    expect(parsed_after_patch.content).to.include('Line 1')
    expect(parsed_after_patch.content).to.not.include('Line 2') // This line should be removed
    expect(parsed_after_patch.content).to.include('Line 3')
    expect(parsed_after_patch.content).to.include('Line 4 - Added by patch')
    expect(parsed_after_patch.content).to.include(
      'Line 5 - Also added by patch'
    )
  })
})
