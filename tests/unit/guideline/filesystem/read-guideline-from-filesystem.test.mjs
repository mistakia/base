import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import config from '#config'

import { read_guideline_from_filesystem } from '#libs-server/guideline/filesystem/read-guideline-from-filesystem.mjs'
import { create_temp_test_directory } from '#tests/utils/index.mjs'
import create_temp_test_repo from '#tests/utils/create-temp-test-repo.mjs'

// Missing import for the Git repository test
import { promisify } from 'util'
import child_process from 'child_process'

describe('read_guideline_from_filesystem', () => {
  let temp_dir
  let cleanup
  let original_system_base_directory
  let original_user_base_directory

  beforeEach(async () => {
    // Save original config values
    original_system_base_directory = config.system_base_directory
    original_user_base_directory = config.user_base_directory

    // Create temporary directory for tests
    const temp_directory = create_temp_test_directory('read-guideline-test-')
    temp_dir = temp_directory.path
    cleanup = temp_directory.cleanup

    // Set config directories to our test directory
    config.system_base_directory = temp_dir
    config.user_base_directory = temp_dir

    // Create test directories
    const system_dir = path.join(temp_dir, 'system', 'guideline')
    const user_dir = path.join(temp_dir, 'guideline')
    await fs.mkdir(system_dir, { recursive: true })
    await fs.mkdir(user_dir, { recursive: true })

    // Create test files
    const system_guideline_content = `---
title: "System Guideline"
description: "System guideline for testing"
---

# System Guideline

This is a system guideline for testing.
`
    await fs.writeFile(
      path.join(system_dir, 'test-system-guideline.md'),
      system_guideline_content
    )

    const user_guideline_content = `---
title: "User Guideline"
description: "User guideline for testing"
---

# User Guideline

This is a user guideline for testing.
`
    await fs.writeFile(
      path.join(user_dir, 'test-user-guideline.md'),
      user_guideline_content
    )
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

  it('should successfully read a system guideline', async () => {
    // Arrange
    const guideline_id = 'system/test-system-guideline.md'

    // Act
    const result = await read_guideline_from_filesystem({
      guideline_id
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.guideline_id).to.equal(guideline_id)
    expect(result.file_path).to.include(
      'system/guideline/test-system-guideline.md'
    )
    expect(result.content).to.include('# System Guideline')
    expect(result.content).to.include('This is a system guideline for testing.')
  })

  it('should successfully read a user guideline', async () => {
    // Arrange
    const guideline_id = 'user/test-user-guideline.md'

    // Act
    const result = await read_guideline_from_filesystem({
      guideline_id
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.guideline_id).to.equal(guideline_id)
    expect(result.file_path).to.include('guideline/test-user-guideline.md')
    expect(result.content).to.include('# User Guideline')
    expect(result.content).to.include('This is a user guideline for testing.')
  })

  it('should return error when guideline does not exist', async () => {
    // Arrange
    const guideline_id = 'system/non-existent-guideline.md'

    // Act
    const result = await read_guideline_from_filesystem({
      guideline_id
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.exists).to.be.false
    expect(result.error).to.include('does not exist in filesystem')
    expect(result.guideline_id).to.equal(guideline_id)
  })

  it('should return error for invalid guideline path', async () => {
    // Act
    const result = await read_guideline_from_filesystem({
      guideline_id: 'invalid-path'
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should return error when guideline_id is not provided', async () => {
    // Act
    const result = await read_guideline_from_filesystem({})

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should use custom system_base_directory when provided', async () => {
    // Arrange
    const custom_dir = path.join(temp_dir, 'custom-system')
    const system_dir = path.join(custom_dir, 'system', 'guideline')
    await fs.mkdir(system_dir, { recursive: true })

    const custom_guideline_content = '# Custom System Guideline'
    await fs.writeFile(
      path.join(system_dir, 'custom-guideline.md'),
      custom_guideline_content
    )

    // Act
    const result = await read_guideline_from_filesystem({
      guideline_id: 'system/custom-guideline.md',
      system_base_directory: custom_dir
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.content).to.equal(custom_guideline_content)
  })

  it('should use custom user_base_directory when provided', async () => {
    // Arrange
    const custom_dir = path.join(temp_dir, 'custom-user')
    const user_dir = path.join(custom_dir, 'guideline')
    await fs.mkdir(user_dir, { recursive: true })

    const custom_guideline_content = '# Custom User Guideline'
    await fs.writeFile(
      path.join(user_dir, 'custom-guideline.md'),
      custom_guideline_content
    )

    // Act
    const result = await read_guideline_from_filesystem({
      guideline_id: 'user/custom-guideline.md',
      user_base_directory: custom_dir
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.content).to.equal(custom_guideline_content)
  })
})

describe('read_guideline_from_filesystem with git repository', () => {
  let test_repo

  before(async () => {
    // Create a temporary git repository with test guidelines
    test_repo = await create_temp_test_repo()

    // Add guideline files to the repo
    const system_dir = path.join(test_repo.path, 'system', 'guideline')
    const user_dir = path.join(test_repo.path, 'guideline')
    await fs.mkdir(system_dir, { recursive: true })
    await fs.mkdir(user_dir, { recursive: true })

    const system_guideline_content = `# Test System Guideline
This is a system guideline in a git repo.`

    const user_guideline_content = `# Test User Guideline
This is a user guideline in a git repo.`

    await fs.writeFile(
      path.join(system_dir, 'test-guideline.md'),
      system_guideline_content
    )

    await fs.writeFile(
      path.join(user_dir, 'test-user-guideline.md'),
      user_guideline_content
    )

    // Commit the files
    await fs.appendFile(
      path.join(test_repo.path, 'README.md'),
      '\n\nUpdated for guideline read tests'
    )

    try {
      await exec('git add .', { cwd: test_repo.path })
      await exec('git commit -m "Add test guidelines for reading"', {
        cwd: test_repo.path
      })
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

  it('should successfully read guidelines from git repo', async () => {
    // Act
    const system_result = await read_guideline_from_filesystem({
      guideline_id: 'system/test-guideline.md',
      system_base_directory: test_repo.path,
      user_base_directory: test_repo.path
    })

    const user_result = await read_guideline_from_filesystem({
      guideline_id: 'user/test-user-guideline.md',
      system_base_directory: test_repo.path,
      user_base_directory: test_repo.path
    })

    // Assert
    expect(system_result.success).to.be.true
    expect(system_result.exists).to.be.true
    expect(system_result.content).to.include('Test System Guideline')

    expect(user_result.success).to.be.true
    expect(user_result.exists).to.be.true
    expect(user_result.content).to.include('Test User Guideline')
  })

  it('should return error for non-existent guideline in git repo', async () => {
    // Act
    const result = await read_guideline_from_filesystem({
      guideline_id: 'system/nonexistent-guideline.md',
      system_base_directory: test_repo.path,
      user_base_directory: test_repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.exists).to.be.false
    expect(result.error).to.include('does not exist in filesystem')
  })
})
const exec = promisify(child_process.exec)
