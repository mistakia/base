/* global describe it beforeEach afterEach */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

// Import the functions we want to test
import {
  write_file_to_git,
  list_files_in_git
} from '#libs-server/git/git-files/index.mjs'

// Import test utilities
import {
  create_temp_test_repo,
  create_temp_test_directory
} from '#tests/utils/index.mjs'

const execute = promisify(exec)
const expect = chai.expect

describe('list_files_in_git', function () {
  let test_repo
  let remote_repo

  // Create test repositories before tests
  beforeEach(async function () {
    // Create test repositories
    test_repo = await create_temp_test_repo({
      prefix: 'git-list-test-'
    })

    // Create bare remote repository
    remote_repo = create_temp_test_directory('git-list-remote-')
    await execute('git init --bare', { cwd: remote_repo.path })

    // Add remote to test repo
    await execute(`git remote add origin ${remote_repo.path}`, {
      cwd: test_repo.path
    })

    // Push to remote
    await execute('git push -u origin main', { cwd: test_repo.path })

    // Create a feature branch
    await execute('git checkout -b feature-branch', { cwd: test_repo.path })

    // Add some files to feature branch
    await fs.writeFile(
      path.join(test_repo.path, 'feature.md'),
      '# Feature Content\n\nThis is a special feature file with unique text.'
    )
    await execute('git add feature.md', { cwd: test_repo.path })
    await execute('git commit -m "Add feature"', { cwd: test_repo.path })

    // Create a subdirectory with additional files
    await fs.mkdir(path.join(test_repo.path, 'docs'), { recursive: true })
    await fs.writeFile(
      path.join(test_repo.path, 'docs', 'guide.md'),
      '# User Guide\n\nThis is a guide with content.'
    )
    await fs.writeFile(
      path.join(test_repo.path, 'docs', 'api.md'),
      '# API Documentation\n\nAPI details here.'
    )
    await execute('git add docs', { cwd: test_repo.path })
    await execute('git commit -m "Add documentation files"', {
      cwd: test_repo.path
    })

    await execute('git push -u origin feature-branch', { cwd: test_repo.path })

    // Return to main branch
    await execute('git checkout main', { cwd: test_repo.path })

    // Add some files to main branch
    await fs.writeFile(
      path.join(test_repo.path, 'main-file.md'),
      '# Main Branch File\n\nThis file exists only in main.'
    )
    await execute('git add main-file.md', { cwd: test_repo.path })
    await execute('git commit -m "Add main branch file"', {
      cwd: test_repo.path
    })
    await execute('git push origin main', { cwd: test_repo.path })
  })

  // Clean up after tests
  afterEach(async function () {
    if (test_repo) {
      test_repo.cleanup()
    }
    if (remote_repo) {
      remote_repo.cleanup()
    }
  })

  it('should list files in the main branch', async function () {
    // Test listing files in main branch
    const result = await list_files_in_git({
      repo_path: test_repo.path,
      branch: 'main'
    })

    // Validate result
    expect(result.success).to.be.true
    expect(result.branch).to.equal('main')
    expect(result.files).to.be.an('array')

    // Should contain README.md and main-file.md
    expect(result.files).to.include('README.md')
    expect(result.files).to.include('main-file.md')

    // Should not contain feature branch files
    expect(result.files).to.not.include('feature.md')
    expect(result.files).to.not.include('docs/guide.md')
  })

  it('should list files in the feature branch', async function () {
    // Test listing files in feature branch
    const result = await list_files_in_git({
      repo_path: test_repo.path,
      branch: 'feature-branch'
    })

    // Validate result
    expect(result.success).to.be.true
    expect(result.branch).to.equal('feature-branch')
    expect(result.files).to.be.an('array')

    // Should contain README.md and feature branch files
    expect(result.files).to.include('README.md')
    expect(result.files).to.include('feature.md')
    expect(result.files).to.include('docs/guide.md')
    expect(result.files).to.include('docs/api.md')

    // Should not contain main branch files
    expect(result.files).to.not.include('main-file.md')
  })

  it('should list files with path pattern filter', async function () {
    // Test listing files with path filter
    const result = await list_files_in_git({
      repo_path: test_repo.path,
      branch: 'feature-branch',
      path_pattern: 'docs/*.md'
    })

    // Validate result
    expect(result.success).to.be.true
    expect(result.path_pattern).to.equal('docs/*.md')
    expect(result.files).to.be.an('array')

    // Should only contain matching files
    expect(result.files).to.include('docs/guide.md')
    expect(result.files).to.include('docs/api.md')

    // Should not contain files outside the pattern
    expect(result.files).to.not.include('README.md')
    expect(result.files).to.not.include('feature.md')
  })

  it('should handle directories with path filter', async function () {
    // Test listing files with directory filter
    const result = await list_files_in_git({
      repo_path: test_repo.path,
      branch: 'feature-branch',
      path_pattern: 'docs'
    })

    // Validate result
    expect(result.success).to.be.true
    expect(result.files).to.be.an('array')
    expect(result.files.length).to.be.at.least(2)

    // Should only contain files in the docs directory
    expect(result.files.every((file) => file.startsWith('docs/'))).to.be.true
  })

  it('should handle non-existent branches gracefully', async function () {
    const result = await list_files_in_git({
      repo_path: test_repo.path,
      branch: 'non-existent-branch'
    })

    expect(result.success).to.be.false
    expect(result.error).to.include('Branch non-existent-branch does not exist')
  })

  it('should handle invalid path patterns gracefully', async function () {
    // Add a file to use in the test
    await write_file_to_git({
      repo_path: test_repo.path,
      file_path: 'test.txt',
      content: 'Test content',
      branch: 'main',
      commit_message: 'Add test file'
    })

    const result = await list_files_in_git({
      repo_path: test_repo.path,
      branch: 'main',
      path_pattern: 'definitely/not/a/real/path/*'
    })

    // Should succeed but return empty list
    expect(result.success).to.be.true
    expect(result.files).to.be.an('array')
    expect(result.files.length).to.equal(0)
  })

  it('should validate required parameters', async function () {
    // Test missing repo_path
    try {
      await list_files_in_git({
        branch: 'main'
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('Repository path is required')
    }

    // Test missing branch
    try {
      await list_files_in_git({
        repo_path: test_repo.path
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('Branch is required')
    }
  })
})
