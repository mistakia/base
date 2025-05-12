import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import { promisify } from 'util'
import child_process from 'child_process'

import { guideline_exists_in_git } from '#libs-server/guideline/git/guideline-exists-in-git.mjs'
import { create_temp_test_repo } from '#tests/utils/index.mjs'

const exec = promisify(child_process.exec)

describe('guideline_exists_in_git', () => {
  let repo
  const branch = 'main'

  // System guideline paths in the repo
  const system_guideline_dir = 'system/guideline'
  const system_guideline_filename = 'test-guideline.md'
  const system_guideline_path = `${system_guideline_dir}/${system_guideline_filename}`

  // User guideline paths in the repo
  const user_guideline_dir = 'guideline'
  const user_guideline_filename = 'test-user-guideline.md'
  const user_guideline_path = `${user_guideline_dir}/${user_guideline_filename}`

  // Guideline IDs as used by the API functions
  const system_guideline_id = `system/${system_guideline_filename}`
  const user_guideline_id = `user/${user_guideline_filename}`
  const non_existent_guideline_id = 'system/non-existent.md'

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
---

# Test Guideline

This is a test guideline for Git.
`
    await fs.writeFile(
      path.join(repo.path, system_guideline_path),
      system_guideline_content
    )

    // Write test user guideline
    const user_guideline_content = `---
title: "User Guideline"
type: "guideline"
description: "This is a user guideline"
---

# User Guideline

This is a user guideline for Git.
`
    await fs.writeFile(
      path.join(repo.path, user_guideline_path),
      user_guideline_content
    )

    // Add files to git and commit
    await fs.appendFile(
      path.join(repo.path, 'README.md'),
      '\n\nUpdated for guideline tests'
    )
    await fs.writeFile(
      path.join(repo.path, '.gitignore'),
      'node_modules\n.DS_Store\n'
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

  it('should return exists=true when system guideline exists in git', async () => {
    // Act
    const result = await guideline_exists_in_git({
      guideline_id: system_guideline_id,
      branch,
      system_base_directory: repo.path,
      user_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.guideline_id).to.equal(system_guideline_id)
    expect(result.branch).to.equal(branch)
  })

  it('should return exists=true when user guideline exists in git', async () => {
    // Act
    const result = await guideline_exists_in_git({
      guideline_id: user_guideline_id,
      branch,
      system_base_directory: repo.path,
      user_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.true
    expect(result.guideline_id).to.equal(user_guideline_id)
    expect(result.branch).to.equal(branch)
  })

  it('should return exists=false when guideline does not exist', async () => {
    // Act
    const result = await guideline_exists_in_git({
      guideline_id: non_existent_guideline_id,
      branch,
      system_base_directory: repo.path,
      user_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.exists).to.be.false
    expect(result.guideline_id).to.equal(non_existent_guideline_id)
    expect(result.branch).to.equal(branch)
  })

  it('should return error when guideline_id is invalid', async () => {
    // Act
    const result = await guideline_exists_in_git({
      guideline_id: 'invalid-path',
      branch,
      system_base_directory: repo.path,
      user_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should return error when guideline_id is not provided', async () => {
    // Act
    const result = await guideline_exists_in_git({
      branch,
      system_base_directory: repo.path,
      user_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.equal('Guideline ID is required')
  })

  it('should return error when branch is not provided', async () => {
    // Act
    const result = await guideline_exists_in_git({
      guideline_id: system_guideline_id,
      system_base_directory: repo.path,
      user_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.equal('Branch name is required')
  })

  it('should return error when branch does not exist', async () => {
    // Act
    const result = await guideline_exists_in_git({
      guideline_id: system_guideline_id,
      branch: 'non-existent-branch',
      system_base_directory: repo.path,
      user_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.include('does not exist')
  })
})
