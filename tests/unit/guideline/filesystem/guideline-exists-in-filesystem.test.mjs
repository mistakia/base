import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import config from '#config'

import { guideline_exists_in_filesystem } from '#libs-server/guideline/filesystem/guideline-exists-in-filesystem.mjs'
import { create_temp_test_directory } from '#tests/utils/index.mjs'
import create_temp_test_repo from '#tests/utils/create-temp-test-repo.mjs'

// Missing import for the Git repository test
import { promisify } from 'util'
import child_process from 'child_process'

describe('guideline_exists_in_filesystem', () => {
  let temp_dir
  let cleanup
  let original_system_base_directory
  let original_user_base_directory

  beforeEach(() => {
    // Save original config values
    original_system_base_directory = config.system_base_directory
    original_user_base_directory = config.user_base_directory

    // Create temporary directory for tests
    const temp_directory = create_temp_test_directory('guideline-exists-test-')
    temp_dir = temp_directory.path
    cleanup = temp_directory.cleanup

    // Set config directories to our test directory
    config.system_base_directory = temp_dir
    config.user_base_directory = temp_dir
  })

  afterEach(() => {
    // Restore original config values
    config.system_base_directory = original_system_base_directory
    config.user_base_directory = original_user_base_directory

    // Clean up temporary directory
    if (cleanup) {
      cleanup()
    }
  })

  it('should return true when system guideline exists', async () => {
    // Arrange
    const guideline_id = 'system/test-guideline.md'
    const system_dir = path.join(temp_dir, 'system', 'guideline')
    await fs.mkdir(system_dir, { recursive: true })
    await fs.writeFile(
      path.join(system_dir, 'test-guideline.md'),
      '# Test Guideline'
    )

    // Act
    const exists = await guideline_exists_in_filesystem({
      guideline_id
    })

    // Assert
    expect(exists).to.be.true
  })

  it('should return true when user guideline exists', async () => {
    // Arrange
    const guideline_id = 'user/test-guideline.md'
    const user_dir = path.join(temp_dir, 'guideline')
    await fs.mkdir(user_dir, { recursive: true })
    await fs.writeFile(
      path.join(user_dir, 'test-guideline.md'),
      '# Test Guideline'
    )

    // Act
    const exists = await guideline_exists_in_filesystem({
      guideline_id
    })

    // Assert
    expect(exists).to.be.true
  })

  it('should return false when guideline does not exist', async () => {
    // Arrange
    const guideline_id = 'system/non-existent-guideline.md'

    // Act
    const exists = await guideline_exists_in_filesystem({
      guideline_id
    })

    // Assert
    expect(exists).to.be.false
  })

  it('should return false when guideline path is invalid', async () => {
    // Act
    const exists = await guideline_exists_in_filesystem({
      guideline_id: 'invalid-path'
    })

    // Assert
    expect(exists).to.be.false
  })

  it('should return false when guideline_id is not provided', async () => {
    // Act
    const exists = await guideline_exists_in_filesystem({})

    // Assert
    expect(exists).to.be.false
  })

  it('should use custom system_base_directory when provided', async () => {
    // Arrange
    const custom_dir = path.join(temp_dir, 'custom-system')
    const system_dir = path.join(custom_dir, 'system', 'guideline')
    await fs.mkdir(system_dir, { recursive: true })
    await fs.writeFile(
      path.join(system_dir, 'custom-guideline.md'),
      '# Custom Guideline'
    )

    // Act
    const exists = await guideline_exists_in_filesystem({
      guideline_id: 'system/custom-guideline.md',
      system_base_directory: custom_dir
    })

    // Assert
    expect(exists).to.be.true
  })

  it('should use custom user_base_directory when provided', async () => {
    // Arrange
    const custom_dir = path.join(temp_dir, 'custom-user')
    const user_dir = path.join(custom_dir, 'guideline')
    await fs.mkdir(user_dir, { recursive: true })
    await fs.writeFile(
      path.join(user_dir, 'custom-guideline.md'),
      '# Custom Guideline'
    )

    // Act
    const exists = await guideline_exists_in_filesystem({
      guideline_id: 'user/custom-guideline.md',
      user_base_directory: custom_dir
    })

    // Assert
    expect(exists).to.be.true
  })
})

// Add tests using git repository approach for more realistic scenario
describe('guideline_exists_in_filesystem with git repository', () => {
  let test_repo

  before(async () => {
    // Create a temporary git repository with test guidelines
    test_repo = await create_temp_test_repo()

    // Add guideline files to the repo
    const system_dir = path.join(test_repo.path, 'system', 'guideline')
    await fs.mkdir(system_dir, { recursive: true })
    await fs.writeFile(
      path.join(system_dir, 'test-guideline.md'),
      '# Test System Guideline'
    )

    const user_dir = path.join(test_repo.path, 'guideline')
    await fs.mkdir(user_dir, { recursive: true })
    await fs.writeFile(
      path.join(user_dir, 'test-user-guideline.md'),
      '# Test User Guideline'
    )

    // Commit the files
    await fs.appendFile(
      path.join(test_repo.path, 'README.md'),
      '\n\nUpdated for guideline tests'
    )

    try {
      await exec('git add .', { cwd: test_repo.path })
      await exec('git commit -m "Add test guidelines"', { cwd: test_repo.path })
    } catch (error) {
      console.error('Error committing test files:', error)
    }
  })

  after(() => {
    // Clean up the test repository
    if (test_repo) {
      test_repo.cleanup()
    }
  })

  it('should return true for existing guidelines in git repo', async () => {
    // Act
    const system_guideline_exists = await guideline_exists_in_filesystem({
      guideline_id: 'system/test-guideline.md',
      system_base_directory: test_repo.path,
      user_base_directory: test_repo.path
    })

    const user_guideline_exists = await guideline_exists_in_filesystem({
      guideline_id: 'user/test-user-guideline.md',
      system_base_directory: test_repo.path,
      user_base_directory: test_repo.path
    })

    // Assert
    expect(system_guideline_exists).to.be.true
    expect(user_guideline_exists).to.be.true
  })

  it('should return false for non-existent guidelines in git repo', async () => {
    // Act
    const guideline_exists_result = await guideline_exists_in_filesystem({
      guideline_id: 'system/nonexistent-guideline.md',
      system_base_directory: test_repo.path,
      user_base_directory: test_repo.path
    })

    // Assert
    expect(guideline_exists_result).to.be.false
  })
})
const exec = promisify(child_process.exec)
