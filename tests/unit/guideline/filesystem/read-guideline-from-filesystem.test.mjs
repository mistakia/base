import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import config from '#config'
import { promisify } from 'util'
import child_process from 'child_process'

import { read_guideline_from_filesystem } from '#libs-server/guideline/filesystem/read-guideline-from-filesystem.mjs'
import {
  create_temp_test_directory,
  create_temp_test_repo
} from '#tests/utils/index.mjs'

const exec = promisify(child_process.exec)

describe('read_guideline_from_filesystem', () => {
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
    const system_guideline_content_repo = `---
title: "System Guideline"
type: "guideline"
description: "System guideline for testing"
tags: ["test", "git"]
---

# System Guideline

This is a system guideline for testing.
`
    await fs.writeFile(
      path.join(repo.path, system_guideline_base_relative_path),
      system_guideline_content_repo
    )

    // Write test user guideline
    const user_guideline_content_repo = `---
title: "User Guideline"
type: "guideline"
description: "User guideline for testing"
tags: ["user", "git"]
---

# User Guideline

This is a user guideline for testing.
`
    await fs.writeFile(
      path.join(repo.path, user_guideline_base_relative_path),
      user_guideline_content_repo
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

  afterEach(() => {
    // Restore original config values
    config.system_base_directory = original_system_base_directory
    config.user_base_directory = original_user_base_directory

    // Clean up temporary directory
    if (cleanup) {
      cleanup()
    }
  })

  after(() => {
    // Clean up temporary repository
    if (repo) {
      repo.cleanup()
    }
  })

  it('should successfully read a system guideline', async () => {
    // Act
    const result = await read_guideline_from_filesystem({
      base_relative_path: system_guideline_base_relative_path,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.base_relative_path).to.equal(
      system_guideline_base_relative_path
    )
    expect(result.absolute_path).to.equal(
      path.join(repo.path, system_guideline_base_relative_path)
    )
    expect(result.content).to.include('# System Guideline')
    expect(result.content).to.include('This is a system guideline for testing.')
  })

  it('should successfully read a user guideline', async () => {
    // Act
    const result = await read_guideline_from_filesystem({
      base_relative_path: user_guideline_base_relative_path,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.base_relative_path).to.equal(
      user_guideline_base_relative_path
    )
    expect(result.absolute_path).to.equal(
      path.join(repo.path, user_guideline_base_relative_path)
    )
    expect(result.content).to.include('# User Guideline')
    expect(result.content).to.include('This is a user guideline for testing.')
  })

  it('should return error when guideline does not exist', async () => {
    // Act
    const result = await read_guideline_from_filesystem({
      base_relative_path: non_existent_guideline_base_relative_path,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.exists).to.be.false
    expect(result.error).to.include('does not exist in filesystem')
    expect(result.base_relative_path).to.equal(
      non_existent_guideline_base_relative_path
    )
  })

  it('should return error for invalid guideline path', async () => {
    // Act
    const result = await read_guideline_from_filesystem({
      base_relative_path: 'invalid-path',
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should return error when base_relative_path is not provided', async () => {
    // Act
    const result = await read_guideline_from_filesystem({
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should use custom root_base_directory when provided', async () => {
    // Arrange
    const custom_dir = path.join(repo.path, 'custom')
    const custom_guideline_dir = path.join(custom_dir, 'system', 'guideline')
    await fs.mkdir(custom_guideline_dir, { recursive: true })

    const custom_guideline_content = `---
title: "Custom Guideline"
type: "guideline"
description: "Custom guideline for testing"
---

# Custom Guideline

This is a custom guideline for testing.
`
    await fs.writeFile(
      path.join(custom_guideline_dir, 'custom-guideline.md'),
      custom_guideline_content
    )

    // Act
    const result = await read_guideline_from_filesystem({
      base_relative_path: 'system/guideline/custom-guideline.md',
      root_base_directory: custom_dir
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.content).to.include('# Custom Guideline')
    expect(result.content).to.include('This is a custom guideline for testing.')
  })
})
