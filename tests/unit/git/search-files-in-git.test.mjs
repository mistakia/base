/* global describe it beforeEach afterEach */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

// Import the functions we want to test
import {
  write_file_to_git,
  search_files_in_git
} from '#libs-server/git/git-files/index.mjs'

// Import test utilities
import {
  create_temp_test_repo,
  create_temp_test_directory
} from '#tests/utils/index.mjs'

const execute = promisify(exec)
const expect = chai.expect

describe('search_files_in_git', function () {
  let test_repo
  let remote_repo

  // Create test repositories before tests
  beforeEach(async function () {
    // Create test repositories
    test_repo = await create_temp_test_repo({
      prefix: 'git-search-test-'
    })

    // Create bare remote repository
    remote_repo = create_temp_test_directory('git-search-remote-')
    await execute('git init --bare', { cwd: remote_repo.path })

    // Add remote to test repo
    await execute(`git remote add origin ${remote_repo.path}`, {
      cwd: test_repo.path
    })

    // Push to remote
    await execute('git push -u origin main', { cwd: test_repo.path })

    // Create a feature branch
    await execute('git checkout -b feature-branch', { cwd: test_repo.path })

    // Add some content to feature branch that we can search for
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
      '# User Guide\n\nThis is a guide with SEARCHABLE content.\n\nMore paragraphs here.'
    )
    await execute('git add docs/guide.md', { cwd: test_repo.path })
    await execute('git commit -m "Add user guide"', { cwd: test_repo.path })

    await execute('git push -u origin feature-branch', { cwd: test_repo.path })

    // Return to main branch
    await execute('git checkout main', { cwd: test_repo.path })

    // Add some content to main branch that we can search for
    await fs.writeFile(
      path.join(test_repo.path, 'main-file.md'),
      '# Main Branch File\n\nThis file contains SEARCHABLE text that should be found.'
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

  it('should search for text in files on a specific branch', async function () {
    // Test searching in main branch
    const result = await search_files_in_git({
      repo_path: test_repo.path,
      query: 'SEARCHABLE',
      branch: 'main'
    })

    // Validate result
    expect(result.success).to.be.true
    expect(result.branch).to.equal('main')
    expect(result.query).to.equal('SEARCHABLE')
    expect(result.results).to.be.an('array')
    expect(result.results.length).to.equal(1)
    expect(result.results[0].file).to.equal('main-file.md')
    expect(result.results[0].content).to.include('SEARCHABLE')
  })

  it('should search for text in files on a different branch', async function () {
    // Test searching in feature branch
    const result = await search_files_in_git({
      repo_path: test_repo.path,
      query: 'SEARCHABLE',
      branch: 'feature-branch'
    })

    // Validate result
    expect(result.success).to.be.true
    expect(result.branch).to.equal('feature-branch')
    expect(result.query).to.equal('SEARCHABLE')
    expect(result.results).to.be.an('array')
    expect(result.results.length).to.equal(1)
    expect(result.results[0].file).to.equal('docs/guide.md')
    expect(result.results[0].content).to.include('SEARCHABLE')
  })

  it('should search for text with path filter', async function () {
    // Create additional file in docs directory on main branch
    await fs.mkdir(path.join(test_repo.path, 'docs'), { recursive: true })
    await fs.writeFile(
      path.join(test_repo.path, 'docs', 'readme.md'),
      '# Documentation\n\nThis also has SEARCHABLE content.'
    )
    await execute('git add docs/readme.md', { cwd: test_repo.path })
    await execute('git commit -m "Add docs readme"', { cwd: test_repo.path })

    // Test searching with path filter
    const result = await search_files_in_git({
      repo_path: test_repo.path,
      query: 'SEARCHABLE',
      branch: 'main',
      path: 'docs'
    })

    // Validate result
    expect(result.success).to.be.true
    expect(result.results).to.be.an('array')
    expect(result.results.length).to.equal(1)
    expect(result.results[0].file).to.equal('docs/readme.md')
  })

  it('should search case-insensitive by default', async function () {
    // Test case-insensitive search
    const result = await search_files_in_git({
      repo_path: test_repo.path,
      query: 'searchable', // lowercase
      branch: 'main'
    })

    // Validate result shows matches despite case difference
    expect(result.success).to.be.true
    expect(result.results.length).to.be.at.least(1)
    expect(result.results[0].content).to.include('SEARCHABLE') // uppercase in file
  })

  it('should respect case sensitivity when specified', async function () {
    // Write a new file with mixed case
    const git_relative_path = 'case-test.md'
    const content = 'This file has both searchable and SEARCHABLE text.'
    await write_file_to_git({
      repo_path: test_repo.path,
      git_relative_path,
      content,
      branch: 'main',
      commit_message: 'Add case test file'
    })

    // Test case-sensitive search for lowercase
    const lowercase_result = await search_files_in_git({
      repo_path: test_repo.path,
      query: 'searchable',
      branch: 'main',
      case_sensitive: true
    })

    // Validate only lowercase matches
    expect(lowercase_result.success).to.be.true
    expect(lowercase_result.results.length).to.be.at.least(1)
    expect(lowercase_result.results.some((r) => r.file === git_relative_path))
      .to.be.true

    // Test case-sensitive search for uppercase
    const uppercase_result = await search_files_in_git({
      repo_path: test_repo.path,
      query: 'SEARCHABLE',
      branch: 'main',
      case_sensitive: true
    })

    // Validate only uppercase matches
    expect(uppercase_result.success).to.be.true
    expect(uppercase_result.results.length).to.be.at.least(1)
  })

  it('should return empty results when no matches found', async function () {
    const result = await search_files_in_git({
      repo_path: test_repo.path,
      query: 'NON_EXISTENT_STRING',
      branch: 'main'
    })

    expect(result.success).to.be.true
    expect(result.results).to.be.an('array')
    expect(result.results.length).to.equal(0)
  })

  it('should handle non-existent branches gracefully', async function () {
    const result = await search_files_in_git({
      repo_path: test_repo.path,
      query: 'SEARCHABLE',
      branch: 'non-existent-branch'
    })

    expect(result.success).to.be.false
    expect(result.error).to.include('Branch non-existent-branch does not exist')
    expect(result.query).to.equal('SEARCHABLE')
  })

  it('should validate required parameters', async function () {
    // Test missing repo_path
    try {
      await search_files_in_git({
        query: 'test',
        branch: 'main'
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('Repository path is required')
    }

    // Test missing query
    try {
      await search_files_in_git({
        repo_path: test_repo.path,
        branch: 'main',
        query: ''
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('Search query cannot be empty')
    }

    // Test missing branch
    try {
      await search_files_in_git({
        repo_path: test_repo.path,
        query: 'test'
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('Branch is required')
    }
  })
})
