import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import { promisify } from 'util'
import child_process from 'child_process'

import { read_guideline_from_git } from '#libs-server/guideline/git/read-guideline-from-git.mjs'
import { clear_registered_directories } from '#libs-server/base-uri/index.mjs'
import { create_temp_test_repo } from '#tests/utils/index.mjs'

const exec = promisify(child_process.exec)

describe('read_guideline_from_git', () => {
  let test_repo
  const branch = 'main'

  // System guideline URIs
  const system_guideline_filename = 'test-guideline.md'
  const system_guideline_base_uri = `sys:guideline/${system_guideline_filename}`

  // User guideline URIs
  const user_guideline_filename = 'test-user-guideline.md'
  const user_guideline_base_uri = `user:guideline/${user_guideline_filename}`

  const non_existent_guideline_base_uri = 'sys:guideline/non-existent.md'

  // Test content
  const system_guideline_content = `---
title: "Test Guideline"
type: "guideline"
description: "This is a test guideline"
tags: ["test", "git"]
---

# Test Guideline

This is a test guideline for Git.
`

  const user_guideline_content = `---
title: "User Guideline"
type: "guideline"
description: "This is a user guideline"
tags: ["user", "git"]
---

# User Guideline

This is a user guideline for Git.
`

  before(async () => {
    // Create test repo with both system and user directories
    test_repo = await create_temp_test_repo()

    // Create system guideline directory
    const system_guideline_dir = path.join(test_repo.system_path, 'guideline')
    await fs.mkdir(system_guideline_dir, { recursive: true })

    // Create user guideline directory
    const user_guideline_dir = path.join(test_repo.user_path, 'guideline')
    await fs.mkdir(user_guideline_dir, { recursive: true })

    // Write test guidelines
    await fs.writeFile(
      path.join(system_guideline_dir, system_guideline_filename),
      system_guideline_content
    )

    await fs.writeFile(
      path.join(user_guideline_dir, user_guideline_filename),
      user_guideline_content
    )

    // Add files to git and commit in system repo
    await exec('git add .', { cwd: test_repo.system_path })
    await exec('git commit -m "Add test guidelines for reading"', {
      cwd: test_repo.system_path
    })

    // Add files to git and commit in user repo
    await exec('git add .', { cwd: test_repo.user_path })
    await exec('git commit -m "Add test guidelines for reading"', {
      cwd: test_repo.user_path
    })
  })

  after(() => {
    // Clear registry
    clear_registered_directories()

    // Clean up repositories
    if (test_repo) {
      test_repo.cleanup()
    }
  })

  it('should successfully read a system guideline from git', async () => {
    // Act
    const result = await read_guideline_from_git({
      base_uri: system_guideline_base_uri,
      branch
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.base_uri).to.equal(system_guideline_base_uri)
    expect(result.branch).to.equal(branch)
    expect(result.raw_content).to.equal(system_guideline_content)
    expect(result.entity_properties).to.be.an('object')
    expect(result.entity_properties.title).to.equal('Test Guideline')
  })

  it('should successfully read a user guideline from git', async () => {
    // Act
    const result = await read_guideline_from_git({
      base_uri: user_guideline_base_uri,
      branch
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.base_uri).to.equal(user_guideline_base_uri)
    expect(result.branch).to.equal(branch)
    expect(result.raw_content).to.equal(user_guideline_content)
    expect(result.entity_properties).to.be.an('object')
    expect(result.entity_properties.title).to.equal('User Guideline')
  })

  it('should return error when guideline does not exist in git', async () => {
    // Act
    const result = await read_guideline_from_git({
      base_uri: non_existent_guideline_base_uri,
      branch
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.include('does not exist in branch')
  })

  it('should return error when base_uri is invalid', async () => {
    // Act
    const result = await read_guideline_from_git({
      base_uri: 'invalid-path',
      branch
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should return error when base_uri is not provided', async () => {
    // Act
    const result = await read_guideline_from_git({
      branch
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.equal('Guideline base_uri is required')
  })

  it('should return error when branch is not provided', async () => {
    // Act
    const result = await read_guideline_from_git({
      base_uri: system_guideline_base_uri
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.equal('Branch name is required')
  })

  it('should return error when branch does not exist', async () => {
    // Act
    const result = await read_guideline_from_git({
      base_uri: system_guideline_base_uri,
      branch: 'non-existent-branch'
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.include('does not exist')
  })

  it('should handle different repository and guideline types', async () => {
    // Create a test branch with different content
    const feature_branch = 'feature-branch'
    await exec(`git checkout -b ${feature_branch}`, {
      cwd: test_repo.system_path
    })

    // Modify guideline in the feature branch
    const updated_content = `${system_guideline_content}\n\nUpdated in feature branch.`
    await fs.writeFile(
      path.join(test_repo.system_path, 'guideline', system_guideline_filename),
      updated_content
    )

    await exec('git add .', { cwd: test_repo.system_path })
    await exec('git commit -m "Update guideline in feature branch"', {
      cwd: test_repo.system_path
    })

    // Switch back to main branch
    await exec('git checkout main', { cwd: test_repo.system_path })

    // Act: Read from feature branch
    const result = await read_guideline_from_git({
      base_uri: system_guideline_base_uri,
      branch: feature_branch
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.raw_content).to.equal(updated_content)
    expect(result.raw_content).to.include('Updated in feature branch')
  })
})
