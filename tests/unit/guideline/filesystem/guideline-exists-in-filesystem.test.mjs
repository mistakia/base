import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import config from '#config'
import { promisify } from 'util'
import child_process from 'child_process'

import { guideline_exists_in_filesystem } from '#libs-server/guideline/filesystem/guideline-exists-in-filesystem.mjs'
import {
  create_temp_test_directory,
  create_temp_test_repo
} from '#tests/utils/index.mjs'

const exec = promisify(child_process.exec)

describe('guideline_exists_in_filesystem', () => {
  let temp_dir
  let cleanup
  let original_system_base_directory
  let original_user_base_directory
  let repo
  const branch = 'main'

  // System guideline paths in the repo
  const system_guideline_dir = 'system/guideline'
  const system_guideline_filename = 'test-guideline.md'
  const system_guideline_base_relative_path = `${system_guideline_dir}/${system_guideline_filename}`

  // User guideline paths in the repo
  const user_guideline_dir = 'guideline'
  const user_guideline_filename = 'test-user-guideline.md'
  const user_guideline_base_relative_path = `${user_guideline_dir}/${user_guideline_filename}`

  const non_existent_guideline_base_relative_path =
    'system/guideline/non-existent.md'

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

  before(async () => {
    // Create a temporary git repository
    repo = await create_temp_test_repo()

    // Create system guideline directory
    await fs.mkdir(path.join(repo.path, system_guideline_dir), {
      recursive: true
    })

    // Create user guideline directory
    await fs.mkdir(path.join(repo.path, user_guideline_dir), {
      recursive: true
    })

    // Write test system guideline
    const system_guideline_content = `---
title: "Test Guideline"
type: "guideline"
description: "This is a test guideline"
tags: ["test", "git"]
---

# Test Guideline

This is a test guideline for Git.
`
    await fs.writeFile(
      path.join(repo.path, system_guideline_base_relative_path),
      system_guideline_content
    )

    // Write test user guideline
    const user_guideline_content = `---
title: "User Guideline"
type: "guideline"
description: "This is a user guideline"
tags: ["user", "git"]
---

# User Guideline

This is a user guideline for Git.
`
    await fs.writeFile(
      path.join(repo.path, user_guideline_base_relative_path),
      user_guideline_content
    )

    // Add files to git and commit
    await fs.appendFile(
      path.join(repo.path, 'README.md'),
      '\n\nUpdated for guideline tests'
    )

    // Execute git commands to add and commit the files
    await exec('git add .', { cwd: repo.path })
    await exec('git commit -m "Add test guidelines"', { cwd: repo.path })
  })

  after(() => {
    // Clean up temporary repository
    if (repo) {
      repo.cleanup()
    }
  })

  it('should return true when system guideline exists', async () => {
    // Act
    const exists = await guideline_exists_in_filesystem({
      base_relative_path: system_guideline_base_relative_path,
      root_base_directory: repo.path
    })

    // Assert
    expect(exists).to.be.true
  })

  it('should return true when user guideline exists', async () => {
    // Act
    const exists = await guideline_exists_in_filesystem({
      base_relative_path: user_guideline_base_relative_path,
      root_base_directory: repo.path
    })

    // Assert
    expect(exists).to.be.true
  })

  it('should return false when guideline does not exist', async () => {
    // Act
    const exists = await guideline_exists_in_filesystem({
      base_relative_path: non_existent_guideline_base_relative_path,
      root_base_directory: repo.path
    })

    // Assert
    expect(exists).to.be.false
  })

  it('should return false when guideline path is invalid', async () => {
    // Act
    const exists = await guideline_exists_in_filesystem({
      base_relative_path: 'invalid-path',
      root_base_directory: repo.path
    })

    // Assert
    expect(exists).to.be.false
  })

  it('should return false when base_relative_path is not provided', async () => {
    // Act
    const exists = await guideline_exists_in_filesystem({
      root_base_directory: repo.path
    })

    // Assert
    expect(exists).to.be.false
  })

  it('should use custom root_base_directory when provided', async () => {
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
      base_relative_path: 'system/guideline/custom-guideline.md',
      root_base_directory: custom_dir
    })

    // Assert
    expect(exists).to.be.true
  })
})
