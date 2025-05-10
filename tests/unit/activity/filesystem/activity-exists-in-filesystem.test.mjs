import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import config from '#config'

import { activity_exists_in_filesystem } from '#libs-server/activity/filesystem/activity-exists-in-filesystem.mjs'
import { create_temp_test_directory } from '#tests/utils/index.mjs'
import create_temp_test_repo from '#tests/utils/create-temp-test-repo.mjs'

describe('activity_exists_in_filesystem', () => {
  let temp_dir
  let cleanup
  let original_system_base_directory
  let original_user_base_directory

  beforeEach(() => {
    // Save original config values
    original_system_base_directory = config.system_base_directory
    original_user_base_directory = config.user_base_directory

    // Create temporary directory for tests
    const temp_directory = create_temp_test_directory('activity-exists-test-')
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

  it('should return true when system activity exists', async () => {
    // Arrange
    const activity_id = 'system/test-activity.md'
    const system_dir = path.join(temp_dir, 'system', 'activity')
    await fs.mkdir(system_dir, { recursive: true })
    await fs.writeFile(
      path.join(system_dir, 'test-activity.md'),
      '# Test Activity'
    )

    // Act
    const exists = await activity_exists_in_filesystem({
      activity_id
    })

    // Assert
    expect(exists).to.be.true
  })

  it('should return true when user activity exists', async () => {
    // Arrange
    const activity_id = 'user/test-activity.md'
    const user_dir = path.join(temp_dir, 'activity')
    await fs.mkdir(user_dir, { recursive: true })
    await fs.writeFile(
      path.join(user_dir, 'test-activity.md'),
      '# Test Activity'
    )

    // Act
    const exists = await activity_exists_in_filesystem({
      activity_id
    })

    // Assert
    expect(exists).to.be.true
  })

  it('should return false when activity does not exist', async () => {
    // Arrange
    const activity_id = 'system/non-existent-activity.md'

    // Act
    const exists = await activity_exists_in_filesystem({
      activity_id
    })

    // Assert
    expect(exists).to.be.false
  })

  it('should return false when activity path is invalid', async () => {
    // Act
    const exists = await activity_exists_in_filesystem({
      activity_id: 'invalid-path'
    })

    // Assert
    expect(exists).to.be.false
  })

  it('should return false when activity_id is not provided', async () => {
    // Act
    const exists = await activity_exists_in_filesystem({})

    // Assert
    expect(exists).to.be.false
  })

  it('should use custom system_base_directory when provided', async () => {
    // Arrange
    const custom_dir = path.join(temp_dir, 'custom-system')
    const system_dir = path.join(custom_dir, 'system', 'activity')
    await fs.mkdir(system_dir, { recursive: true })
    await fs.writeFile(
      path.join(system_dir, 'custom-activity.md'),
      '# Custom Activity'
    )

    // Act
    const exists = await activity_exists_in_filesystem({
      activity_id: 'system/custom-activity.md',
      system_base_directory: custom_dir
    })

    // Assert
    expect(exists).to.be.true
  })

  it('should use custom user_base_directory when provided', async () => {
    // Arrange
    const custom_dir = path.join(temp_dir, 'custom-user')
    const user_dir = path.join(custom_dir, 'activity')
    await fs.mkdir(user_dir, { recursive: true })
    await fs.writeFile(
      path.join(user_dir, 'custom-activity.md'),
      '# Custom Activity'
    )

    // Act
    const exists = await activity_exists_in_filesystem({
      activity_id: 'user/custom-activity.md',
      user_base_directory: custom_dir
    })

    // Assert
    expect(exists).to.be.true
  })
})

// Add tests using git repository approach from the old activities-test.mjs
describe('activity_exists_in_filesystem with git repository', () => {
  let test_repo

  before(async () => {
    // Create a temporary git repository with test activities
    test_repo = await create_temp_test_repo()
  })

  after(() => {
    // Clean up the test repository
    if (test_repo) {
      test_repo.cleanup()
    }
  })

  it('should return true for existing activities in git repo', async () => {
    // Act
    const system_activity_exists = await activity_exists_in_filesystem({
      activity_id: 'system/default-base-activity.md',
      system_base_directory: test_repo.path,
      user_base_directory: test_repo.path
    })

    // Assert
    expect(system_activity_exists).to.be.true
  })

  it('should return false for non-existent activities in git repo', async () => {
    // Arrange
    const non_existent_path = 'system/nonexistent-activity.md'

    // Act
    const activity_exists_result = await activity_exists_in_filesystem({
      activity_id: non_existent_path,
      system_base_directory: test_repo.path,
      user_base_directory: test_repo.path
    })

    // Assert
    expect(activity_exists_result).to.be.false
  })
})
