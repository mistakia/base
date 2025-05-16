import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import config from '#config'

import { read_activity_from_filesystem } from '#libs-server/activity/filesystem/read-activity-from-filesystem.mjs'
import { create_temp_test_directory } from '#tests/utils/index.mjs'
import create_temp_test_repo from '#tests/utils/create-temp-test-repo.mjs'

describe('read_activity_from_filesystem', () => {
  let temp_dir
  let cleanup
  let original_system_base_directory
  let original_user_base_directory

  beforeEach(() => {
    // Save original config values
    original_system_base_directory = config.system_base_directory
    original_user_base_directory = config.user_base_directory

    // Create temporary directory for tests
    const temp_directory = create_temp_test_directory('activity-read-test-')
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

  it('should successfully read a system activity', async () => {
    // Arrange
    const activity_base_relative_path = 'system/activity/test-activity.md'
    const activity_dir = path.join(temp_dir, 'system', 'activity')
    await fs.mkdir(activity_dir, { recursive: true })

    const activity_content = `---
title: "Test Activity"
type: "activity"
description: "This is a test activity"
tags: ["test", "activity"]
---

# Test Activity

This is a test activity content.
`

    await fs.writeFile(
      path.join(activity_dir, 'test-activity.md'),
      activity_content
    )

    // Act
    const result = await read_activity_from_filesystem({
      base_relative_path: activity_base_relative_path,
      root_base_directory: temp_dir
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.base_relative_path).to.equal(activity_base_relative_path)
    expect(result.absolute_path).to.equal(
      path.join(temp_dir, activity_base_relative_path)
    )
    expect(result.entity_properties).to.include({
      title: 'Test Activity',
      type: 'activity',
      description: 'This is a test activity'
    })
    expect(result.entity_properties.tags).to.deep.equal(['test', 'activity'])
    expect(result.entity_content).to.include('# Test Activity')
    expect(result.entity_content).to.include('This is a test activity content.')
    expect(result.raw_content).to.equal(activity_content)
  })

  it('should successfully read a user activity', async () => {
    // Arrange
    const activity_base_relative_path = 'user/activity/test-user-activity.md'
    const activity_dir = path.join(temp_dir, 'user', 'activity')
    await fs.mkdir(activity_dir, { recursive: true })

    const activity_content = `---
title: "User Activity"
type: "activity"
description: "This is a user activity"
tags: ["user", "test"]
---

# User Activity

This is user activity content.
`

    await fs.writeFile(
      path.join(activity_dir, 'test-user-activity.md'),
      activity_content
    )

    // Act
    const result = await read_activity_from_filesystem({
      base_relative_path: activity_base_relative_path,
      root_base_directory: temp_dir
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.base_relative_path).to.equal(activity_base_relative_path)
    expect(result.absolute_path).to.equal(
      path.join(temp_dir, activity_base_relative_path)
    )
    expect(result.entity_properties).to.include({
      title: 'User Activity',
      type: 'activity',
      description: 'This is a user activity'
    })
    expect(result.entity_properties.tags).to.deep.equal(['user', 'test'])
    expect(result.entity_content).to.include('# User Activity')
    expect(result.raw_content).to.equal(activity_content)
  })

  it('should return error when activity does not exist', async () => {
    // Arrange
    const activity_base_relative_path = 'system/non-existent-activity.md'

    // Act
    const result = await read_activity_from_filesystem({
      base_relative_path: activity_base_relative_path,
      root_base_directory: temp_dir
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.include('does not exist')
    expect(result.base_relative_path).to.equal(activity_base_relative_path)
  })

  it('should return error when activity_base_relative_path is invalid', async () => {
    // Act
    const result = await read_activity_from_filesystem({
      base_relative_path: 'invalid-path',
      root_base_directory: temp_dir
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should return error when activity_base_relative_path is not provided', async () => {
    // Act
    const result = await read_activity_from_filesystem({})

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should handle malformed frontmatter gracefully', async () => {
    // Arrange
    const activity_base_relative_path = 'system/malformed-activity.md'
    const system_dir = path.join(temp_dir, 'system', 'activity')
    await fs.mkdir(system_dir, { recursive: true })

    const malformed_content = `---
title: "Malformed Activity
description: Missing closing quote
---

# Malformed content
`

    await fs.writeFile(
      path.join(system_dir, 'malformed-activity.md'),
      malformed_content
    )

    // Act
    const result = await read_activity_from_filesystem({
      base_relative_path: activity_base_relative_path,
      root_base_directory: temp_dir
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should handle activity without type property', async () => {
    // Arrange
    const activity_base_relative_path = 'system/activity/no-type-activity.md'
    const activity_dir = path.join(temp_dir, 'system', 'activity')
    await fs.mkdir(activity_dir, { recursive: true })

    const no_type_content = `---
title: "No Type Activity"
description: "Activity without type"
---

# No Type Activity
`

    await fs.writeFile(
      path.join(activity_dir, 'no-type-activity.md'),
      no_type_content
    )

    // Act
    const result = await read_activity_from_filesystem({
      base_relative_path: activity_base_relative_path,
      root_base_directory: temp_dir
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.include('No entity type found')
  })

  it('should use custom system_base_directory when provided', async () => {
    // Arrange
    const activity_base_relative_path = 'system/activity/custom-activity.md'
    const custom_dir = path.join(temp_dir, 'custom-system')
    const activity_dir = path.join(custom_dir, 'system', 'activity')
    await fs.mkdir(activity_dir, { recursive: true })

    const activity_content = `---
title: "Custom System Activity"
type: "activity"
description: "This is a custom system activity"
---

# Custom System Activity
`

    await fs.writeFile(
      path.join(activity_dir, 'custom-activity.md'),
      activity_content
    )

    // Act
    const result = await read_activity_from_filesystem({
      base_relative_path: activity_base_relative_path,
      root_base_directory: custom_dir
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.entity_properties.title).to.equal('Custom System Activity')
    expect(result.absolute_path).to.equal(
      path.join(custom_dir, activity_base_relative_path)
    )
  })

  it('should use custom user_base_directory when provided', async () => {
    // Arrange
    const activity_base_relative_path = 'user/activity/custom-activity.md'
    const custom_dir = path.join(temp_dir, 'custom-user')
    const activity_dir = path.join(custom_dir, 'user', 'activity')
    await fs.mkdir(activity_dir, { recursive: true })

    const activity_content = `---
title: "Custom User Activity"
type: "activity"
description: "This is a custom user activity"
---

# Custom User Activity
`

    await fs.writeFile(
      path.join(activity_dir, 'custom-activity.md'),
      activity_content
    )

    // Act
    const result = await read_activity_from_filesystem({
      base_relative_path: activity_base_relative_path,
      root_base_directory: custom_dir
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.entity_properties.title).to.equal('Custom User Activity')
    expect(result.absolute_path).to.equal(
      path.join(custom_dir, activity_base_relative_path)
    )
  })
})

// Add tests using git repository approach from the old activities-test.mjs
describe('read_activity_from_filesystem with git repository', () => {
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

  it('should retrieve an existing activity file from git repo', async () => {
    // Arrange
    const activity_base_relative_path =
      'system/activity/default-base-activity.md'

    // Act
    const activity_file = await read_activity_from_filesystem({
      base_relative_path: activity_base_relative_path,
      root_base_directory: test_repo.path
    })
    // Assert
    expect(activity_file).to.be.an('object')
    expect(activity_file.success).to.be.true
    expect(activity_file.base_relative_path).to.equal(
      activity_base_relative_path
    )
    expect(activity_file.absolute_path).to.equal(
      path.join(test_repo.path, activity_base_relative_path)
    )
    expect(activity_file.entity_content).to.be.a('string')
    expect(activity_file.entity_content.length).to.be.greaterThan(0)
  })

  it('should return error object for non-existent activity files in git repo', async () => {
    // Arrange
    const activity_base_relative_path =
      'system/activity/nonexistent-activity.md'

    // Act
    const result = await read_activity_from_filesystem({
      base_relative_path: activity_base_relative_path,
      root_base_directory: test_repo.path
    })

    // Assert
    expect(result).to.be.an('object')
    expect(result.success).to.equal(false)
    expect(result.error).to.include(
      "Activity 'system/activity/nonexistent-activity.md' does not exist"
    )
  })
})
