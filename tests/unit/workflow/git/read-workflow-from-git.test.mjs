import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import { promisify } from 'util'
import child_process from 'child_process'

import { read_workflow_from_git } from '#libs-server/workflow/git/read-workflow-from-git.mjs'
import { create_temp_test_repo } from '#tests/utils/index.mjs'
import { register_test_directories } from '#tests/utils/setup-test-directories.mjs'

const exec = promisify(child_process.exec)

describe('read_workflow_from_git', () => {
  let system_repo, user_repo
  let cleanup_registry
  const branch = 'main'

  // System workflow paths in the repo
  const system_workflow_dir = 'workflow'
  const system_workflow_filename = 'test-workflow.md'
  const complex_workflow_filename = 'complex-workflow.md'
  const system_workflow_base_uri = `sys:${system_workflow_dir}/${system_workflow_filename}`
  const complex_workflow_base_uri = `sys:${system_workflow_dir}/${complex_workflow_filename}`

  // User workflow paths in the repo
  const user_workflow_dir = 'workflow'
  const user_workflow_filename = 'test-user-workflow.md'
  const user_workflow_base_uri = `user:${user_workflow_dir}/${user_workflow_filename}`

  const non_existent_workflow_base_uri = 'sys:workflow/non-existent.md'

  before(async () => {
    // Create temporary git repositories
    system_repo = await create_temp_test_repo({ register_directories: false })
    user_repo = await create_temp_test_repo({ register_directories: false })

    // Register directories for URI resolution
    cleanup_registry = register_test_directories({
      system_base_directory: system_repo.system_path,
      user_base_directory: user_repo.user_path
    })

    // Create system workflow directory
    await fs.mkdir(path.join(system_repo.system_path, system_workflow_dir), {
      recursive: true
    })

    // Create user workflow directory
    await fs.mkdir(path.join(user_repo.user_path, user_workflow_dir), {
      recursive: true
    })

    // Write test system workflow
    const system_workflow_content = `---
title: "Test Workflow"
type: "workflow"
description: "This is a test workflow"
tags: ["test", "git"]
---

# Test Workflow

This is a test workflow for Git.
`
    await fs.writeFile(
      path.join(
        system_repo.system_path,
        system_workflow_dir,
        system_workflow_filename
      ),
      system_workflow_content
    )

    // Write test user workflow
    const user_workflow_content = `---
title: "User Workflow"
type: "workflow"
description: "This is a user workflow"
tags: ["user", "git"]
---

# User Workflow

This is a user workflow for Git.
`
    await fs.writeFile(
      path.join(user_repo.user_path, user_workflow_dir, user_workflow_filename),
      user_workflow_content
    )

    // Write complex workflow
    const complex_workflow_content = `---
title: "Complex Workflow"
type: "workflow"
description: "This is a complex workflow"
status: "In Progress"
priority: "High"
relations:
  - "relates_to [[workflow/other-workflow]]"
  - "depends_on [[workflow/dependency]]"
observations:
  - "[note] This is a test observation"
  - "[tech] Uses markdown #format"
custom_object:
  key1: "value1"
  key2: "value2"
---

# Complex Workflow

This is a complex workflow with many properties.
`
    await fs.writeFile(
      path.join(
        system_repo.system_path,
        system_workflow_dir,
        complex_workflow_filename
      ),
      complex_workflow_content
    )

    // Add files to git and commit
    await fs.appendFile(
      path.join(system_repo.system_path, 'README.md'),
      '\n\nUpdated for workflow tests'
    )

    // Execute git commands to add and commit the files
    await exec('git add .', { cwd: system_repo.system_path })
    await exec('git commit -m "Add test workflows"', {
      cwd: system_repo.system_path
    })

    // Also commit user workflow
    await exec('git add .', { cwd: user_repo.user_path })
    await exec('git commit -m "Add test user workflows"', {
      cwd: user_repo.user_path
    })
  })

  after(() => {
    // Clean up temporary repositories and registry
    if (cleanup_registry) {
      cleanup_registry()
    }
    if (system_repo) {
      system_repo.cleanup()
    }
    if (user_repo) {
      user_repo.cleanup()
    }
  })

  it('should successfully read a system workflow from git', async () => {
    // Act
    const result = await read_workflow_from_git({
      base_uri: system_workflow_base_uri,
      branch
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.base_uri).to.equal(system_workflow_base_uri)
    expect(result.branch).to.equal(branch)
    expect(result.entity_properties).to.include({
      title: 'Test Workflow',
      type: 'workflow',
      description: 'This is a test workflow'
    })
    expect(result.entity_properties.tags).to.be.an('array')
    expect(result.entity_properties.tags).to.include('test')
    expect(result.entity_properties.tags).to.include('git')
    expect(result.entity_content).to.include('# Test Workflow')
    expect(result.entity_content).to.include('This is a test workflow for Git.')
    expect(result.raw_content).to.be.a('string')
  })

  it('should successfully read a user workflow from git', async () => {
    // Act
    const result = await read_workflow_from_git({
      base_uri: user_workflow_base_uri,
      branch
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.base_uri).to.equal(user_workflow_base_uri)
    expect(result.branch).to.equal(branch)
    expect(result.entity_properties).to.include({
      title: 'User Workflow',
      type: 'workflow',
      description: 'This is a user workflow'
    })
    expect(result.entity_properties.tags).to.be.an('array')
    expect(result.entity_properties.tags).to.include('user')
    expect(result.entity_properties.tags).to.include('git')
    expect(result.entity_content).to.include('# User Workflow')
    expect(result.entity_content).to.include('This is a user workflow for Git.')
    expect(result.raw_content).to.be.a('string')
  })

  it('should handle complex workflow properties', async () => {
    // Act
    const result = await read_workflow_from_git({
      base_uri: complex_workflow_base_uri,
      branch
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.entity_properties.title).to.equal('Complex Workflow')
    expect(result.entity_properties.type).to.equal('workflow')
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

  it('should return error when workflow does not exist', async () => {
    // Act
    const result = await read_workflow_from_git({
      base_uri: non_existent_workflow_base_uri,
      branch
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.include('does not exist')
    expect(result.base_uri).to.equal(non_existent_workflow_base_uri)
    expect(result.branch).to.equal(branch)
  })

  it('should return error when base_uri is invalid', async () => {
    // Act
    const result = await read_workflow_from_git({
      base_uri: 'invalid-path',
      branch
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should return error when base_uri is not provided', async () => {
    // Act
    const result = await read_workflow_from_git({
      branch
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.equal('Workflow base_uri is required')
  })

  it('should return error when branch is not provided', async () => {
    // Act
    const result = await read_workflow_from_git({
      base_uri: system_workflow_base_uri
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.equal('Branch name is required')
  })
})
