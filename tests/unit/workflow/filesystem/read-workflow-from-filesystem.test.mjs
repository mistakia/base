import { expect } from 'chai'
import { promises as fs } from 'fs'
import path from 'path'
import config from '#config'

import { read_workflow_from_filesystem } from '#libs-server/workflow/filesystem/read-workflow-from-filesystem.mjs'
import { create_temp_test_directory } from '#tests/utils/index.mjs'
import create_temp_test_repo from '#tests/utils/create-temp-test-repo.mjs'

describe('read_workflow_from_filesystem', () => {
  let test_repo
  let original_system_base_directory
  let original_user_base_directory

  before(async () => {
    // Save original config values
    original_system_base_directory = config.system_base_directory
    original_user_base_directory = config.user_base_directory

    // Create temporary test repository
    test_repo = await create_temp_test_repo()

    // Set config directories to our test repository
    config.system_base_directory = test_repo.path
    config.user_base_directory = test_repo.user_path
  })

  after(() => {
    // Restore original config values
    config.system_base_directory = original_system_base_directory
    config.user_base_directory = original_user_base_directory

    // Clean up temporary repository
    if (test_repo && test_repo.cleanup) {
      test_repo.cleanup()
    }
  })

  it('should successfully read a system workflow', async () => {
    // Arrange
    const workflow_base_relative_path = 'system/workflow/test-workflow.md'
    const workflow_dir = path.join(test_repo.path, 'system', 'workflow')

    const workflow_content = `---
title: "Test Workflow"
type: "workflow"
description: "This is a test workflow"
tags: ["test", "workflow"]
---

# Test Workflow

This is a test workflow content.
`

    await fs.writeFile(
      path.join(workflow_dir, 'test-workflow.md'),
      workflow_content
    )

    // Act
    const result = await read_workflow_from_filesystem({
      base_relative_path: workflow_base_relative_path,
      root_base_directory: test_repo.path
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.base_relative_path).to.equal(workflow_base_relative_path)
    expect(result.absolute_path).to.equal(
      path.join(test_repo.path, workflow_base_relative_path)
    )
    expect(result.entity_properties).to.include({
      title: 'Test Workflow',
      type: 'workflow',
      description: 'This is a test workflow'
    })
    expect(result.entity_properties.tags).to.deep.equal(['test', 'workflow'])
    expect(result.entity_content).to.include('# Test Workflow')
    expect(result.entity_content).to.include('This is a test workflow content.')
    expect(result.raw_content).to.equal(workflow_content)
  })

  it('should successfully read a user workflow', async () => {
    // Arrange
    const workflow_base_relative_path = 'user/workflow/test-user-workflow.md'
    const workflow_dir = path.join(test_repo.user_path, 'workflow')
    await fs.mkdir(workflow_dir, { recursive: true })

    const workflow_content = `---
title: "User Workflow"
type: "workflow"
description: "This is a user workflow"
tags: ["user", "test"]
---

# User Workflow

This is user workflow content.
`

    await fs.writeFile(
      path.join(workflow_dir, 'test-user-workflow.md'),
      workflow_content
    )

    // Act
    const result = await read_workflow_from_filesystem({
      base_relative_path: workflow_base_relative_path,
      root_base_directory: test_repo.path
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.base_relative_path).to.equal(workflow_base_relative_path)
    expect(result.absolute_path).to.equal(
      path.join(test_repo.path, workflow_base_relative_path)
    )
    expect(result.entity_properties).to.include({
      title: 'User Workflow',
      type: 'workflow',
      description: 'This is a user workflow'
    })
    expect(result.entity_properties.tags).to.deep.equal(['user', 'test'])
    expect(result.entity_content).to.include('# User Workflow')
    expect(result.raw_content).to.equal(workflow_content)
  })

  it('should return error when workflow does not exist', async () => {
    // Arrange
    const workflow_base_relative_path =
      'system/workflow/non-existent-workflow.md'

    // Act
    const result = await read_workflow_from_filesystem({
      base_relative_path: workflow_base_relative_path,
      root_base_directory: test_repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.include('does not exist')
    expect(result.base_relative_path).to.equal(workflow_base_relative_path)
  })

  it('should return error when workflow_base_relative_path is invalid', async () => {
    // Act
    const result = await read_workflow_from_filesystem({
      base_relative_path: 'invalid-path',
      root_base_directory: test_repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should return error when workflow_base_relative_path is not provided', async () => {
    // Act
    const result = await read_workflow_from_filesystem({})

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should handle malformed frontmatter gracefully', async () => {
    // Arrange
    const workflow_base_relative_path = 'system/workflow/malformed-workflow.md'
    const system_dir = path.join(test_repo.path, 'system', 'workflow')

    const malformed_content = `---
title: "Malformed Workflow
description: Missing closing quote
---

# Malformed content
`

    await fs.writeFile(
      path.join(system_dir, 'malformed-workflow.md'),
      malformed_content
    )

    // Act
    const result = await read_workflow_from_filesystem({
      base_relative_path: workflow_base_relative_path,
      root_base_directory: test_repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.be.a('string')
  })

  it('should handle workflow without type property', async () => {
    // Arrange
    const workflow_base_relative_path = 'system/workflow/no-type-workflow.md'
    const workflow_dir = path.join(test_repo.path, 'system', 'workflow')

    const no_type_content = `---
title: "No Type Workflow"
description: "Workflow without type"
---

# No Type Workflow
`

    await fs.writeFile(
      path.join(workflow_dir, 'no-type-workflow.md'),
      no_type_content
    )

    // Act
    const result = await read_workflow_from_filesystem({
      base_relative_path: workflow_base_relative_path,
      root_base_directory: test_repo.path
    })

    // Assert
    expect(result.success).to.be.false
    expect(result.error).to.include('No entity type found')
  })

  it('should successfully read the default workflow in git repo', async () => {
    // Act
    const result = await read_workflow_from_filesystem({
      base_relative_path: 'system/workflow/default-workflow.md',
      root_base_directory: test_repo.path
    })

    // Assert
    expect(result.success).to.be.true
    expect(result.entity_properties.type).to.equal('workflow')
    expect(result.entity_properties.title).to.equal('General Purpose Role')
  })
})
