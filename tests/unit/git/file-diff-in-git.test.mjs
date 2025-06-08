/* global describe it beforeEach afterEach */
import chai from 'chai'
import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

// Import the functions we want to test
import { file_diff_in_git } from '#libs-server/git/git-files/index.mjs'

// Import test utilities
import {
  create_temp_test_repo,
  create_temp_test_directory
} from '#tests/utils/index.mjs'

const execute = promisify(exec)
const expect = chai.expect

describe('file_diff_in_git', function () {
  let test_repo
  let remote_repo

  // Create test repositories before tests
  beforeEach(async function () {
    // Create test repositories
    test_repo = await create_temp_test_repo({
      prefix: 'git-diff-test-'
    })

    // Create bare remote repository
    remote_repo = create_temp_test_directory('git-diff-remote-')
    await execute('git init --bare', { cwd: remote_repo.path })

    // Add remote to test repo (using system repo)
    await execute(`git remote add origin ${remote_repo.path}`, {
      cwd: test_repo.system_path
    })

    // Push to remote
    await execute('git push -u origin main', { cwd: test_repo.system_path })

    // Create a feature branch
    await execute('git checkout -b feature-branch', {
      cwd: test_repo.system_path
    })

    // Add/modify files in feature branch
    await fs.writeFile(
      path.join(test_repo.system_path, 'feature-file.md'),
      '# Feature Content\n\nThis file only exists in the feature branch.'
    )
    await execute('git add feature-file.md', { cwd: test_repo.system_path })
    await execute('git commit -m "Add feature file"', {
      cwd: test_repo.system_path
    })

    // Modify README in feature branch
    await fs.writeFile(
      path.join(test_repo.system_path, 'README.md'),
      '# Test Repository\n\nThis README has been modified in the feature branch.'
    )
    await execute('git add README.md', { cwd: test_repo.system_path })
    await execute('git commit -m "Update README"', {
      cwd: test_repo.system_path
    })

    // Create a directory with files
    await fs.mkdir(path.join(test_repo.system_path, 'docs'), {
      recursive: true
    })
    await fs.writeFile(
      path.join(test_repo.system_path, 'docs', 'guide.md'),
      '# User Guide\n\nThis is a guide in the feature branch.'
    )
    await execute('git add docs', { cwd: test_repo.system_path })
    await execute('git commit -m "Add documentation"', {
      cwd: test_repo.system_path
    })

    await execute('git push -u origin feature-branch', {
      cwd: test_repo.system_path
    })

    // Return to main branch
    await execute('git checkout main', { cwd: test_repo.system_path })

    // Add another file to main branch (different from feature branch)
    await fs.writeFile(
      path.join(test_repo.system_path, 'main-file.md'),
      '# Main Branch File\n\nThis file only exists in the main branch.'
    )
    await execute('git add main-file.md', { cwd: test_repo.system_path })
    await execute('git commit -m "Add main branch file"', {
      cwd: test_repo.system_path
    })
    await execute('git push origin main', { cwd: test_repo.system_path })
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

  it('should get the diff between two branches for the entire repository', async function () {
    const result = await file_diff_in_git({
      repo_path: test_repo.system_path,
      from_branch: 'main',
      to_branch: 'feature-branch'
    })

    // Validate result
    expect(result.success).to.be.true
    expect(result.from_branch).to.equal('main')
    expect(result.to_branch).to.equal('feature-branch')
    expect(result.diff).to.be.a('string')

    // Diff should include added and modified files
    expect(result.diff).to.include('feature-file.md')
    expect(result.diff).to.include('README.md')
    expect(result.diff).to.include('docs/guide.md')

    // Modified README content should be in the diff
    expect(result.diff).to.include('modified in the feature branch')
  })

  it('should get the diff for a specific file between branches', async function () {
    const result = await file_diff_in_git({
      repo_path: test_repo.system_path,
      file_path: 'README.md',
      from_branch: 'main',
      to_branch: 'feature-branch'
    })

    // Validate result
    expect(result.success).to.be.true
    expect(result.file_path).to.equal('README.md')
    expect(result.diff).to.be.a('string')

    // Diff should include only the README changes
    expect(result.diff).to.include('README.md')
    expect(result.diff).to.include('modified in the feature branch')

    // Diff should not include other files
    expect(result.diff).to.not.include('feature-file.md')
    expect(result.diff).to.not.include('docs/guide.md')
  })

  it('should get the diff for a directory between branches', async function () {
    const result = await file_diff_in_git({
      repo_path: test_repo.system_path,
      file_path: 'docs',
      from_branch: 'main',
      to_branch: 'feature-branch'
    })

    // Validate result
    expect(result.success).to.be.true
    expect(result.file_path).to.equal('docs')
    expect(result.diff).to.be.a('string')

    // Diff should include only docs directory changes
    expect(result.diff).to.include('docs/guide.md')

    // Diff should not include other files
    expect(result.diff).to.not.include('README.md')
    expect(result.diff).to.not.include('feature-file.md')
  })

  it('should support different diff formats', async function () {
    // Test name-only format
    const name_only_result = await file_diff_in_git({
      repo_path: test_repo.system_path,
      from_branch: 'main',
      to_branch: 'feature-branch',
      format: 'name-only'
    })

    expect(name_only_result.success).to.be.true
    expect(name_only_result.format).to.equal('name-only')
    expect(name_only_result.diff).to.be.a('string')

    // Should only include file names, not content
    expect(name_only_result.diff).to.include('README.md')
    expect(name_only_result.diff).to.include('feature-file.md')
    expect(name_only_result.diff).to.not.include('# Test Repository')

    // Test stat format
    const stat_result = await file_diff_in_git({
      repo_path: test_repo.system_path,
      from_branch: 'main',
      to_branch: 'feature-branch',
      format: 'stat'
    })

    expect(stat_result.success).to.be.true
    expect(stat_result.format).to.equal('stat')
    expect(stat_result.diff).to.be.a('string')

    // Should include summary stats
    expect(stat_result.diff).to.include('README.md')
    expect(stat_result.diff).to.include('feature-file.md')
    // Stat output typically includes file counts or +/- indicators
    expect(stat_result.diff).to.match(/\+|-|files? changed/)
  })

  it('should handle non-existent branches gracefully', async function () {
    // Test with non-existent from_branch
    const from_branch_result = await file_diff_in_git({
      repo_path: test_repo.system_path,
      from_branch: 'non-existent-branch',
      to_branch: 'feature-branch'
    })

    expect(from_branch_result.success).to.be.false
    expect(from_branch_result.error).to.include(
      'From branch non-existent-branch does not exist'
    )

    // Test with non-existent to_branch
    const to_branch_result = await file_diff_in_git({
      repo_path: test_repo.system_path,
      from_branch: 'main',
      to_branch: 'non-existent-branch'
    })

    expect(to_branch_result.success).to.be.false
    expect(to_branch_result.error).to.include(
      'To branch non-existent-branch does not exist'
    )
  })

  it('should validate required parameters', async function () {
    // Test missing repo_path
    try {
      await file_diff_in_git({
        from_branch: 'main',
        to_branch: 'feature-branch'
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('Repository path is required')
    }

    // Test missing from_branch
    try {
      await file_diff_in_git({
        repo_path: test_repo.system_path,
        to_branch: 'feature-branch'
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('From branch is required')
    }

    // Test missing to_branch
    try {
      await file_diff_in_git({
        repo_path: test_repo.system_path,
        from_branch: 'main'
      })
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error.message).to.equal('To branch is required')
    }
  })
})
