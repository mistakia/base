import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import { promisify } from 'util'
import child_process from 'child_process'

import { read_activity_from_git } from '#libs-server/activity/git/read-activity-from-git.mjs'
import { create_temp_test_repo } from '#tests/utils/index.mjs'

const exec = promisify(child_process.exec)

describe('read_activity_from_git', () => {
  let repo
  const branch = 'main'

  // System activity paths in the repo
  const system_activity_dir = 'system/activity'
  const system_activity_filename = 'test-activity.md'
  const complex_activity_filename = 'complex-activity.md'
  const system_activity_base_relative_path = `${system_activity_dir}/${system_activity_filename}`
  const complex_activity_base_relative_path = `${system_activity_dir}/${complex_activity_filename}`

  // User activity paths in the repo
  const user_activity_dir = 'activity'
  const user_activity_filename = 'test-user-activity.md'
  const user_activity_base_relative_path = `${user_activity_dir}/${user_activity_filename}`

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
tags: ["test", "git"]
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
tags: ["user", "git"]
---

# User Activity

This is a user activity for Git.
`
    await fs.writeFile(
      path.join(repo.path, user_activity_base_relative_path),
      user_activity_content
    )

    // Write complex activity
    const complex_activity_content = `---
title: "Complex Activity"
type: "activity"
description: "This is a complex activity"
status: "In Progress"
priority: "High"
relations:
  - "relates_to [[activity/other-activity]]"
  - "depends_on [[activity/dependency]]"
observations:
  - "[note] This is a test observation"
  - "[tech] Uses markdown #format"
custom_object:
  key1: "value1"
  key2: "value2"
---

# Complex Activity

This is a complex activity with many properties.
`
    await fs.writeFile(
      path.join(repo.path, complex_activity_base_relative_path),
      complex_activity_content
    )

    // Add files to git and commit
    await fs.appendFile(
      path.join(repo.path, 'README.md'),
      '\n\nUpdated for activity tests'
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

  it('should successfully read a system activity from git', async () => {
    // Act
    const result = await read_activity_from_git({
      base_relative_path: system_activity_base_relative_path,
      branch,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.base_relative_path).to.equal(
      system_activity_base_relative_path
    )
    expect(result.branch).to.equal(branch)
    expect(result.entity_properties).to.include({
      title: 'Test Activity',
      type: 'activity',
      description: 'This is a test activity'
    })
    expect(result.entity_properties.tags).to.be.an('array')
    expect(result.entity_properties.tags).to.include('test')
    expect(result.entity_properties.tags).to.include('git')
    expect(result.entity_content).to.include('# Test Activity')
    expect(result.entity_content).to.include('This is a test activity for Git.')
    expect(result.raw_content).to.be.a('string')
  })

  it('should successfully read a user activity from git', async () => {
    // Act
    const result = await read_activity_from_git({
      base_relative_path: user_activity_base_relative_path,
      branch,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.base_relative_path).to.equal(user_activity_base_relative_path)
    expect(result.branch).to.equal(branch)
    expect(result.entity_properties).to.include({
      title: 'User Activity',
      type: 'activity',
      description: 'This is a user activity'
    })
    expect(result.entity_properties.tags).to.be.an('array')
    expect(result.entity_properties.tags).to.include('user')
    expect(result.entity_properties.tags).to.include('git')
    expect(result.entity_content).to.include('# User Activity')
    expect(result.entity_content).to.include('This is a user activity for Git.')
    expect(result.raw_content).to.be.a('string')
  })

  it('should handle complex activity properties', async () => {
    // Act
    const result = await read_activity_from_git({
      base_relative_path: complex_activity_base_relative_path,
      branch,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.entity_properties.title).to.equal('Complex Activity')
    expect(result.entity_properties.type).to.equal('activity')
    expect(result.entity_properties.status).to.equal('In Progress')
    expect(result.entity_properties.priority).to.equal('High')

    // Check arrays
    expect(result.entity_properties.relations)
      .to.be.an('array')
      .with.lengthOf(2)
    expect(result.entity_properties.observations)
      .to.be.an('array')
      .with.lengthOf(2)

    // Check nested object
    expect(result.entity_properties.custom_object).to.be.an('object')
    expect(result.entity_properties.custom_object.key1).to.equal('value1')
    expect(result.entity_properties.custom_object.key2).to.equal('value2')
  })

  it('should return error when activity does not exist', async () => {
    // Act
    const result = await read_activity_from_git({
      base_relative_path: non_existent_activity_base_relative_path,
      branch,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.include('does not exist')
    expect(result.base_relative_path).to.equal(
      non_existent_activity_base_relative_path
    )
    expect(result.branch).to.equal(branch)
  })

  it('should return error when base_relative_path is invalid', async () => {
    // Act
    const result = await read_activity_from_git({
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
    const result = await read_activity_from_git({
      branch,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.equal('Activity ID is required')
  })

  it('should return error when branch is not provided', async () => {
    // Act
    const result = await read_activity_from_git({
      base_relative_path: system_activity_base_relative_path,
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.equal('Branch name is required')
  })

  it('should return error when branch does not exist', async () => {
    // Act
    const result = await read_activity_from_git({
      base_relative_path: system_activity_base_relative_path,
      branch: 'non-existent-branch',
      root_base_directory: repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.include('does not exist')
  })
})
