import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import { promisify } from 'util'
import child_process from 'child_process'

import { read_guideline_from_filesystem } from '#libs-server/guideline/filesystem/read-guideline-from-filesystem.mjs'
import {
  register_base_directories,
  clear_registered_directories
} from '#libs-server/base-uri/index.mjs'
import { create_temp_test_repo } from '#tests/utils/index.mjs'

const exec = promisify(child_process.exec)

describe('read_guideline_from_filesystem', () => {
  let test_repo

  // System guideline URIs
  const system_guideline_filename = 'test-guideline.md'
  const system_guideline_base_uri = `sys:guideline/${system_guideline_filename}`

  // User guideline URIs
  const user_guideline_filename = 'test-user-guideline.md'
  const user_guideline_base_uri = `user:guideline/${user_guideline_filename}`

  const non_existent_guideline_base_uri = 'sys:guideline/non-existent.md'

  beforeEach(async () => {
    // Create test repo with both system and user directories
    test_repo = await create_temp_test_repo()

    // Create system guideline directory and file
    const system_guideline_dir = path.join(test_repo.system_path, 'guideline')
    await fs.mkdir(system_guideline_dir, { recursive: true })

    const system_guideline_content = `---
title: "System Guideline"
type: "guideline"
description: "System guideline for testing"
tags: ["test", "git"]
---

# System Guideline

This is a system guideline for testing.
`
    await fs.writeFile(
      path.join(system_guideline_dir, system_guideline_filename),
      system_guideline_content
    )

    // Create user guideline directory and file
    const user_guideline_dir = path.join(test_repo.user_path, 'guideline')
    await fs.mkdir(user_guideline_dir, { recursive: true })

    const user_guideline_content = `---
title: "User Guideline"
type: "guideline"
description: "User guideline for testing"
tags: ["user", "git"]
---

# User Guideline

This is a user guideline for testing.
`
    await fs.writeFile(
      path.join(user_guideline_dir, user_guideline_filename),
      user_guideline_content
    )

    // Add files to git and commit in system repo
    await exec('git add .', { cwd: test_repo.system_path })
    await exec('git commit -m "Add test guidelines"', {
      cwd: test_repo.system_path
    })

    // Add files to git and commit in user repo
    await exec('git add .', { cwd: test_repo.user_path })
    await exec('git commit -m "Add test guidelines"', {
      cwd: test_repo.user_path
    })
  })

  afterEach(() => {
    // Clear registry
    clear_registered_directories()

    // Clean up repositories
    if (test_repo) {
      test_repo.cleanup()
    }
  })

  it('should successfully read a system guideline', async () => {
    // Act
    const result = await read_guideline_from_filesystem({
      base_uri: system_guideline_base_uri
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.base_uri).to.equal(system_guideline_base_uri)
    expect(result.absolute_path).to.equal(
      path.join(test_repo.system_path, 'guideline', system_guideline_filename)
    )
    expect(result.content).to.include('# System Guideline')
    expect(result.content).to.include('This is a system guideline for testing.')
  })

  it('should successfully read a user guideline', async () => {
    // Act
    const result = await read_guideline_from_filesystem({
      base_uri: user_guideline_base_uri
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.base_uri).to.equal(user_guideline_base_uri)
    expect(result.absolute_path).to.equal(
      path.join(test_repo.user_path, 'guideline', user_guideline_filename)
    )
    expect(result.content).to.include('# User Guideline')
    expect(result.content).to.include('This is a user guideline for testing.')
  })

  it('should return error when guideline does not exist', async () => {
    // Act
    const result = await read_guideline_from_filesystem({
      base_uri: non_existent_guideline_base_uri
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.exists).to.be.false
    expect(result.error).to.include('does not exist in filesystem')
    expect(result.base_uri).to.equal(non_existent_guideline_base_uri)
  })

  it('should return error for invalid guideline path', async () => {
    // Act
    const result = await read_guideline_from_filesystem({
      base_uri: 'invalid-path'
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should return error when base_uri is not provided', async () => {
    // Act
    const result = await read_guideline_from_filesystem({})

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should read guideline from custom directories via registry', async () => {
    // Arrange
    const custom_test_repo = await create_temp_test_repo()
    const custom_guideline_dir = path.join(
      custom_test_repo.system_path,
      'guideline'
    )
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

    // Re-register with custom directory
    clear_registered_directories()
    register_base_directories({
      system_base_directory: custom_test_repo.system_path,
      user_base_directory: custom_test_repo.user_path
    })

    // Act
    const result = await read_guideline_from_filesystem({
      base_uri: 'sys:guideline/custom-guideline.md'
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.content).to.include('# Custom Guideline')
    expect(result.content).to.include('This is a custom guideline for testing.')

    // Cleanup
    custom_test_repo.cleanup()
  })
})
