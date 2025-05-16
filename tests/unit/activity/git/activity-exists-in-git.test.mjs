import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import { promisify } from 'util'
import child_process from 'child_process'

import { activity_exists_in_git } from '#libs-server/activity/git/activity-exists-in-git.mjs'
import { create_temp_test_repo } from '#tests/utils/index.mjs'

const exec = promisify(child_process.exec)

describe('activity_exists_in_git', () => {
  let repo
  const branch = 'main'

  // System activity paths in the repo
  const system_activity_dir = 'system/activity'
  const system_activity_filename = 'test-activity.md'
  const system_activity_base_relative_path = `${system_activity_dir}/${system_activity_filename}`

  // User activity paths in the repo
  const user_activity_dir = 'activity'
  const user_activity_filename = 'test-user-activity.md'
  const user_activity_base_relative_path = `${user_activity_dir}/${user_activity_filename}`

  // Activity paths relative to the repo root, used as base_relative_path for the API
  const non_existent_activity_base_relative_path = 'system/non-existent.md'

  before(async () => {
    // Create a temporary git repository
    repo = await create_temp_test_repo()

    // Create system activity directory (should already exist in test repo)
    await fs.mkdir(path.join(repo.path, system_activity_dir), {
      recursive: true
    })

    // Create user activity directory
    await fs.mkdir(path.join(repo.path, user_activity_dir), { recursive: true })

    // Write test system activity
    const system_activity_content = `---
title: "Test Activity"
type: "activity"
description: "This is a test activity"
---

# Test Activity

This is a test activity for Git.
`
    await fs.writeFile(
      path.join(repo.path, system_activity_base_relative_path),
      system_activity_content
    )

    // Write test user activity
    const user_activity_content = `---
title: "User Activity"
type: "activity"
description: "This is a user activity"
---

# User Activity

This is a user activity for Git.
`
    await fs.writeFile(
      path.join(repo.path, user_activity_base_relative_path),
      user_activity_content
    )

    // Add files to git and commit
    await fs.appendFile(
      path.join(repo.path, 'README.md'),
      '\n\nUpdated for activity tests'
    )
    await fs.writeFile(
      path.join(repo.path, '.gitignore'),
      'node_modules\n.DS_Store\n'
    )

    // Execute git commands to add and commit the files
    await exec('git add .', { cwd: repo.path })
    await exec('git commit -m "Add test activities"', { cwd: repo.path })
  })

  after(() => {
    // Clean up temporary repository
    if (repo) {
      repo.cleanup()
    }
  })

  it('should return exists=true when system activity exists in git', async () => {
    // Act
    const result = await activity_exists_in_git({
      base_relative_path: system_activity_base_relative_path,
      branch,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.base_relative_path).to.equal(
      system_activity_base_relative_path
    )
    expect(result.branch).to.equal(branch)
  })

  it('should return exists=true when user activity exists in git', async () => {
    // Act
    const result = await activity_exists_in_git({
      base_relative_path: user_activity_base_relative_path,
      branch,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.base_relative_path).to.equal(user_activity_base_relative_path)
    expect(result.branch).to.equal(branch)
  })

  it('should return exists=false when activity does not exist', async () => {
    // Act
    const result = await activity_exists_in_git({
      base_relative_path: non_existent_activity_base_relative_path,
      branch,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.false
    expect(result.base_relative_path).to.equal(
      non_existent_activity_base_relative_path
    )
    expect(result.branch).to.equal(branch)
  })

  it('should return error when activity_base_relative_path is invalid', async () => {
    // Act
    const result = await activity_exists_in_git({
      base_relative_path: 'invalid-path',
      branch,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.false
    expect(result.error).to.be.undefined
  })

  it('should return error when activity_base_relative_path is not provided', async () => {
    // Act
    const result = await activity_exists_in_git({
      branch,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.equal('Activity ID is required')
  })

  it('should return error when branch is not provided', async () => {
    // Act
    const result = await activity_exists_in_git({
      base_relative_path: system_activity_base_relative_path,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.equal('Branch name is required')
  })

  it('should return error when branch does not exist', async () => {
    // Act
    const result = await activity_exists_in_git({
      base_relative_path: system_activity_base_relative_path,
      branch: 'non-existent-branch',
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.include('does not exist')
  })
})
