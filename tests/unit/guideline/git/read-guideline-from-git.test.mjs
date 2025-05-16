import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import { promisify } from 'util'
import child_process from 'child_process'

import { read_guideline_from_git } from '#libs-server/guideline/git/read-guideline-from-git.mjs'
import { create_temp_test_repo } from '#tests/utils/index.mjs'

const exec = promisify(child_process.exec)

describe('read_guideline_from_git', () => {
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

    // Write test guidelines
    await fs.writeFile(
      path.join(repo.path, system_guideline_base_relative_path),
      system_guideline_content
    )

    await fs.writeFile(
      path.join(repo.path, user_guideline_base_relative_path),
      user_guideline_content
    )

    // Add files to git and commit
    await fs.appendFile(
      path.join(repo.path, 'README.md'),
      '\n\nUpdated for guideline read tests'
    )

    // Execute git commands to add and commit the files
    await exec('git add .', { cwd: repo.path })
    await exec('git commit -m "Add test guidelines for reading"', {
      cwd: repo.path
    })
  })

  after(() => {
    // Clean up temporary repository
    if (repo) {
      repo.cleanup()
    }
  })

  it('should successfully read a system guideline from git', async () => {
    // Act
    const result = await read_guideline_from_git({
      base_relative_path: system_guideline_base_relative_path,
      branch,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.base_relative_path).to.equal(
      system_guideline_base_relative_path
    )
    expect(result.branch).to.equal(branch)
    expect(result.content).to.equal(system_guideline_content)
    expect(result.absolute_path).to.equal(
      path.join(repo.path, system_guideline_base_relative_path)
    )
  })

  it('should successfully read a user guideline from git', async () => {
    // Act
    const result = await read_guideline_from_git({
      base_relative_path: user_guideline_base_relative_path,
      branch,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.base_relative_path).to.equal(
      user_guideline_base_relative_path
    )
    expect(result.branch).to.equal(branch)
    expect(result.content).to.equal(user_guideline_content)
    expect(result.absolute_path).to.equal(
      path.join(repo.path, user_guideline_base_relative_path)
    )
  })

  it('should return error when guideline does not exist in git', async () => {
    // Act
    const result = await read_guideline_from_git({
      base_relative_path: non_existent_guideline_base_relative_path,
      branch,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.exists).to.be.false
    expect(result.error).to.include('does not exist in git branch')
  })

  it('should return error when base_relative_path is invalid', async () => {
    // Act
    const result = await read_guideline_from_git({
      base_relative_path: 'invalid-path',
      branch,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should return error when base_relative_path is not provided', async () => {
    // Act
    const result = await read_guideline_from_git({
      branch,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.equal('Guideline base relative path is required')
  })

  it('should return error when branch is not provided', async () => {
    // Act
    const result = await read_guideline_from_git({
      base_relative_path: system_guideline_base_relative_path,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.equal('Branch name is required')
  })

  it('should return error when branch does not exist', async () => {
    // Act
    const result = await read_guideline_from_git({
      base_relative_path: system_guideline_base_relative_path,
      branch: 'non-existent-branch',
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.include('does not exist')
  })

  it('should handle different repository and guideline types', async () => {
    // Create a test branch with different content
    const feature_branch = 'feature-branch'
    await exec(`git checkout -b ${feature_branch}`, { cwd: repo.path })

    // Modify guideline in the feature branch
    const updated_content = `${system_guideline_content}\n\nUpdated in feature branch.`
    await fs.writeFile(
      path.join(repo.path, system_guideline_base_relative_path),
      updated_content
    )

    await exec('git add .', { cwd: repo.path })
    await exec('git commit -m "Update guideline in feature branch"', {
      cwd: repo.path
    })

    // Switch back to main branch
    await exec('git checkout main', { cwd: repo.path })

    // Act: Read from feature branch
    const result = await read_guideline_from_git({
      base_relative_path: system_guideline_base_relative_path,
      branch: feature_branch,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.content).to.equal(updated_content)
    expect(result.content).to.include('Updated in feature branch')
  })
})
